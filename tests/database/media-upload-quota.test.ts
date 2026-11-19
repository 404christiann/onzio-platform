import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { validTransparentPng } from "../fixtures/media";
import { expectPostgrestError } from "../helpers/database-security";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createFreshLocalClient } from "../helpers/mfa";
import { createLocalClients, type LocalClients } from "../helpers/supabase";

// RC-ADMIN-10b: per-club media quota and upload rate limit, enforced in one
// service-role RPC under a per-club lock (onzio.reserve_media_upload), and the
// one-time reservation that finalize consumes
// (onzio.consume_media_upload_reservation). Defaults approved by Christian on
// 2026-11-18: 2 GiB, 2,000 files, 60 uploads an hour, 300 a day, 40 open.

const CLUB = CLUB_IDS.charlie;
const ACTOR: string = USER_IDS.ownerAal2;
const db = new Client(localPostgresConfig());
let clients: LocalClients;
const insertedAssets: string[] = [];

type Reserve = {
  clubId?: string;
  uploadId?: string;
  surface?: string;
  kind?: "photo" | "graphic";
  claimedSize?: number;
  extension?: "jpg" | "png" | "webp";
};

function reservation(input: Reserve = {}) {
  const uploadId = input.uploadId ?? randomUUID();
  const clubId = input.clubId ?? CLUB;
  const surface = input.surface ?? "homepage";
  return {
    p_club_id: clubId,
    p_actor_id: ACTOR,
    p_upload_id: uploadId,
    p_surface: surface,
    p_kind: input.kind ?? "photo",
    p_staging_path: `${clubId}/${surface}/${uploadId}.${input.extension ?? "jpg"}`,
    p_claimed_size: input.claimedSize ?? 1_000_000,
  };
}

async function reserve(input: Reserve = {}) {
  const args = reservation(input);
  const { data, error } = await clients.service.rpc("reserve_media_upload", args);
  expect(error).toBeNull();
  return { args, data: data as Record<string, any> };
}

async function consume(args: ReturnType<typeof reservation>, actualSize = args.p_claimed_size) {
  const { data, error } = await clients.service.rpc("consume_media_upload_reservation", {
    p_upload_id: args.p_upload_id,
    p_club_id: args.p_club_id,
    p_actor_id: args.p_actor_id,
    p_staging_path: args.p_staging_path,
    p_actual_size: actualSize,
  });
  expect(error).toBeNull();
  return data as Record<string, any>;
}

async function override(limits: Record<string, number>) {
  const columns = Object.keys(limits);
  await db.query(
    `insert into onzio_private.club_media_limits (club_id, ${columns.join(",")})
     values ($1, ${columns.map((_, i) => `$${i + 2}`).join(",")})
     on conflict (club_id) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(",")}`,
    [CLUB, ...Object.values(limits)],
  );
}

async function publishedAsset(byteSize: number) {
  const id = randomUUID();
  await db.query(
    `insert into onzio.media_assets
      (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
     values ($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',$4,100,100,$5,'published',now())`,
    [id, CLUB, `${CLUB}/homepage/${id}.webp`, byteSize, "d".repeat(64)],
  );
  insertedAssets.push(id);
}

beforeAll(async () => {
  assertSafeTestEnvironment();
  clients = createLocalClients();
  await db.connect();
});

afterEach(async () => {
  await db.query("delete from onzio_private.media_upload_reservations where club_id = any($1)", [[CLUB, CLUB_IDS.bravo]]);
  await db.query("delete from onzio_private.club_media_limits where club_id = any($1)", [[CLUB, CLUB_IDS.bravo]]);
  if (insertedAssets.length) {
    await db.query("delete from onzio.media_assets where id = any($1)", [insertedAssets.splice(0)]);
  }
});

afterAll(async () => {
  await db.end();
});

describe("media quota defaults", () => {
  it("uses the approved defaults when a club has no override row", async () => {
    const { data, error } = await clients.service.rpc("media_usage", { p_club_id: CLUB });
    expect(error).toBeNull();
    expect(data.limits).toEqual({
      maxBytes: 2147483648,
      maxAssets: 2000,
      maxUploadsPerHour: 60,
      maxUploadsPerDay: 300,
      maxOpenReservations: 40,
    });
  });

  it("lets an override row change one limit and keep the other defaults", async () => {
    await override({ max_assets: 5000 });
    const { data } = await clients.service.rpc("media_usage", { p_club_id: CLUB });
    expect(data.limits.maxAssets).toBe(5000);
    expect(data.limits.maxBytes).toBe(2147483648);
  });
});

describe("reserve_media_upload", () => {
  it("reserves an upload and counts it as open until it is consumed", async () => {
    await publishedAsset(400_000);
    const { args, data } = await reserve({ claimedSize: 1_000_000 });
    expect(data.status).toBe("reserved");
    expect(typeof data.expiresAt).toBe("number");
    expect(data.expiresAt - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(data.expiresAt - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 5_000);

    let usage = (await clients.service.rpc("media_usage", { p_club_id: CLUB })).data;
    expect(usage).toMatchObject({
      publishedAssets: 1,
      publishedBytes: 400_000,
      openReservations: 1,
      openBytes: 1_000_000,
      uploadsLastHour: 1,
      uploadsLastDay: 1,
    });

    expect(await consume(args)).toEqual({ status: "consumed" });
    usage = (await clients.service.rpc("media_usage", { p_club_id: CLUB })).data;
    expect(usage).toMatchObject({ openReservations: 0, openBytes: 0, uploadsLastHour: 1 });
  });

  it("refuses an upload that would go over the club's bytes", async () => {
    await override({ max_bytes: 1_500_000 });
    await publishedAsset(600_000);
    const { data } = await reserve({ claimedSize: 1_000_000 });
    expect(data).toEqual({ status: "bytes" });
    const { rows } = await db.query("select count(*)::int as n from onzio_private.media_upload_reservations where club_id=$1", [CLUB]);
    expect(rows[0].n).toBe(0);
  });

  it("refuses an upload that would go over the club's file count", async () => {
    await override({ max_assets: 2 });
    await publishedAsset(1000);
    expect((await reserve()).data.status).toBe("reserved");
    expect((await reserve()).data).toEqual({ status: "files" });
  });

  it("limits open reservations and says when to retry", async () => {
    await override({ max_open_reservations: 2 });
    await reserve();
    await reserve();
    const { data } = await reserve();
    expect(data.status).toBe("rate");
    expect(data.limit).toBe("open");
    expect(data.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(data.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  it("limits uploads per rolling hour, counting consumed ones too", async () => {
    await override({ max_uploads_per_hour: 2 });
    await consume((await reserve()).args);
    await consume((await reserve()).args);
    const { data } = await reserve();
    expect(data.status).toBe("rate");
    expect(data.limit).toBe("hour");
    expect(data.retryAfterSeconds).toBeGreaterThan(3500);
    expect(data.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it("limits uploads per rolling day", async () => {
    await override({ max_uploads_per_day: 1 });
    await db.query(
      `insert into onzio_private.media_upload_reservations
        (id,club_id,actor_id,surface,kind,staging_path,claimed_size,issued_at,expires_at,consumed_at,outcome)
       select id, $1::uuid, $2::uuid, 'homepage', 'photo', $1::text || '/homepage/' || id || '.jpg', 1000,
              now() - interval '2 hours', now() - interval '2 hours' + interval '5 minutes',
              now() - interval '2 hours', 'consumed'
       from (select gen_random_uuid() as id) g`,
      [CLUB, ACTOR],
    );
    const { data } = await reserve();
    expect(data.status).toBe("rate");
    expect(data.limit).toBe("day");
    expect(data.retryAfterSeconds).toBeGreaterThan(21 * 3600);
  });

  it("checks the quota before the rate, so a full club is not told to wait", async () => {
    await override({ max_assets: 1, max_open_reservations: 1 });
    await reserve();
    expect((await reserve()).data).toEqual({ status: "files" });
  });

  it("keeps the count exact when many uploads arrive at once", async () => {
    await override({ max_open_reservations: 5 });
    const results = await Promise.all(Array.from({ length: 12 }, () => reserve()));
    expect(results.filter((r) => r.data.status === "reserved")).toHaveLength(5);
    const { rows } = await db.query(
      "select count(*)::int as n from onzio_private.media_upload_reservations where club_id=$1",
      [CLUB],
    );
    expect(rows[0].n).toBe(5);
  });

  it("drops a club's reservations older than 48 hours when it reserves", async () => {
    const oldId = randomUUID();
    await db.query(
      `insert into onzio_private.media_upload_reservations
        (id,club_id,actor_id,surface,kind,staging_path,claimed_size,issued_at,expires_at)
       values ($1,$2,$3,'homepage','photo',$4,1000,now() - interval '3 days',now() - interval '3 days' + interval '5 minutes')`,
      [oldId, CLUB, ACTOR, `${CLUB}/homepage/${oldId}.jpg`],
    );
    await reserve();
    const { rows } = await db.query("select 1 from onzio_private.media_upload_reservations where id=$1", [oldId]);
    expect(rows).toHaveLength(0);
  });

  it("rejects a staging path that is not this club, surface and upload id", async () => {
    const args = reservation();
    const { error } = await clients.service.rpc("reserve_media_upload", {
      ...args,
      p_staging_path: `${CLUB_IDS.bravo}/homepage/${args.p_upload_id}.jpg`,
    });
    expect(error?.code).toBe("23514");
  });

  it("rejects a graphic claimed over 5 MB", async () => {
    const { error } = await clients.service.rpc(
      "reserve_media_upload",
      reservation({ kind: "graphic", claimedSize: 5 * 1024 * 1024 + 1 }),
    );
    expect(error?.code).toBe("23514");
  });
});

describe("consume_media_upload_reservation", () => {
  it("is one-time", async () => {
    const { args } = await reserve();
    expect(await consume(args)).toEqual({ status: "consumed" });
    expect(await consume(args)).toEqual({ status: "used" });
  });

  it("refuses a reservation for another club, actor or path", async () => {
    const { args } = await reserve();
    expect(await consume({ ...args, p_club_id: CLUB_IDS.bravo })).toEqual({ status: "mismatch" });
    expect(await consume({ ...args, p_actor_id: USER_IDS.adminAal2 })).toEqual({ status: "mismatch" });
    expect(await consume({ ...args, p_staging_path: `${CLUB}/homepage/${randomUUID()}.jpg` })).toEqual({ status: "mismatch" });
    expect(await consume(args)).toEqual({ status: "consumed" });
  });

  it("refuses an expired reservation and closes it", async () => {
    const { args } = await reserve();
    await db.query(
      "update onzio_private.media_upload_reservations set issued_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' where id=$1",
      [args.p_upload_id],
    );
    expect(await consume(args)).toEqual({ status: "expired" });
    const { rows } = await db.query("select outcome from onzio_private.media_upload_reservations where id=$1", [args.p_upload_id]);
    expect(rows[0].outcome).toBe("expired");
  });

  it("refuses staged bytes larger than the size claimed at authorize", async () => {
    const { args } = await reserve({ claimedSize: 1000 });
    expect(await consume(args, 1001)).toEqual({ status: "too-large" });
    expect(await consume(args)).toEqual({ status: "used" });
  });

  it("returns missing for an upload that was never reserved", async () => {
    expect(await consume(reservation())).toEqual({ status: "missing" });
  });
});

describe("who can reach the quota", () => {
  it("keeps the RPCs and tables away from anon and signed-in users", async () => {
    const session = await createFreshLocalClient({ email: "owner-aal2@alpha.local", userId: USER_IDS.ownerAal2 });
    try {
      for (const client of [clients.anon, session.client.schema("onzio")]) {
        for (const [fn, args] of [
          ["reserve_media_upload", reservation({ clubId: CLUB_IDS.alpha })],
          ["consume_media_upload_reservation", { p_upload_id: randomUUID(), p_club_id: CLUB_IDS.alpha, p_actor_id: ACTOR, p_staging_path: "x", p_actual_size: 1 }],
          ["media_usage", { p_club_id: CLUB_IDS.alpha }],
        ] as const) {
          const { error } = await client.rpc(fn, args);
          expectPostgrestError(error, "42501", `${fn} must be refused`);
        }
      }
    } finally {
      await session.cleanup();
    }
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["media_upload_reservations", "club_media_limits"]) {
        await db.query("begin");
        try {
          await db.query(`set local role ${role}`);
          await expect(db.query(`select 1 from onzio_private.${table} limit 1`), `${role} reads ${table}`)
            .rejects.toMatchObject({ code: "42501" });
        } finally {
          await db.query("rollback");
        }
      }
    }
  });
});

describe("finalize consumes the reservation", () => {
  async function stage(bytes: Buffer) {
    const { supabaseUrl } = assertSafeTestEnvironment();
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
    const uploadId = randomUUID();
    const stagingPath = `${CLUB}/programs/${uploadId}.png`;
    const { error } = await clients.service.storage
      .from("onzio-upload-staging")
      .upload(stagingPath, bytes, { contentType: "image/png", upsert: true });
    expect(error?.message).toBeUndefined();
    return {
      version: 1 as const,
      uploadId,
      clubId: CLUB,
      actorId: ACTOR,
      surface: "programs" as const,
      kind: "photo" as const,
      fileName: "slide.png",
      mimeType: "image/png",
      claimedSize: bytes.length,
      stagingPath,
      expiresAt: Date.now() + 60_000,
    };
  }

  async function cleanupPublished(storagePath?: string, assetId?: string) {
    if (assetId) await db.query("delete from onzio.media_assets where id=$1", [assetId]);
    if (storagePath) await clients.service.storage.from("onzio-media").remove([storagePath]);
  }

  it("publishes once and refuses an upload that was never reserved", async () => {
    const { publishAuthorizedMedia } = await import("@/lib/media-processing");
    const bytes = validTransparentPng();
    const authorization = await stage(bytes);
    await expect(publishAuthorizedMedia(authorization)).rejects.toMatchObject({ code: "MEDIA_RESERVATION_MISSING" });
    await clients.service.storage.from("onzio-upload-staging").remove([authorization.stagingPath]);
  });

  it("publishes a reserved upload, consumes the reservation, and stays idempotent", async () => {
    const { publishAuthorizedMedia } = await import("@/lib/media-processing");
    const bytes = validTransparentPng();
    const authorization = await stage(bytes);
    await reserve({ uploadId: authorization.uploadId, surface: "programs", extension: "png", claimedSize: bytes.length });
    const published = await publishAuthorizedMedia(authorization);
    try {
      expect(published.status).toBe("finalized");
      const { rows } = await db.query("select outcome from onzio_private.media_upload_reservations where id=$1", [authorization.uploadId]);
      expect(rows[0].outcome).toBe("consumed");
      const again = await publishAuthorizedMedia(authorization);
      expect(again.idempotent).toBe(true);
    } finally {
      await cleanupPublished(published.storagePath, published.assetId);
    }
  });

  it("refuses staged bytes larger than the reservation and removes them", async () => {
    const { publishAuthorizedMedia } = await import("@/lib/media-processing");
    const bytes = validTransparentPng();
    const authorization = await stage(bytes);
    await reserve({ uploadId: authorization.uploadId, surface: "programs", extension: "png", claimedSize: bytes.length - 1 });
    await expect(publishAuthorizedMedia(authorization)).rejects.toMatchObject({ code: "MEDIA_SIZE_MISMATCH" });
    const { data } = await clients.service.storage.from("onzio-upload-staging").list(`${CLUB}/programs`, { search: authorization.uploadId });
    expect(data ?? []).toHaveLength(0);
  });
});

describe("reserveMediaUpload maps the RPC to contract errors", () => {
  it("returns the reservation, or throws the quota codes", async () => {
    const { supabaseUrl } = assertSafeTestEnvironment();
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
    const { reserveMediaUpload } = await import("@/lib/media-quota");
    const input = (claimedSize = 1000) => {
      const uploadId = randomUUID();
      return {
        clubId: CLUB, actorId: ACTOR, uploadId, surface: "homepage", kind: "photo" as const,
        stagingPath: `${CLUB}/homepage/${uploadId}.jpg`, claimedSize,
      };
    };
    const ok = await reserveMediaUpload(input());
    expect(ok.expiresAt).toBeGreaterThan(Date.now());

    await override({ max_bytes: 5000 });
    await expect(reserveMediaUpload(input(10_000))).rejects.toMatchObject({ code: "MEDIA_QUOTA_BYTES_EXCEEDED" });
    await override({ max_bytes: 2147483648, max_assets: 1 });
    await expect(reserveMediaUpload(input())).rejects.toMatchObject({ code: "MEDIA_QUOTA_FILES_EXCEEDED" });
    await override({ max_assets: 2000, max_uploads_per_hour: 1 });
    await expect(reserveMediaUpload(input())).rejects.toMatchObject({ code: "MEDIA_RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
  });
});
