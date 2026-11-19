/** Local script helper (RC-ADMIN-10e). Since RC-ADMIN-10b, publishing media consumes a one-time
 * reservation that the authorize route makes first. Scripts that call publishAuthorizedMedia
 * directly reserve through the same reserveMediaUpload, then publish.
 *
 * Reruns: a published asset is returned by publishAuthorizedMedia's own idempotent path before
 * any reservation is read, so the reservation is skipped for it (no quota spent). An unused
 * reservation left by an earlier run (duplicate id) is reused by the publish.
 *
 * Limits: the default is 60 uploads per hour per club. On a quota or rate refusal, and only when
 * the Supabase URL and database URL are both loopback, this raises the club's row in
 * onzio_private.club_media_limits (local test data) and retries once. The migration and the
 * defaults are never changed. Import it as "@/scripts/lib/publish-with-reservation" so the path
 * also works from the scripts/_rcv copy that verify-rc-admin runs. */
import pg from "pg";
import { ContractError } from "@/lib/contract-error";
import { publishAuthorizedMedia, type MediaAuthorization } from "@/lib/media-processing";
import { reserveMediaUpload } from "@/lib/media-quota";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const QUOTA_CODES = new Set([
  "MEDIA_RATE_LIMITED",
  "MEDIA_QUOTA_BYTES_EXCEEDED",
  "MEDIA_QUOTA_FILES_EXCEEDED",
]);
const LOCAL_LIMITS = {
  maxBytes: 20 * 1024 ** 3,
  maxAssets: 20000,
  maxUploadsPerHour: 100000,
  maxUploadsPerDay: 100000,
  maxOpenReservations: 1000,
};

function isLoopback(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return LOOPBACK.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

async function raiseLocalLimits(clubId: string): Promise<boolean> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!isLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL) || !isLoopback(dbUrl)) return false;
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(
      `insert into onzio_private.club_media_limits
         (club_id, max_bytes, max_assets, max_uploads_per_hour, max_uploads_per_day, max_open_reservations, note, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'local seed override (RC-ADMIN-10e)', now())
       on conflict (club_id) do update set
         max_bytes = excluded.max_bytes, max_assets = excluded.max_assets,
         max_uploads_per_hour = excluded.max_uploads_per_hour,
         max_uploads_per_day = excluded.max_uploads_per_day,
         max_open_reservations = excluded.max_open_reservations,
         note = excluded.note, updated_at = now()`,
      [
        clubId,
        LOCAL_LIMITS.maxBytes,
        LOCAL_LIMITS.maxAssets,
        LOCAL_LIMITS.maxUploadsPerHour,
        LOCAL_LIMITS.maxUploadsPerDay,
        LOCAL_LIMITS.maxOpenReservations,
      ],
    );
  } finally {
    await client.end();
  }
  return true;
}

async function alreadyPublished(authorization: MediaAuthorization): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .schema("onzio")
    .from("media_assets")
    .select("id")
    .eq("id", authorization.uploadId)
    .eq("club_id", authorization.clubId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Unable to check media finalization: ${error.message}`);
  return Boolean(data);
}

async function reserve(authorization: MediaAuthorization): Promise<void> {
  try {
    await reserveMediaUpload({
      clubId: authorization.clubId,
      actorId: authorization.actorId,
      uploadId: authorization.uploadId,
      surface: authorization.surface,
      kind: authorization.kind,
      stagingPath: authorization.stagingPath,
      claimedSize: authorization.claimedSize,
    });
  } catch (error) {
    // An earlier run left this id reserved (and maybe unused): let publish try to consume it.
    if (
      error instanceof ContractError &&
      error.code === "MEDIA_QUOTA_UNAVAILABLE" &&
      /duplicate key/i.test(error.message)
    ) {
      return;
    }
    throw error;
  }
}

export async function publishWithReservation(authorization: MediaAuthorization) {
  // A path outside the club (negative tests) cannot be reserved; publish refuses it itself.
  const ownPath = authorization.stagingPath.startsWith(`${authorization.clubId}/`);
  if (ownPath && !(await alreadyPublished(authorization))) {
    try {
      await reserve(authorization);
    } catch (error) {
      if (
        !(error instanceof ContractError && QUOTA_CODES.has(error.code)) ||
        !(await raiseLocalLimits(authorization.clubId))
      ) {
        throw error;
      }
      await reserve(authorization);
    }
  }
  return publishAuthorizedMedia(authorization);
}
