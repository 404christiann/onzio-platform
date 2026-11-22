import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { localPostgresConfig } from "../helpers/local-postgres";
import { cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import {
  PRESENTATION_ARTWORK,
  ROSE_CITY_CLUB_ID,
  buildPresentationInputsSql,
  buildPublishSql,
  type PresentationInputs,
} from "../../scripts/rose-city-2027-operator-sql";

// RC-HERO-POSTER-01: a rerun of operator step B must never put the hand-set hero poster back once the hero video flow
// has replaced it. Runs the generated SQL as written against the local database, inside one rolled-back transaction.

const HAND_SET_ALT = PRESENTATION_ARTWORK.find(({ key }) => key === "heroPoster")!.alt;
let db: Client;
let assets: { headerPartner: string; heroPoster: string; seatsBackground: string; episodePoster: string; autoPoster: string; newHeader: string };

async function asset(kind: "photograph" | "graphic"): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into onzio.media_assets
       (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
     values($1,$2,'onzio-media',$3,'homepage',$4,'image/webp',100,100,100,$5,'published',now())`,
    [id, ROSE_CITY_CLUB_ID, `${ROSE_CITY_CLUB_ID}/homepage/${id}.webp`, kind, "e".repeat(64)],
  );
  return id;
}

/** Runs generated operator SQL inside this test's transaction; its begin/commit become a savepoint. */
async function run(sql: string): Promise<Record<string, unknown>> {
  await db.query("reset role");
  const results = (await db.query(
    sql.replace(/^begin;$/m, "savepoint operator_sql;").replace(/^commit;$/m, "release savepoint operator_sql;"),
  )) as unknown as Array<{ rows: Array<Record<string, unknown>> }>;
  const readBack = results.find((result) => result.rows?.[0] && "result" in result.rows[0]);
  if (!readBack) throw new Error("operator SQL returned no read-back row");
  return readBack.rows[0];
}

const stepB = (inputs: Partial<PresentationInputs> = {}) => run(buildPresentationInputsSql({
  commit: true,
  inputs: {
    headerPartner: assets.headerPartner, heroPoster: assets.heroPoster,
    seatsBackground: assets.seatsBackground, episodePoster: assets.episodePoster, ...inputs,
  },
}));

async function row() {
  await db.query("reset role");
  return (await db.query(
    `select header_partner_media_asset_id, hero_poster_media_asset_id, presentation_config,
       (select revision::text from onzio_private.homepage_revisions where club_id = $1) as revision
     from onzio.homepage_revamp_content where club_id = $1`,
    [ROSE_CITY_CLUB_ID],
  )).rows[0];
}

/** What the hero video flow does when it puts an automatic poster live (RC-HERO-POSTER): new asset, blank alt. */
async function autoPosterGoesLive() {
  await db.query("reset role");
  await db.query(
    `update onzio.homepage_revamp_content
       set hero_poster_media_asset_id = $2,
           presentation_config = jsonb_set(presentation_config, '{artworkAlt,heroPoster}', '""'::jsonb)
     where club_id = $1`,
    [ROSE_CITY_CLUB_ID, assets.autoPoster],
  );
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig());
  await db.connect();
  await db.query("begin");
  await db.query(
    `insert into onzio.clubs (id, slug, name, lifecycle, public_access, tier, kind)
     values ($1, 'rose-city', 'Rose City FC', 'active', 'live', 'pro', 'demo') on conflict (id) do nothing`,
    [ROSE_CITY_CLUB_ID],
  );
  assets = {
    headerPartner: await asset("graphic"), heroPoster: await asset("photograph"), seatsBackground: await asset("graphic"),
    episodePoster: await asset("photograph"), autoPoster: await asset("photograph"), newHeader: await asset("graphic"),
  };
  await run(buildPublishSql({ actorId: USER_IDS.ownerAal2, commit: true }));
  const record = cinematicHomepageStorageRecord(defaultCinematicHomepageContent());
  await db.query("delete from onzio.homepage_revamp_content where club_id=$1", [ROSE_CITY_CLUB_ID]);
  await db.query("insert into onzio.homepage_revamp_content(club_id,content,presentation_config) values($1,$2,'{}'::jsonb)", [ROSE_CITY_CLUB_ID, JSON.stringify(record.content)]);
  await db.query(
    "insert into onzio.behind_the_rose_section(club_id,video_url) values($1,'https://example.test/video') on conflict(club_id) do update set video_url=excluded.video_url",
    [ROSE_CITY_CLUB_ID],
  );
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("operator step B and the hero poster", () => {
  it("sets the hand-set poster and its alt on first-time setup, and a rerun is a no-op", async () => {
    expect((await stepB()).result).toMatch(/^changed: /);
    const first = await row();
    expect(first.hero_poster_media_asset_id).toBe(assets.heroPoster);
    expect(first.presentation_config.artworkAlt.heroPoster).toBe(HAND_SET_ALT);

    const again = await stepB();
    expect(again).toMatchObject({ result: "no-op", config_matches: true, hero_poster_media_asset_id: assets.heroPoster });
    expect((await row()).revision).toBe(first.revision);
  });

  it("a rerun of the original command leaves an automatic poster and its blank alt in place", async () => {
    await stepB();
    await autoPosterGoesLive();
    const before = await row();

    const rerun = await stepB();
    expect(rerun).toMatchObject({ result: "no-op", config_matches: true, hero_poster_media_asset_id: assets.autoPoster });
    const after = await row();
    expect(after.hero_poster_media_asset_id).toBe(assets.autoPoster);
    expect(after.presentation_config.artworkAlt.heroPoster).toBe("");
    expect(after.revision).toBe(before.revision);
  });

  it("still applies other changes on a rerun without touching the poster, and keeps its alt key by key", async () => {
    await stepB();
    await autoPosterGoesLive();

    for (const inputs of [{ headerPartner: assets.newHeader }, { headerPartner: assets.newHeader, heroPoster: undefined }]) {
      const result = await stepB(inputs);
      expect(result.config_matches).toBe(true);
      const after = await row();
      expect(after.header_partner_media_asset_id).toBe(assets.newHeader);
      expect(after.hero_poster_media_asset_id).toBe(assets.autoPoster);
      expect(after.presentation_config.artworkAlt).toMatchObject({ heroPoster: "", headerPartner: "Foothill Transit" });
    }
  });

  it("does not validate a passed poster the row will not use, so a retired hand-set poster cannot block a rerun", async () => {
    await stepB();
    await autoPosterGoesLive();
    await db.query("update onzio.media_assets set status = 'orphaned', deleted_at = now() where id = $1", [assets.heroPoster]);

    expect(await stepB()).toMatchObject({ result: "no-op", hero_poster_media_asset_id: assets.autoPoster });
  });

  it("without --hero-poster on a first-time row, leaves the poster empty and adds no poster alt", async () => {
    const result = await stepB({ heroPoster: undefined });
    expect(result).toMatchObject({ config_matches: true, hero_poster_media_asset_id: null });
    expect((await row()).presentation_config.artworkAlt).not.toHaveProperty("heroPoster");
  });
});
