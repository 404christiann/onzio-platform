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
  await service.schema("onzio").from("media_cleanup_queue").upsert(
    {
      club_id: input.clubId,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      reason: input.reason,
      next_attempt_at: new Date().toISOString(),
    },
    { onConflict: "storage_bucket,storage_path" },
  );
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
  return { inspected, removed, failed };
}
