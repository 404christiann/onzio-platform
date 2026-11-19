/** Local script helper (RC-ADMIN-10e). Since RC-ADMIN-10b, publishing media consumes a one-time
 * reservation that the authorize route makes first. Scripts that call publishAuthorizedMedia
 * directly reserve through the same reserveMediaUpload, then publish.
 *
 * Reruns: a published asset is returned by publishAuthorizedMedia's own idempotent path before
 * any reservation is read, so the reservation is skipped for it (no quota spent).
 *
 * Leftover reservations (only when the Supabase URL and database URL are both loopback, where
 * onzio_private can be read through pg): a live unconsumed reservation for this club and upload
 * id is reused; an expired unconsumed one is deleted and re-reserved; a consumed one, or one that
 * belongs to another club, is never touched. On a hosted host no SQL runs: reserve is called and
 * anything but a clean "reserved" result is rethrown, so a rerun that finds a leftover fails
 * loudly instead of guessing.
 *
 * Limits: the default is 60 uploads per hour per club. On a quota or rate refusal on loopback,
 * the club's row in onzio_private.club_media_limits is raised (local test data) and the reserve
 * retried once. The migration and the defaults are never changed. Import it as
 * "@/scripts/lib/publish-with-reservation" so the path also works from scripts/_rcv. */
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

function localSqlUrl(): string | null {
  const dbUrl = process.env.SUPABASE_DB_URL;
  return isLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL) && isLoopback(dbUrl) ? dbUrl! : null;
}

async function withLocalSql<T>(run: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = localSqlUrl();
  if (!url) throw new Error("Local SQL is only available on loopback");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function raiseLocalLimits(clubId: string): Promise<void> {
  await withLocalSql(async (client) => {
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
  });
}


export type LeftoverReservation = {
  clubId: string;
  consumed: boolean;
  expired: boolean;
};

export type PublishDeps = {
  /** True when the Supabase URL and database URL are both loopback. */
  localSql: () => boolean;
  alreadyPublished: (a: MediaAuthorization) => Promise<boolean>;
  findReservation: (uploadId: string) => Promise<LeftoverReservation | null>;
  /** Deletes only an unconsumed, expired reservation for this exact id and club. */
  deleteExpiredReservation: (uploadId: string, clubId: string) => Promise<void>;
  raiseLimits: (clubId: string) => Promise<void>;
  reserve: (a: MediaAuthorization) => Promise<unknown>;
  publish: (a: MediaAuthorization) => ReturnType<typeof publishAuthorizedMedia>;
};

const defaultDeps: PublishDeps = {
  localSql: () => localSqlUrl() !== null,
  alreadyPublished: async (authorization) => {
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
  },
  findReservation: (uploadId) =>
    withLocalSql(async (client) => {
      const { rows } = await client.query(
        `select club_id, consumed_at is not null as consumed, expires_at <= now() as expired
           from onzio_private.media_upload_reservations where id = $1`,
        [uploadId],
      );
      return rows[0]
        ? { clubId: rows[0].club_id as string, consumed: rows[0].consumed as boolean, expired: rows[0].expired as boolean }
        : null;
    }),
  deleteExpiredReservation: (uploadId, clubId) =>
    withLocalSql(async (client) => {
      await client.query(
        `delete from onzio_private.media_upload_reservations
          where id = $1 and club_id = $2 and consumed_at is null and expires_at <= now()`,
        [uploadId, clubId],
      );
    }),
  raiseLimits: raiseLocalLimits,
  reserve: (authorization) =>
    reserveMediaUpload({
      clubId: authorization.clubId,
      actorId: authorization.actorId,
      uploadId: authorization.uploadId,
      surface: authorization.surface,
      kind: authorization.kind,
      stagingPath: authorization.stagingPath,
      claimedSize: authorization.claimedSize,
    }),
  publish: publishAuthorizedMedia,
};

export async function publishWithReservation(
  authorization: MediaAuthorization,
  deps: PublishDeps = defaultDeps,
) {
  // A path outside the club (negative tests) cannot be reserved; publish refuses it itself.
  const ownPath = authorization.stagingPath.startsWith(`${authorization.clubId}/`);
  if (!ownPath || (await deps.alreadyPublished(authorization))) {
    return deps.publish(authorization);
  }
  const local = deps.localSql();
  if (local) {
    const leftover = await deps.findReservation(authorization.uploadId);
    if (leftover && leftover.clubId === authorization.clubId) {
      if (leftover.consumed) return deps.publish(authorization); // never touched; publish reports it
      if (!leftover.expired) return deps.publish(authorization); // live: publish consumes it
      await deps.deleteExpiredReservation(authorization.uploadId, authorization.clubId);
    }
  }
  try {
    await deps.reserve(authorization);
  } catch (error) {
    if (!local || !(error instanceof ContractError && QUOTA_CODES.has(error.code))) throw error;
    await deps.raiseLimits(authorization.clubId);
    await deps.reserve(authorization);
  }
  return deps.publish(authorization);
}
