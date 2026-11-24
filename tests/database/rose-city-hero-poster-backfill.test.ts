import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";

// RC-HERO-POSTER-05: runs the rehearsal and commit files as written, inside one rolled-back transaction.

const DIR = resolve(__dirname, "../../scripts/operator-sql");
const ORIGINAL = "d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91";
const LIVE = "f76d5e76-0000-4000-8000-000000000001";
const HAND_ALT = "Hand-written description";
let db: Client;
let handSet: string;

async function asset(): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
     values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,1920,1080,$4,'published',now())`,
    [id, ROSE_CITY_CLUB_ID, `${ROSE_CITY_CLUB_ID}/homepage/${id}.webp`, "e".repeat(64)],
  );
  return id;
}

async function run(kind: "rehearsal" | "commit"): Promise<Record<string, unknown>> {
  await db.query("reset role");
  const sql = readFileSync(resolve(DIR, `rose-city-hero-poster-backfill.${kind}.sql`), "utf8")
    .replace(/^begin;$/m, "savepoint operator_sql;")
    .replace(/^commit;$/m, "release savepoint operator_sql;")
    .replace(/^rollback;$/m, "rollback to savepoint operator_sql;");
  const results = (await db.query(sql)) as unknown as Array<{ rows: Array<Record<string, unknown>> }>;
  const readBack = results.find((result) => result.rows?.[0] && "result" in result.rows[0]);
  if (!readBack) throw new Error("operator SQL returned no read-back row");
  return readBack.rows[0];
}

async function state() {
  return (await db.query(
    `select r.hero_poster_media_asset_id as live, r.previous_hero_poster_media_asset_id as previous, r.presentation_config as config,
       (select revision::text from onzio_private.homepage_revisions where club_id = $1) as revision,
       p.poster_due_at, p.poster_attempts,
       (select count(*)::int from onzio.audit_events where club_id = $1 and operation = 'manual.hero_poster_backfill') as audits
     from onzio.homepage_revamp_content r left join onzio_private.hero_video_pending p on p.club_id = r.club_id
     where r.club_id = $1`, [ROSE_CITY_CLUB_ID],
  )).rows[0];
}

async function seed(config: Record<string, unknown>, pending: { guid: string; phase: string } | null) {
  const record = cinematicHomepageStorageRecord(defaultCinematicHomepageContent());
  await db.query("delete from onzio.homepage_revamp_content where club_id=$1", [ROSE_CITY_CLUB_ID]);
  await db.query(
    "insert into onzio.homepage_revamp_content(club_id,content,presentation_config,hero_poster_media_asset_id) values($1,$2,$3,$4)",
    [ROSE_CITY_CLUB_ID, JSON.stringify(record.content), JSON.stringify(config), handSet],
  );
  await db.query("delete from onzio_private.hero_video_pending where club_id=$1", [ROSE_CITY_CLUB_ID]);
  if (pending) {
    await db.query(
      `insert into onzio_private.hero_video_pending(club_id,video_guid,collection_id,phase,deadline_at,landed_at)
       values($1,$2,'col-rc',$3,$4,now())`,
      [ROSE_CITY_CLUB_ID, pending.guid, pending.phase, pending.phase === "preparing" ? new Date(Date.now() + 3_600_000) : null],
    );
  }
}
const liveConfig = (extra: Record<string, unknown> = {}) => ({
  heroVideoGuid: LIVE, heroVideoLibraryId: "723074", previousHeroVideoGuid: ORIGINAL, artworkAlt: { heroPoster: HAND_ALT }, ...extra,
});

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  await db.query(
    `insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier, kind)
     values ($1, 'rose-city', 'Rose City FC', 'active', 'live', 'pro', 'demo') on conflict (id) do nothing`, [ROSE_CITY_CLUB_ID],
  );
  handSet = await asset();
  await seed(liveConfig(), { guid: LIVE, phase: "live" });
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("Rose City hero poster backfill", () => {
  it("copies the hand-set poster and alt into the previous slot, flags the live video, and records one audit event", async () => {
    const before = await state();
    const result = await run("commit");
    expect(result).toMatchObject({ club_slug: "rose-city", poster_flagged: true, poster_attempts: 0, pending_phase: "live", all_ok: true });
    expect(String(result.result)).toBe("changed: previous poster set, poster flagged for the daily job");
    const after = await state();
    expect(after.live).toBe(handSet);
    expect(after.previous).toBe(handSet);
    expect(after.config.previousHeroPosterAlt).toBe(HAND_ALT);
    expect(after.config.artworkAlt.heroPoster).toBe(HAND_ALT);
    expect(after.poster_due_at).not.toBeNull();
    expect(after.audits).toBe(1);
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + BigInt(1));
  });

  it("a rerun is a no-op while the flag is waiting: nothing written, no second audit event, no revision bump", async () => {
    await run("commit");
    const settled = await state();
    const again = await run("commit");
    expect(String(again.result)).toBe("no-op: already flagged");
    const after = await state();
    expect(after.audits).toBe(1);
    expect(after.revision).toBe(settled.revision);
    expect(after.poster_due_at).toEqual(settled.poster_due_at);
  });

  it("once the live poster was made from the video, a rerun writes nothing", async () => {
    await run("commit");
    const made = await asset();
    await db.query("update onzio.homepage_revamp_content set hero_poster_media_asset_id=$2 where club_id=$1", [ROSE_CITY_CLUB_ID, made]);
    await db.query("update onzio_private.hero_video_pending set poster_due_at=null where club_id=$1", [ROSE_CITY_CLUB_ID]);
    await db.query(
      `insert into onzio.audit_events(club_id,actor_type,operation,resource_type,resource_id,payload)
       values($1,'media_processor','media.publish','media_asset',$2,'{"source":"hero-video-poster"}'::jsonb)`, [ROSE_CITY_CLUB_ID, made],
    );
    const settled = await state();
    expect(String((await run("commit")).result)).toBe("no-op: the live poster was already made from the video");
    const after = await state();
    expect(after.poster_due_at).toBeNull();
    expect(after.revision).toBe(settled.revision);
    expect(after.audits).toBe(1);
  });

  it("leaves a previous poster that is already there alone, and only flags", async () => {
    const earlier = await asset();
    await db.query("update onzio.homepage_revamp_content set previous_hero_poster_media_asset_id=$2 where club_id=$1", [ROSE_CITY_CLUB_ID, earlier]);
    expect(String((await run("commit")).result)).toBe("changed: poster flagged for the daily job");
    expect((await state()).previous).toBe(earlier);
  });

  it("does not copy a poster when the previous video is not the original", async () => {
    await seed(liveConfig({ previousHeroVideoGuid: "99999999-9999-4999-8999-999999999999" }), { guid: LIVE, phase: "live" });
    expect(String((await run("commit")).result)).toBe("changed: poster flagged for the daily job");
    const after = await state();
    expect(after.previous).toBeNull();
    expect(after.config).not.toHaveProperty("previousHeroPosterAlt");
  });

  it.each([
    ["a pending row that is not live", { guid: LIVE, phase: "preparing" }],
    ["a pending row for another video", { guid: "88888888-8888-4888-8888-888888888888", phase: "live" }],
    ["no pending row", null],
  ])("writes nothing with %s", async (_label, pending) => {
    await seed(liveConfig(), pending);
    const before = await state();
    expect(String((await run("commit")).result)).toBe("no-op: the pending row is not live for the current video");
    const after = await state();
    expect(after.revision).toBe(before.revision);
    expect(after.audits).toBe(0);
    expect(after.previous).toBeNull();
  });

  it("the rehearsal changes nothing", async () => {
    const before = await state();
    const result = await run("rehearsal");
    expect(String(result.result)).toMatch(/^changed: /);
    const after = await state();
    expect(after.revision).toBe(before.revision);
    expect(after.previous).toBeNull();
    expect(after.poster_due_at).toBeNull();
    expect(after.audits).toBe(0);
  });

  it("refuses a missing club and an archived one", async () => {
    await db.query("savepoint a");
    await db.query("update onzio.clubs set lifecycle='archived', public_access='suspended', archived_at=now() where id=$1", [ROSE_CITY_CLUB_ID]);
    await expect(run("commit")).rejects.toMatchObject({ message: "ROSE_CITY_ARCHIVED" });
    await db.query("rollback to savepoint a");
  });
});
