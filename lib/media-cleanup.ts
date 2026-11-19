import { failContract } from "@/lib/contract-error";
import { isUuid, parseStoragePath } from "@/lib/storage-path";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export async function queueMediaCleanup(input: {
  clubId: string;
  storageBucket: "onzio-upload-staging" | "onzio-media";
  storagePath: string;
  reason: string;
}): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.schema("onzio").from("media_cleanup_queue").upsert(
    {
      club_id: input.clubId,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      reason: input.reason,
      next_attempt_at: new Date().toISOString(),
      completed_at: null,
      last_error: null,
    },
    { onConflict: "storage_bucket,storage_path" },
  );
  if (error) {
    throw new Error(`Unable to queue media cleanup: ${error.message}`);
  }
}

/** Process a bounded batch from the durable cleanup ledger. Public objects
 * must still be orphaned and unreferenced before each retry. */
export async function processQueuedMediaCleanup(input?: { clubId?: string }): Promise<{
  inspected: number; removed: number; failed: number;
}> {
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  let query = onzio.from("media_cleanup_queue")
    .select("id,club_id,storage_bucket,storage_path,attempts")
    .is("completed_at", null)
    .lte("next_attempt_at", new Date().toISOString());
  if (input?.clubId) query = query.eq("club_id", input.clubId);
  const { data: rows, error } = await query
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(`Unable to load media cleanup retries: ${error.message}`);
  let inspected = 0, removed = 0, failed = 0;
  for (const row of rows ?? []) {
    inspected += 1;
    let failure: string | null = null;
    try {
      const path = parseStoragePath(row.storage_path);
      if (path.clubId !== row.club_id || !["onzio-media", "onzio-upload-staging"].includes(row.storage_bucket)) {
        throw new Error("INVALID_QUEUE_PATH");
      }
      if (row.storage_bucket === "onzio-media") {
        const { data: asset, error: assetError } = await onzio.from("media_assets")
          .select("id,status,deleted_at")
          .eq("club_id", row.club_id)
          .eq("storage_bucket", row.storage_bucket)
          .eq("storage_path", row.storage_path)
          .maybeSingle();
        if (assetError) throw new Error("ASSET_LOOKUP_FAILED");
        if (!asset || asset.status !== "orphaned" || !asset.deleted_at) throw new Error("ASSET_NOT_RETIRED");
        const { data: retirement, error: retirementError } = await onzio.rpc("retire_unreferenced_media_asset", {
          p_club_id: row.club_id, p_asset_id: asset.id, p_actor_id: null,
        });
        if (retirementError || !retirement || (retirement as { status?: string }).status !== "retired") {
          throw new Error("ASSET_REFERENCED");
        }
      }
      const { error: removeError } = await service.storage.from(row.storage_bucket).remove([row.storage_path]);
      if (removeError) throw new Error("STORAGE_DELETE_FAILED");
      const { error: completeError } = await onzio.from("media_cleanup_queue")
        .update({ completed_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null })
        .eq("id", row.id);
      if (completeError) throw new Error("QUEUE_COMPLETION_FAILED");
      removed += 1;
    } catch (caught) {
      failure = caught instanceof Error ? caught.message : "MEDIA_CLEANUP_FAILED";
      const attempts = row.attempts + 1;
      const minutes = Math.min(2 ** Math.min(attempts, 8), 240);
      const { error: retryError } = await onzio.from("media_cleanup_queue")
        .update({ attempts, next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString(), last_error: failure })
        .eq("id", row.id);
      if (retryError) throw new Error(`Unable to schedule media cleanup retry: ${retryError.message}`);
      failed += 1;
    }
  }
  return { inspected, removed, failed };
}

type StorageListEntry = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Storage list page size and multi-path remove batch size. */
export const STAGING_LIST_PAGE_SIZE = 100;
export const STAGING_REMOVE_BATCH_SIZE = 100;
/** Per-run bounds so a huge backlog cannot outlive the function timeout. The
 * next daily cron run picks up whatever one run leaves behind. */
export const STAGING_MAX_FILES_PER_RUN = 2_000;
export const STAGING_MAX_LIST_CALLS_PER_RUN = 200;
export const STAGING_TIME_BUDGET_MS = 40_000;
/** Extra time after the scan budget, only to finish deleting what was already
 * selected. No new delete batch starts after this; the rest waits for the
 * next run. Must stay under the route's maxDuration (60 s). */
export const STAGING_REMOVE_GRACE_MS = 10_000;

export type StagingCleanupResult = {
  inspected: number;
  removed: number;
  failed: number;
  /** True when a per-run bound stopped the scan before every prefix was read,
   * so abandoned files may still be waiting for the next run. */
  hasMore: boolean;
};

export async function cleanupAbandonedStagingMedia(input?: {
  olderThan?: Date;
  clubId?: string;
  maxFilesPerRun?: number;
  maxListCalls?: number;
  timeBudgetMs?: number;
}): Promise<StagingCleanupResult> {
  const service = createServiceRoleClient();
  const bucket = service.storage.from("onzio-upload-staging");
  if (input?.clubId && !isUuid(input.clubId)) {
    failContract("INVALID_CLUB_ID");
  }
  const retries = await processQueuedMediaCleanup({ clubId: input?.clubId });
  const olderThan =
    input?.olderThan ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const maxFiles = input?.maxFilesPerRun ?? STAGING_MAX_FILES_PER_RUN;
  const maxListCalls = input?.maxListCalls ?? STAGING_MAX_LIST_CALLS_PER_RUN;
  const deadline =
    Date.now() + (input?.timeBudgetMs ?? STAGING_TIME_BUDGET_MS);
  const removeDeadline = deadline + STAGING_REMOVE_GRACE_MS;
  let inspected = 0;
  let removed = 0;
  let failed = 0;
  let listCalls = 0;
  let selected = 0;
  let hasMore = false;

  function outOfBudget(): boolean {
    return selected >= maxFiles || listCalls >= maxListCalls || Date.now() >= deadline;
  }

  async function removeInBatches(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += STAGING_REMOVE_BATCH_SIZE) {
      if (Date.now() >= removeDeadline) {
        // Selected files that were not deleted stay eligible for the next run.
        hasMore = true;
        return;
      }
      const batch = paths.slice(i, i + STAGING_REMOVE_BATCH_SIZE);
      const { data: deleted, error: removeError } = await bucket.remove(batch);
      if (!removeError) {
        // Storage returns the objects it actually removed; a path that was
        // already gone is not counted.
        removed += Array.isArray(deleted) ? deleted.length : batch.length;
        continue;
      }
      failed += batch.length;
      for (const path of batch) {
        try {
          const parsed = parseStoragePath(path);
          await queueMediaCleanup({
            clubId: parsed.clubId,
            storageBucket: "onzio-upload-staging",
            storagePath: path,
            reason: "abandoned-staging-object",
          });
        } catch {
          // Invalid legacy paths are reported as failures and left for
          // operator review rather than deleted speculatively.
        }
      }
    }
  }

  // Each prefix is listed completely before anything in it is deleted. Storage
  // listings are offset-based, so deleting mid-scan would pull the next files
  // back into the page that was just read and skip them. Folders are recursed
  // only after the level's scan and deletes, for the same reason.
  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > 3) return;
    const eligible: string[] = [];
    const folders: string[] = [];
    const seen = new Set<string>();
    let offset = 0;
    scan: while (true) {
      if (outOfBudget()) {
        hasMore = true;
        break;
      }
      listCalls += 1;
      const { data, error } = await bucket.list(prefix, {
        limit: STAGING_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Unable to list staging media: ${error.message}`);
      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isFolder = !entry.id && !entry.metadata;
        if (isFolder) {
          if (!seen.has(path)) folders.push(path);
          seen.add(path);
          continue;
        }
        if (seen.has(path)) continue;
        seen.add(path);
        inspected += 1;
        const createdAt = entry.created_at
          ? new Date(entry.created_at)
          : null;
        if (!createdAt || createdAt >= olderThan) continue;
        if (selected >= maxFiles) {
          hasMore = true;
          break scan;
        }
        selected += 1;
        eligible.push(path);
      }
      if (entries.length < STAGING_LIST_PAGE_SIZE) break;
      offset += entries.length;
    }
    await removeInBatches(eligible);
    for (const folder of folders) {
      await walk(folder, depth + 1);
    }
  }

  await walk(input?.clubId?.toLowerCase() ?? "", input?.clubId ? 1 : 0);
  return {
    inspected: inspected + retries.inspected,
    removed: removed + retries.removed,
    failed: failed + retries.failed,
    hasMore,
  };
}
