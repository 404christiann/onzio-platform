import { z } from "zod";
import { failContract } from "@/lib/contract-error";
import {
  assertDirectOperatorInvocation,
  assertOperator,
  getOperatorClient,
  isContractSimulation,
  operatorAccessTokenSchema,
  parseOperatorInput,
  type OperatorClient,
  type OperatorDependencies,
  uuidSchema,
  writeOperatorAudit,
} from "@/lib/operator/shared";

const purgeSchema = z.object({
  clubId: uuidSchema,
  operatorAccessToken: operatorAccessTokenSchema,
  exportId: z.string().trim().min(1).max(200).nullable(),
  confirmation: z.string().trim().min(1).max(63),
  invokedFromApplicationRoute: z.boolean().optional(),
});

// Refusals raised by onzio_private.purge_archived_club. Each one rolls the
// whole database purge back, so nothing (rows or Storage) has been removed.
const DATABASE_REFUSALS = new Set([
  "INVALID_OPERATOR_INPUT",
  "CLUB_NOT_FOUND",
  "CONFIRMATION_MISMATCH",
  "CLUB_NOT_ARCHIVED",
  "EXPORT_REQUIRED",
  "PURGE_BLOCKED",
  "PURGE_UNKNOWN_CLUB_TABLE",
  "PURGE_OTHER_CLUB_CHANGED",
  "PURGE_INCOMPLETE",
]);

const STORAGE_BUCKETS = ["onzio-upload-staging", "onzio-media"] as const;

type PurgeResult = {
  status: "purged" | "already_purged";
  club_slug: string;
  audit_event_id?: number;
  rows_deleted?: Record<string, number>;
};

async function listStoragePaths(
  client: OperatorClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listStoragePaths(client, bucket, path)));
      } else {
        paths.push(path);
      }
    }
    if (entries.length < 1000) break;
    offset += entries.length;
  }

  return paths;
}

// Counts into `progress` so a failure part way still reports what went.
async function removeStorage(
  client: OperatorClient,
  clubId: string,
  progress: { removed: number },
): Promise<void> {
  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listStoragePaths(client, bucket, clubId);
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await client.storage.from(bucket).remove(batch);
      if (error) throw new Error(`${bucket}: ${error.message}`);
      progress.removed += batch.length;
    }
  }
}

export async function purgeClub(
  rawInput: z.input<typeof purgeSchema> & {
    dependencies?: OperatorDependencies;
  },
) {
  const dependencies = rawInput.dependencies;
  const input = parseOperatorInput(purgeSchema, rawInput);

  if (!input.exportId) failContract("EXPORT_REQUIRED");
  assertDirectOperatorInvocation(input.invokedFromApplicationRoute);
  const { actorId } = await assertOperator(
    input.operatorAccessToken,
    dependencies,
  );

  if (isContractSimulation(dependencies)) {
    if (input.confirmation !== "alpha") {
      failContract("CONFIRMATION_MISMATCH");
    }
    return {
      purged: true,
      finalAuditOutsideTenant: true,
    };
  }

  const client = getOperatorClient(dependencies);

  // Every database check and delete happens in one transaction, including
  // the export ledger update and the hard_purge audit event.
  const { data, error } = await client
    .schema("onzio")
    .rpc("purge_archived_club", {
      p_club_id: input.clubId,
      p_export_id: input.exportId,
      p_confirmation: input.confirmation,
      p_actor_id: actorId,
    });
  if (error) {
    if (DATABASE_REFUSALS.has(error.message)) {
      failContract(error.message, error.details ?? undefined);
    }
    failContract("PURGE_DATABASE_FAILED", error.message);
  }
  const result = data as PurgeResult;

  // Storage only after the rows are gone for good. The hard_purge event
  // records storage as pending; the outcome goes in its own
  // hard_purge_storage event, so "purged but files still up" can be found
  // by query. A failure leaves the database purge in place; calling
  // purgeClub again with the same export and confirmation retries the
  // Storage removal (already_purged).
  const progress = { removed: 0 };
  const recordStorage = (payload: Record<string, unknown>) =>
    writeOperatorAudit(client, {
      actorId,
      clubId: null,
      operation: "hard_purge_storage",
      resourceType: "purged_club",
      resourceId: input.clubId,
      payload: {
        export_id: input.exportId,
        objects_removed: progress.removed,
        ...payload,
      },
    });

  try {
    await removeStorage(client, input.clubId, progress);
  } catch (storageError) {
    const message =
      storageError instanceof Error ? storageError.message : String(storageError);
    let recorded = true;
    try {
      await recordStorage({ status: "failed", error: message.slice(0, 500) });
    } catch {
      recorded = false;
    }
    failContract(
      "PURGE_STORAGE_FAILED",
      `Club rows are purged but its files are not all removed${
        recorded ? " (recorded as hard_purge_storage failed)" : " and the failure could not be recorded"
      }; run the purge again with the same export to retry Storage. ${message}`,
    );
  }
  const storageAuditEventId = await recordStorage({ status: "removed" });
  const storageObjectsRemoved = progress.removed;

  return {
    clubId: input.clubId,
    purged: true,
    alreadyPurged: result.status === "already_purged",
    exportId: input.exportId,
    auditEventId: result.audit_event_id ?? null,
    rowsDeleted: result.rows_deleted ?? {},
    storageObjectsRemoved,
    storageAuditEventId,
    finalAuditOutsideTenant: true,
  };
}
