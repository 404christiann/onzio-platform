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

export async function cleanupAbandonedStagingMedia(input?: {
  olderThan?: Date;
  clubId?: string;
}): Promise<{ inspected: number; removed: number; failed: number }> {
  const service = createServiceRoleClient();
  const bucket = service.storage.from("onzio-upload-staging");
  if (input?.clubId && !isUuid(input.clubId)) {
    failContract("INVALID_CLUB_ID");
  }
  const retries = await processQueuedMediaCleanup({ clubId: input?.clubId });
  const olderThan =
    input?.olderThan ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  let inspected = 0;
  let removed = 0;
  let failed = 0;

  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Unable to list staging media: ${error.message}`);
      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isFolder = !entry.id && !entry.metadata;
        if (isFolder) {
          await walk(path, depth + 1);
          continue;
        }
        inspected += 1;
        const createdAt = entry.created_at
          ? new Date(entry.created_at)
          : null;
        if (!createdAt || createdAt >= olderThan) continue;
        const { error: removeError } = await bucket.remove([path]);
        if (removeError) {
          failed += 1;
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
        } else {
          removed += 1;
        }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  await walk(input?.clubId?.toLowerCase() ?? "", input?.clubId ? 1 : 0);
  return { inspected: inspected + retries.inspected, removed: removed + retries.removed, failed: failed + retries.failed };
}
