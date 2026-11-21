import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

// RC-HERO-VIDEO-SWAP: service-role-only RPCs that replace the hero video in
// homepage_revamp_content.presentation_config, with a per-club daily cap and a
// one-step revert. Everything runs in one transaction that is rolled back.

const WITH_ROW = CLUB_IDS.alpha;
const OTHER_ROW = CLUB_IDS.bravo;
const NO_ROW = CLUB_IDS.charlie;
const LIBRARY = "723074";
const A = "d17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91";
const B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const C = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const D = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const SPONSORS = { [randomUUID()]: "invert" };
const ALT = { heroPoster: "Players on the bench" };

let db: Client;

async function asRole(role: "service_role" | "authenticated" | "anon") {
  await db.query("reset role");
  if (role === "authenticated") {
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal2" })]);
  }
  await db.query(`set local role ${role}`);
}

async function seedRow(clubId: string, config: Record<string, unknown>) {
  await db.query("reset role");
  const row = cinematicHomepageStorageRecord(defaultCinematicHomepageContent());
  await asRole("service_role");
  await db.query("delete from onzio.homepage_revamp_content where club_id=$1", [clubId]);
  await db.query("insert into onzio.homepage_revamp_content(club_id,content,presentation_config) values($1,$2,$3)", [clubId, JSON.stringify(row.content), JSON.stringify(config)]);
}

const baseConfig = (extra: Record<string, unknown> = {}) => ({
  heroVideoGuid: A, heroVideoLibraryId: LIBRARY, sponsorTreatments: SPONSORS, artworkAlt: ALT, ...extra,
});

async function config(clubId = WITH_ROW): Promise<Record<string, unknown>> {
  await db.query("reset role");
  return (await db.query("select presentation_config from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0].presentation_config;
}

async function swap(guid: string, expected: string | null, clubId: string = WITH_ROW, library = LIBRARY) {
  await asRole("service_role");
  return (await db.query("select * from onzio.swap_hero_video($1,$2,$3,$4)", [clubId, guid, library, expected])).rows[0];
}

async function revert(expected: string | null, target: string, clubId: string = WITH_ROW) {
  await asRole("service_role");
  return (await db.query("select * from onzio.revert_hero_video($1,$2,$3)", [clubId, expected, target])).rows[0];
}

async function consume(clubId: string, cap?: number) {
  await asRole("service_role");
  const result = cap === undefined
    ? await db.query("select * from onzio.consume_hero_video_replace($1)", [clubId])
    : await db.query("select * from onzio.consume_hero_video_replace($1,$2)", [clubId, cap]);
  return result.rows[0] as { allowed: boolean; used: number; cap: number };
}

async function revision(clubId: string = WITH_ROW): Promise<string> {
  await db.query("reset role");
  return (await db.query("select revision::text as revision from onzio_private.homepage_revisions where club_id=$1", [clubId])).rows[0].revision;
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
  await seedRow(WITH_ROW, baseConfig());
  await seedRow(OTHER_ROW, baseConfig());
  await db.query("reset role");
  await db.query("delete from onzio_private.hero_video_replace_counters where club_id = any($1)", [[WITH_ROW, OTHER_ROW, NO_ROW]]);
  await db.query("delete from onzio_private.hero_video_pending where club_id = any($1)", [[WITH_ROW, OTHER_ROW, NO_ROW]]);
  await db.query("reset role");
  await asRole("service_role");
  await db.query("delete from onzio.homepage_revamp_content where club_id=$1", [NO_ROW]);
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("hero video swap grants", () => {
  const calls: Array<[string, string, unknown[]]> = [
    ["consume_hero_video_replace", "select * from onzio.consume_hero_video_replace($1,$2)", [WITH_ROW, 5]],
    ["hero_video_replaces_today", "select onzio.hero_video_replaces_today($1)", [WITH_ROW]],
    ["swap_hero_video", "select * from onzio.swap_hero_video($1,$2,$3,$4)", [WITH_ROW, B, LIBRARY, A]],
    ["revert_hero_video", "select * from onzio.revert_hero_video($1,$2,$3)", [WITH_ROW, A, B]],
    ["hero_video_event", "select * from onzio.hero_video_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [WITH_ROW, B, "abandon", ["uploading"], "col", null, null, null, 5, 7_200_000]],
    ["read_hero_video_pending", "select * from onzio.read_hero_video_pending($1)", [WITH_ROW]],
    ["lookup_hero_video_pending", "select * from onzio.lookup_hero_video_pending($1)", [B]],
    ["list_hero_video_pending", "select * from onzio.list_hero_video_pending()", []],
  ];

  for (const role of ["authenticated", "anon"] as const) {
    for (const [name, sql, args] of calls) {
      it(`${role} cannot execute ${name}`, async () => {
        await asRole(role);
        await rejects(() => db.query(sql, args), /permission denied/);
      });
    }
    it(`${role} cannot read the counter table`, async () => {
      await asRole(role);
      await rejects(() => db.query("select * from onzio_private.hero_video_replace_counters"), /permission denied/);
    });
    it(`${role} cannot read the pending table`, async () => {
      await asRole(role);
      await rejects(() => db.query("select * from onzio_private.hero_video_pending"), /permission denied/);
    });
  }

  it("keeps presentation_config unwritable for club editors", async () => {
    await asRole("authenticated");
    await rejects(
      () => db.query("update onzio.homepage_revamp_content set presentation_config='{}' where club_id=$1", [WITH_ROW]),
      /permission denied/,
    );
  });

  it("lets the service role call every function", async () => {
    expect((await consume(WITH_ROW)).allowed).toBe(true);
    await asRole("service_role");
    expect((await db.query("select onzio.hero_video_replaces_today($1) as n", [WITH_ROW])).rows[0].n).toBe(1);
  });
});

describe("daily replace counter", () => {
  it("allows five, refuses the sixth without counting it, and leaves other clubs alone", async () => {
    for (let i = 1; i <= 5; i++) {
      expect(await consume(WITH_ROW)).toEqual({ allowed: true, used: i, cap: 5 });
    }
    expect(await consume(WITH_ROW)).toEqual({ allowed: false, used: 5, cap: 5 });
    expect(await consume(WITH_ROW)).toEqual({ allowed: false, used: 5, cap: 5 });
    expect(await consume(OTHER_ROW)).toEqual({ allowed: true, used: 1, cap: 5 });
    await asRole("service_role");
    const today = (clubId: string) => db.query("select onzio.hero_video_replaces_today($1) as n", [clubId]).then((r) => r.rows[0].n);
    expect(await today(WITH_ROW)).toBe(5);
    expect(await today(OTHER_ROW)).toBe(1);
    expect(await today(NO_ROW)).toBe(0);
  });

  it("honors a custom cap and rejects caps outside 1..50", async () => {
    expect((await consume(WITH_ROW, 1)).allowed).toBe(true);
    expect((await consume(WITH_ROW, 1)).allowed).toBe(false);
    for (const cap of [0, 51, -1]) {
      await rejects(() => consume(WITH_ROW, cap), /INVALID_HERO_VIDEO_CAP/);
    }
  });

  it("counts by UTC day", async () => {
    await consume(WITH_ROW);
    await db.query("reset role");
    await db.query(
      "update onzio_private.hero_video_replace_counters set day = ((now() at time zone 'utc')::date - 1) where club_id=$1",
      [WITH_ROW],
    );
    expect(await consume(WITH_ROW)).toEqual({ allowed: true, used: 1, cap: 5 });
  });
});

describe("swap_hero_video", () => {
  it("merges the config, keeps unrelated keys, and moves live to previous", async () => {
    const result = await swap(B, A);
    expect(result).toMatchObject({ outcome: "swapped", live_guid: B, previous_guid: A, deletable_guid: null });
    expect(await config()).toEqual({
      heroVideoGuid: B, heroVideoLibraryId: LIBRARY, previousHeroVideoGuid: A, sponsorTreatments: SPONSORS, artworkAlt: ALT,
    });
  });

  it("updates the library id and returns the old previous video as deletable", async () => {
    await swap(B, A);
    const result = await swap(C, B, WITH_ROW, "999");
    expect(result).toMatchObject({ outcome: "swapped", live_guid: C, previous_guid: B, deletable_guid: A });
    expect(await config()).toMatchObject({ heroVideoGuid: C, heroVideoLibraryId: "999", previousHeroVideoGuid: B, sponsorTreatments: SPONSORS, artworkAlt: ALT });
  });

  it("does not offer a video for deletion when it is the one going live", async () => {
    await swap(B, A);
    const result = await swap(A, B);
    expect(result).toMatchObject({ outcome: "swapped", live_guid: A, previous_guid: B, deletable_guid: null });
  });

  it("treats a retry of a finished swap as a no-op with nothing to delete", async () => {
    await swap(B, A);
    await swap(C, B);
    const before = await config();
    const retry = await swap(C, B);
    expect(retry).toMatchObject({ outcome: "already_live", live_guid: C, previous_guid: B, deletable_guid: null });
    expect(await config()).toEqual(before);
  });

  it("reports a conflict and writes nothing when the expected live video is stale", async () => {
    const before = await config();
    const result = await swap(C, B);
    expect(result).toMatchObject({ outcome: "conflict", live_guid: A, previous_guid: null, deletable_guid: null });
    expect(await config()).toEqual(before);
  });

  it("fails closed for a club with no homepage row and does not insert one", async () => {
    const result = await swap(B, A, NO_ROW);
    expect(result).toMatchObject({ outcome: "missing_row", live_guid: null, previous_guid: null, deletable_guid: null });
    await db.query("reset role");
    expect((await db.query("select 1 from onzio.homepage_revamp_content where club_id=$1", [NO_ROW])).rowCount).toBe(0);
  });

  it("starts from an empty hero without leaving a stale previous key", async () => {
    await seedRow(WITH_ROW, { sponsorTreatments: SPONSORS, previousHeroVideoGuid: D });
    const result = await swap(B, null);
    expect(result).toMatchObject({ outcome: "swapped", live_guid: B, previous_guid: null, deletable_guid: D });
    const saved = await config();
    expect(saved).toEqual({ heroVideoGuid: B, heroVideoLibraryId: LIBRARY, sponsorTreatments: SPONSORS });
    expect(saved).not.toHaveProperty("previousHeroVideoGuid");
  });

  it("rejects a malformed guid or library id before any write", async () => {
    const before = await config();
    for (const guid of ["not-a-guid", B.toUpperCase(), `${B}x`, "", "d17c6dc6ab9a4b22a7dd1e55b4f1ad91"]) {
      await rejects(() => swap(guid, A), /INVALID_HERO_VIDEO_GUID/);
    }
    for (const library of ["", "abc", "1234567890123", "12 3"]) {
      await rejects(() => swap(B, A, WITH_ROW, library), /INVALID_HERO_VIDEO_LIBRARY/);
    }
    expect(await config()).toEqual(before);
  });
});

describe("revert_hero_video", () => {
  it("swaps live and previous and keeps the library and other keys", async () => {
    await swap(B, A);
    const result = await revert(B, A);
    expect(result).toMatchObject({ outcome: "reverted", live_guid: A, previous_guid: B });
    expect(await config()).toEqual({
      heroVideoGuid: A, heroVideoLibraryId: LIBRARY, previousHeroVideoGuid: B, sponsorTreatments: SPONSORS, artworkAlt: ALT,
    });
  });

  it("is idempotent on retry", async () => {
    await swap(B, A);
    await revert(B, A);
    const before = await config();
    expect(await revert(B, A)).toMatchObject({ outcome: "already_live", live_guid: A, previous_guid: B });
    expect(await config()).toEqual(before);
  });

  it("reports no_previous when there is nothing to go back to or the target is not the previous video", async () => {
    expect((await revert(A, B)).outcome).toBe("no_previous");
    await swap(B, A);
    expect((await revert(B, C)).outcome).toBe("no_previous");
  });

  it("reports a conflict and writes nothing when the expected live video is stale", async () => {
    await swap(B, A);
    const before = await config();
    expect(await revert(C, A)).toMatchObject({ outcome: "conflict", live_guid: B, previous_guid: A });
    expect(await config()).toEqual(before);
  });

  it("fails closed for a club with no homepage row", async () => {
    expect((await revert(A, B, NO_ROW)).outcome).toBe("missing_row");
  });

  it("never offers anything for deletion", async () => {
    await swap(B, A);
    expect(Object.keys(await revert(B, A))).not.toContain("deletable_guid");
  });
});

describe("revision numbers returned by a write", () => {
  it("swap reports the homepage revision before and after, matching homepage_revisions", async () => {
    const before = await revision();
    const result = await swap(B, A);
    const after = await revision();
    expect(result.revision_before).toBe(before);
    expect(result.revision_after).toBe(after);
    expect(Number(after)).toBe(Number(before) + 1);
  });

  it("revert reports the homepage revision before and after, matching homepage_revisions", async () => {
    await swap(B, A);
    const before = await revision();
    const result = await revert(B, A);
    const after = await revision();
    expect(result.revision_before).toBe(before);
    expect(result.revision_after).toBe(after);
    expect(Number(after)).toBe(Number(before) + 1);
  });

  it("returns null revisions and leaves the revision alone when nothing is written", async () => {
    await swap(B, A);
    const before = await revision();
    const nulls = { revision_before: null, revision_after: null };
    expect(await swap(B, A)).toMatchObject({ outcome: "already_live", ...nulls });
    expect(await swap(C, D)).toMatchObject({ outcome: "conflict", ...nulls });
    expect(await swap(B, A, NO_ROW)).toMatchObject({ outcome: "missing_row", ...nulls });
    expect(await revert(B, B)).toMatchObject({ outcome: "already_live", ...nulls });
    expect(await revert(B, C)).toMatchObject({ outcome: "no_previous", ...nulls });
    expect(await revert(D, A)).toMatchObject({ outcome: "conflict", ...nulls });
    expect(await revert(A, B, NO_ROW)).toMatchObject({ outcome: "missing_row", ...nulls });
    expect(await revision()).toBe(before);
  });
});

describe("pending hero video", () => {
  const GUID = "abababab-abab-4aba-8aba-abababababab";
  const WINDOW = (2 * 60 + 15) * 60 * 1000;
  const PREPARE = 2 * 60 * 60 * 1000;
  const event = async (club: string, guid: string, name: string, expected: string[], extra: { collection?: string; failure?: string | null; deadline?: number; cap?: number } = {}) => {
    await asRole("service_role");
    return (await db.query(
      "select * from onzio.hero_video_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [club, guid, name, expected, extra.collection ?? "col-a", extra.failure ?? null, "723074", null, extra.cap ?? 5, extra.deadline ?? WINDOW],
    )).rows[0];
  };
  const read = async () => (await db.query("select * from onzio.read_hero_video_pending($1)", [WITH_ROW])).rows[0];
  const used = async () => (await db.query("select onzio.hero_video_replaces_today($1) as n", [WITH_ROW])).rows[0].n;

  it("walks start, land, ready and a stale retry without counting until bytes land", async () => {
    expect((await event(WITH_ROW, GUID, "start", ["uploading", "preparing", "live", "failed", "abandoned"])).outcome).toBe("ok");
    expect((await event(WITH_ROW, B, "start", ["uploading", "preparing", "live", "failed", "abandoned"], { collection: "col-b" })).delete_guid).toBe(GUID);
    expect(await read()).toMatchObject({ video_guid: B, collection_id: "col-b", phase: "uploading", replace_counted: false });
    expect(await used()).toBe(0);
    expect((await event(WITH_ROW, B, "land", ["uploading"], { deadline: PREPARE })).outcome).toBe("ok");
    expect(await read()).toMatchObject({ phase: "preparing", replace_counted: true });
    expect(await used()).toBe(1);
    expect((await event(WITH_ROW, B, "land", ["uploading"], { deadline: PREPARE })).outcome).toBe("stale");
    expect(await used()).toBe(1);
    const ready = await event(WITH_ROW, B, "ready", ["uploading", "preparing"]);
    expect(ready.outcome).toBe("swapped");
    expect(ready.phase).toBe("live");
    expect(await used()).toBe(1);
    expect((await event(WITH_ROW, B, "ready", ["uploading", "preparing"])).outcome).toBe("stale");
    expect(await used()).toBe(1);
    expect((await db.query("select count(*)::int as n from onzio.list_hero_video_pending() where club_id=$1", [WITH_ROW])).rows[0].n).toBe(0);
  });

  it("refuses start while preparing is inside its deadline and does not count an abandon", async () => {
    expect((await event(WITH_ROW, B, "start", ["uploading"])).outcome).toBe("ok");
    expect((await event(WITH_ROW, B, "land", ["uploading"], { deadline: PREPARE })).outcome).toBe("ok");
    const blocked = await event(WITH_ROW, GUID, "start", ["uploading", "preparing", "live", "failed", "abandoned"], { collection: "col-b" });
    expect(blocked.outcome).toBe("preparing");
    expect(await read()).toMatchObject({ video_guid: B, phase: "preparing" });
    // The pending table is not granted to service_role. Rewind it as the table owner.
    await db.query("reset role");
    await db.query("update onzio_private.hero_video_pending set phase='uploading', failure_code=null, landed_at=null, replace_counted=false, deadline_at=now() - interval '1 minute' where club_id=$1", [WITH_ROW]);
    await db.query("delete from onzio_private.hero_video_replace_counters where club_id=$1", [WITH_ROW]);
    expect((await event(WITH_ROW, B, "expire", ["uploading"])).outcome).toBe("abandoned");
    expect(await used()).toBe(0);
    expect((await event(WITH_ROW, B, "abandon", ["uploading"])).outcome).toBe("stale");
  });
});
