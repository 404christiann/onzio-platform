import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { createLocalClients } from "../helpers/supabase";
import { cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

// RC-HERO-POSTER-02: the poster follows the hero video inside the same database function, in one UPDATE.
// Runs in one transaction that is rolled back.

const CLUB = CLUB_IDS.alpha;
const OTHER_CLUB = CLUB_IDS.bravo;
const LIBRARY = "723074";
const A = "d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91";
const B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const C = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const HAND_ALT = "Players on the bench";
const SPONSORS = { [randomUUID()]: "invert" };

let db: Client;
let P0: string; // the hand-set poster in the live slot
let P1: string; // the poster made from the new video
let P2: string;

async function asRole(role: "service_role" | "authenticated" | "anon") {
  await db.query("reset role");
  if (role === "authenticated") {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal2" })]);
  }
  await db.query(`set local role ${role}`);
}

async function asset(over: { clubId?: string; surface?: string; kind?: string; status?: string; deleted?: boolean } = {}): Promise<string> {
  await db.query("reset role");
  const id = randomUUID();
  const clubId = over.clubId ?? CLUB;
  const surface = over.surface ?? "homepage";
  const status = over.status ?? "published";
  await db.query(
    `insert into onzio.media_assets
       (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
     values($1,$2,'onzio-media',$3,$4,$5,'image/webp',100,1920,1080,$6,$7,now(),$8)`,
    [id, clubId, `${clubId}/${surface}/${id}.webp`, surface, over.kind ?? "photograph", "e".repeat(64), status, over.deleted ? new Date() : null],
  );
  return id;
}

async function seed(config: Record<string, unknown>, poster: string | null = P0, previousPoster: string | null = null) {
  await db.query("reset role");
  const record = cinematicHomepageStorageRecord(defaultCinematicHomepageContent());
  await db.query("delete from onzio.homepage_revamp_content where club_id=$1", [CLUB]);
  await db.query(
    "insert into onzio.homepage_revamp_content(club_id,content,presentation_config,hero_poster_media_asset_id,previous_hero_poster_media_asset_id) values($1,$2,$3,$4,$5)",
    [CLUB, JSON.stringify(record.content), JSON.stringify(config), poster, previousPoster],
  );
}
const baseConfig = (extra: Record<string, unknown> = {}) => ({
  heroVideoGuid: A, heroVideoLibraryId: LIBRARY, sponsorTreatments: SPONSORS, artworkAlt: { heroPoster: HAND_ALT, seatsBackground: "Seats" }, ...extra,
});

async function row() {
  await db.query("reset role");
  const r = (await db.query(
    `select hero_poster_media_asset_id as live, previous_hero_poster_media_asset_id as previous, presentation_config as config,
       (select revision::text from onzio_private.homepage_revisions where club_id = $1) as revision
     from onzio.homepage_revamp_content where club_id = $1`, [CLUB],
  )).rows[0];
  return r as { live: string | null; previous: string | null; config: Record<string, any>; revision: string };
}
async function pending() {
  await db.query("reset role");
  return (await db.query("select * from onzio_private.hero_video_pending where club_id=$1", [CLUB])).rows[0] as
    { video_guid: string; phase: string; poster_due_at: Date | null; poster_attempts: number } | undefined;
}
async function setPending(guid: string, over: { phase?: string; due?: boolean; attempts?: number } = {}) {
  await db.query("reset role");
  await db.query("delete from onzio_private.hero_video_pending where club_id=$1", [CLUB]);
  const phase = over.phase ?? "live";
  await db.query(
    `insert into onzio_private.hero_video_pending(club_id,video_guid,collection_id,phase,failure_code,deadline_at,landed_at,poster_due_at,poster_attempts)
     values($1,$2,'col-a',$3,$4,$5,now(),$6,$7)`,
    [CLUB, guid, phase, phase === "failed" ? "VIDEO_FAILED" : null, phase === "uploading" || phase === "preparing" ? new Date(Date.now() + 3_600_000) : null,
      over.due === false ? null : new Date(Date.now() - 1000), over.attempts ?? 0],
  );
}

async function swap(guid: string, expected: string | null, poster?: string | null, clubId = CLUB) {
  await asRole("service_role");
  return (poster === undefined
    ? await db.query("select * from onzio.swap_hero_video($1,$2,$3,$4)", [clubId, guid, LIBRARY, expected])
    : await db.query("select * from onzio.swap_hero_video($1,$2,$3,$4,$5)", [clubId, guid, LIBRARY, expected, poster])).rows[0];
}
async function revert(expected: string, target: string) {
  await asRole("service_role");
  return (await db.query("select * from onzio.revert_hero_video($1,$2,$3)", [CLUB, expected, target])).rows[0];
}
async function attach(guid: string, poster: string | null) {
  await asRole("service_role");
  return (await db.query("select * from onzio.attach_hero_video_poster($1,$2,$3)", [CLUB, guid, poster])).rows[0];
}
async function event(guid: string, name: string, expected: string[], extra: { poster?: string | null; expectedLive?: string | null } = {}) {
  await asRole("service_role");
  return (await db.query(
    "select * from onzio.hero_video_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [CLUB, guid, name, expected, "col-a", null, LIBRARY, extra.expectedLive ?? null, 10, 8_100_000, extra.poster ?? null],
  )).rows[0];
}
async function rejects(run: () => Promise<unknown>, message: string | RegExp) {
  await db.query("savepoint expected_error");
  try {
    await expect(run()).rejects.toThrow(message);
  } finally {
    await db.query("rollback to savepoint expected_error");
  }
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  await db.query("reset role");
  await db.query("delete from onzio_private.hero_video_replace_counters where club_id = $1", [CLUB]);
  await db.query("delete from onzio_private.hero_video_pending where club_id = $1", [CLUB]);
  P0 = await asset();
  P1 = await asset();
  P2 = await asset();
  await seed(baseConfig());
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("swap with a poster", () => {
  it("moves the old poster and alt to the previous slot, puts the new poster live with a blank alt, keeps unrelated keys, and bumps the revision once", async () => {
    const before = await row();
    const result = await swap(B, A, P1);
    expect(result).toMatchObject({ outcome: "swapped", live_guid: B, previous_guid: A, poster: "set" });
    const after = await row();
    expect(after.live).toBe(P1);
    expect(after.previous).toBe(P0);
    expect(after.config).toEqual({
      ...baseConfig({ heroVideoGuid: B, previousHeroVideoGuid: A, previousHeroPosterAlt: HAND_ALT }),
      artworkAlt: { heroPoster: "", seatsBackground: "Seats" },
    });
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + BigInt(1));
    expect(result.revision_before).toBe(before.revision);
    expect(result.revision_after).toBe(after.revision);
  });

  it("without a poster the old one stays live, the previous slot takes it too, and the result says kept", async () => {
    const result = await swap(B, A);
    expect(result).toMatchObject({ outcome: "swapped", poster: "kept" });
    const after = await row();
    expect(after.live).toBe(P0);
    expect(after.previous).toBe(P0);
    expect(after.config.artworkAlt.heroPoster).toBe(HAND_ALT);
    expect(after.config.previousHeroPosterAlt).toBe(HAND_ALT);
  });

  it("a null, unknown, unpublished, wrong-surface, graphic or other-club asset gives kept and never raises", async () => {
    const bad = {
      unknown: randomUUID(),
      unpublished: await asset({ status: "orphaned", deleted: true }),
      wrongSurface: await asset({ surface: "news" }),
      graphic: await asset({ kind: "graphic" }),
      otherClub: await asset({ clubId: OTHER_CLUB }),
    };
    for (const [label, id] of Object.entries(bad)) {
      await seed(baseConfig());
      const result = await swap(B, A, id);
      expect(result, label).toMatchObject({ outcome: "swapped", poster: "kept" });
      expect((await row()).live, label).toBe(P0);
    }
    await seed(baseConfig());
    expect(await swap(B, A, null)).toMatchObject({ poster: "kept" });
  });

  it("a retry of a finished swap writes nothing, and a stale expectation is a conflict that changes no poster", async () => {
    await swap(B, A, P1);
    const settled = await row();
    expect(await swap(B, A, P2)).toMatchObject({ outcome: "already_live", poster: null });
    expect(await swap(C, A, P2)).toMatchObject({ outcome: "conflict", poster: null });
    const after = await row();
    expect(after.live).toBe(P1);
    expect(after.revision).toBe(settled.revision);
  });

  it("the first video of a club has no previous poster or previous alt", async () => {
    await seed(baseConfig({ heroVideoGuid: "" }), null);
    await swap(B, "", P1);
    const after = await row();
    expect(after.live).toBe(P1);
    expect(after.previous).toBeNull();
    expect(after.config).not.toHaveProperty("previousHeroPosterAlt");
    expect(after.config).not.toHaveProperty("previousHeroVideoGuid");
  });

  it("an old poster that is no longer published is not moved to the previous slot, and the swap still succeeds", async () => {
    await db.query("reset role");
    await db.query("update onzio.media_assets set status='orphaned', deleted_at=now() where id=$1", [P0]);
    expect(await swap(B, A, P1)).toMatchObject({ outcome: "swapped", poster: "set" });
    const after = await row();
    expect(after.live).toBe(P1);
    expect(after.previous).toBeNull();
  });
});

describe("revert with posters", () => {
  it("exchanges live and previous posters and alts with the videos, and a second revert round-trips", async () => {
    await swap(B, A, P1);
    const swapped = await row();
    expect(await revert(B, A)).toMatchObject({ outcome: "reverted", live_guid: A, previous_guid: B });
    const reverted = await row();
    expect(reverted.live).toBe(P0);
    expect(reverted.previous).toBe(P1);
    expect(reverted.config.artworkAlt.heroPoster).toBe(HAND_ALT);
    expect(reverted.config.previousHeroPosterAlt).toBe("");
    expect(BigInt(reverted.revision)).toBe(BigInt(swapped.revision) + BigInt(1));

    expect(await revert(A, B)).toMatchObject({ outcome: "reverted", live_guid: B });
    const again = await row();
    expect(again.live).toBe(P1);
    expect(again.previous).toBe(P0);
    expect(again.config.artworkAlt.heroPoster).toBe("");
    expect(again.config.previousHeroPosterAlt).toBe(HAND_ALT);
  });

  it("with no previous poster the live poster and both alts stay, and the revert still succeeds", async () => {
    await seed(baseConfig({ previousHeroVideoGuid: B }), P0, null);
    const before = await row();
    expect(await revert(A, B)).toMatchObject({ outcome: "reverted", live_guid: B });
    const after = await row();
    expect(after.live).toBe(P0);
    expect(after.previous).toBeNull();
    expect(after.config.artworkAlt).toEqual(before.config.artworkAlt);
    expect(after.config).not.toHaveProperty("previousHeroPosterAlt");
  });

  it("a previous poster that has been retired is not restored, and nothing raises", async () => {
    await seed(baseConfig({ previousHeroVideoGuid: B }), P0, P1);
    await db.query("update onzio.media_assets set status='orphaned', deleted_at=now() where id=$1", [P1]);
    expect(await revert(A, B)).toMatchObject({ outcome: "reverted" });
    const after = await row();
    expect(after.live).toBe(P0);
    expect(after.previous).toBe(P1);
  });

  it("keeps the old answers for no_previous, already_live and conflict", async () => {
    expect(await revert(A, B)).toMatchObject({ outcome: "no_previous" });
    await swap(B, A, P1);
    expect(await revert(A, A)).toMatchObject({ outcome: "conflict" });
    expect(await revert(B, B)).toMatchObject({ outcome: "already_live" });
  });
});

describe("ready and start", () => {
  const OPEN = ["uploading", "preparing"];
  const START = ["uploading", "preparing", "live", "failed", "abandoned"];

  it("ready with a poster sets it and clears the due flag; ready without one keeps the old poster and flags the row", async () => {
    await event(B, "start", START);
    await event(B, "land", ["uploading"]);
    const ready = await event(B, "ready", OPEN, { poster: P1, expectedLive: A });
    expect(ready).toMatchObject({ outcome: "swapped", phase: "live", poster: "set" });
    expect(await pending()).toMatchObject({ phase: "live", poster_due_at: null, poster_attempts: 0 });
    expect((await row()).live).toBe(P1);

    await event(C, "start", START);
    await event(C, "land", ["uploading"]);
    const kept = await event(C, "ready", OPEN, { expectedLive: B });
    expect(kept).toMatchObject({ outcome: "swapped", poster: "kept" });
    const flagged = await pending();
    expect(flagged?.poster_due_at).not.toBeNull();
    expect(flagged?.poster_attempts).toBe(0);
    expect((await row()).live).toBe(P1);
  });

  it("start resets the flag and the attempt count", async () => {
    await setPending(B, { phase: "failed", due: true, attempts: 3 });
    await event(C, "start", START);
    expect(await pending()).toMatchObject({ video_guid: C, phase: "uploading", poster_due_at: null, poster_attempts: 0 });
  });

  it("a repeated ready for a video that is already live changes nothing, flag included", async () => {
    await event(B, "start", START);
    await event(B, "land", ["uploading"]);
    await event(B, "ready", OPEN, { expectedLive: A });
    const flagged = await pending();
    const again = await event(B, "ready", ["live"], { expectedLive: B });
    expect(again.outcome).toBe("already_live");
    expect((await pending())?.poster_due_at).toEqual(flagged?.poster_due_at);
  });

  it("the old ten-argument call still works, and returns a row with the new poster column", async () => {
    await asRole("service_role");
    const r = (await db.query("select * from onzio.hero_video_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [CLUB, B, "start", ["uploading"], "col-a", null, LIBRARY, null, 10, 8_100_000])).rows[0];
    expect(r).toMatchObject({ outcome: "ok", poster: null });
    const s = (await db.query("select * from onzio.swap_hero_video($1,$2,$3,$4)", [CLUB, C, LIBRARY, A])).rows[0];
    expect(s).toMatchObject({ outcome: "swapped", poster: "kept" });
  });
});

describe("attach_hero_video_poster", () => {
  it("puts the poster on the live slot with a blank alt, clears the flag, and moves the revision once", async () => {
    await setPending(A);
    const before = await row();
    const result = await attach(A, P1);
    expect(result).toMatchObject({ outcome: "attached" });
    const after = await row();
    expect(after.live).toBe(P1);
    expect(after.config.artworkAlt).toEqual({ heroPoster: "", seatsBackground: "Seats" });
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + BigInt(1));
    expect(result.revision_before).toBe(before.revision);
    expect((await pending())?.poster_due_at).toBeNull();
  });

  it("puts the poster on the previous slot when that slot holds the video", async () => {
    await seed(baseConfig({ heroVideoGuid: B, previousHeroVideoGuid: A }), P0, null);
    await setPending(A);
    expect(await attach(A, P1)).toMatchObject({ outcome: "attached" });
    const after = await row();
    expect(after.previous).toBe(P1);
    expect(after.live).toBe(P0);
    expect(after.config.previousHeroPosterAlt).toBe("");
  });

  it("is idempotent: a second call is not due, and an asset already in place writes nothing", async () => {
    await setPending(A);
    await attach(A, P1);
    const settled = await row();
    expect(await attach(A, P1)).toMatchObject({ outcome: "not_due" });
    await setPending(A);
    expect(await attach(A, P1)).toMatchObject({ outcome: "already_attached" });
    expect((await row()).revision).toBe(settled.revision);
    expect((await pending())?.poster_due_at).toBeNull();
  });

  it("is stale, and stops asking, for a video in neither slot; and stale for a row that is not live", async () => {
    await setPending(C);
    expect(await attach(C, P1)).toMatchObject({ outcome: "stale" });
    expect((await pending())?.poster_due_at).toBeNull();
    expect((await row()).live).toBe(P0);
    await setPending(A, { phase: "preparing" });
    expect(await attach(A, P1)).toMatchObject({ outcome: "stale" });
    expect(await attach(B, P1)).toMatchObject({ outcome: "stale" });
  });

  it("a null or unusable asset counts one try, and the fifth stops the flag", async () => {
    await setPending(A);
    const unusable = [null, randomUUID(), await asset({ clubId: OTHER_CLUB }), await asset({ surface: "news" }), await asset({ kind: "graphic" })];
    const outcomes: string[] = [];
    for (const id of unusable) outcomes.push((await attach(A, id)).outcome);
    expect(outcomes).toEqual(["failed", "failed", "failed", "failed", "gave_up"]);
    expect(await pending()).toMatchObject({ poster_attempts: 5, poster_due_at: null });
    expect((await row()).live).toBe(P0);
    expect(await attach(A, P1)).toMatchObject({ outcome: "not_due" });
  });

  it("does nothing for a row that is not flagged", async () => {
    await setPending(A, { due: false });
    expect(await attach(A, P1)).toMatchObject({ outcome: "not_due" });
    expect((await row()).live).toBe(P0);
  });

  it("rejects a malformed guid", async () => {
    await rejects(() => attach("not-a-guid", P1), /INVALID_HERO_VIDEO_GUID/);
  });
});

describe("list_hero_video_poster_due", () => {
  const due = async () => {
    await asRole("service_role");
    return (await db.query("select * from onzio.list_hero_video_poster_due()")).rows.filter((r) => r.club_id === CLUB);
  };
  it("lists only live rows that are flagged, due now, and under five tries", async () => {
    await setPending(A);
    expect(await due()).toEqual([{ club_id: CLUB, video_guid: A, poster_attempts: 0 }]);
    await setPending(A, { due: false });
    expect(await due()).toEqual([]);
    await setPending(A, { attempts: 5 });
    expect(await due()).toEqual([]);
    await setPending(A, { phase: "failed" });
    expect(await due()).toEqual([]);
    await setPending(A);
    await db.query("update onzio_private.hero_video_pending set poster_due_at = now() + interval '1 hour' where club_id=$1", [CLUB]);
    expect(await due()).toEqual([]);
  });
});

describe("references and guards", () => {
  it("a poster in either slot counts as referenced, so retirement and the orphan sweep leave it", async () => {
    await seed(baseConfig(), P0, P1);
    await asRole("service_role");
    for (const id of [P0, P1]) {
      const retired = (await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as r", [CLUB, id, null])).rows[0].r;
      expect(retired).toMatchObject({ status: "referenced" });
    }
    const unreferenced = (await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as r", [CLUB, P2, null])).rows[0].r;
    expect(unreferenced).toMatchObject({ status: "retired" });
  });

  it("the previous-poster column refuses another club's asset and an unpublished one", async () => {
    await db.query("reset role");
    const other = await asset({ clubId: OTHER_CLUB });
    const gone = await asset({ status: "orphaned", deleted: true });
    // The guard trigger looks the asset up inside the club first, so another club's asset is refused as not published.
    await rejects(() => db.query("update onzio.homepage_revamp_content set previous_hero_poster_media_asset_id=$2 where club_id=$1", [CLUB, other]), /MEDIA_NOT_PUBLISHED/);
    await rejects(() => db.query("update onzio.homepage_revamp_content set previous_hero_poster_media_asset_id=$2 where club_id=$1", [CLUB, gone]), /MEDIA_NOT_PUBLISHED/);
  });
});

describe("grants", () => {
  const calls: Array<[string, string, unknown[]]> = [
    ["attach_hero_video_poster", "select * from onzio.attach_hero_video_poster($1,$2,$3)", [CLUB, A, null]],
    ["list_hero_video_poster_due", "select * from onzio.list_hero_video_poster_due()", []],
    ["swap_hero_video (poster)", "select * from onzio.swap_hero_video($1,$2,$3,$4,$5)", [CLUB, B, LIBRARY, A, null]],
    ["hero_video_event (poster)", "select * from onzio.hero_video_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [CLUB, B, "abandon", ["uploading"], "col", null, null, null, 5, 7_200_000, null]],
    ["attach core", "select * from onzio_private.attach_hero_video_poster_core($1,$2,$3)", [CLUB, A, null]],
    ["list core", "select * from onzio_private.list_hero_video_poster_due_core()", []],
  ];
  for (const role of ["authenticated", "anon"] as const) {
    for (const [name, sql, args] of calls) {
      it(`${role} cannot execute ${name}`, async () => {
        await asRole(role);
        await rejects(() => db.query(sql, args), /permission denied/);
      });
    }
    it(`${role} cannot write the previous-poster column or the retry columns`, async () => {
      await asRole(role);
      await rejects(() => db.query("update onzio.homepage_revamp_content set previous_hero_poster_media_asset_id=null where club_id=$1", [CLUB]), /permission denied/);
      await rejects(() => db.query("update onzio_private.hero_video_pending set poster_due_at=null where club_id=$1", [CLUB]), /permission denied/);
    });
  }
  it("service_role can execute them", async () => {
    await asRole("service_role");
    await db.query("select * from onzio.list_hero_video_poster_due()");
  });
});

describe("through PostgREST", () => {
  it("the old ten-argument hero_video_event and four-argument swap_hero_video calls still resolve, and write nothing for an unknown club", async () => {
    // PostgREST uses its own connection: end this test's transaction first, or its homepage lock would block the call.
    await db.query("rollback");
    const { service } = createLocalClients();
    const unknownClub = randomUUID();
    const event = await service.schema("onzio").rpc("hero_video_event", {
      p_club_id: unknownClub, p_video_guid: B, p_event: "abandon", p_expected: ["uploading"], p_collection_id: null,
      p_failure_code: null, p_library_id: null, p_expected_live: null, p_cap: null, p_deadline_ms: null,
    });
    expect(event.error).toBeNull();
    expect(event.data?.[0]).toMatchObject({ outcome: "stale" });
    const swapResult = await service.schema("onzio").rpc("swap_hero_video", { p_club_id: unknownClub, p_new_guid: B, p_library_id: LIBRARY, p_expected_live: "" });
    expect(swapResult.error).toBeNull();
    expect(swapResult.data?.[0]).toMatchObject({ outcome: "missing_row" });
    const withPoster = await service.schema("onzio").rpc("swap_hero_video", { p_club_id: unknownClub, p_new_guid: B, p_library_id: LIBRARY, p_expected_live: "", p_poster_asset_id: null });
    expect(withPoster.error).toBeNull();
  });
});
