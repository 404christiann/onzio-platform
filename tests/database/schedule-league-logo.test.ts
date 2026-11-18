import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS } from "../fixtures/entities";

it("accepts owned published league media, protects shared references, and rejects foreign or retired images", async () => {
  assertSafeTestEnvironment();
  const db = new Client(localPostgresConfig());
  await db.connect();
  const asset = randomUUID(), foreign = randomUUID(), retired = randomUUID(), match = randomUUID();
  try {
    await db.query("begin");
    const season = (await db.query("select id from onzio.seasons where club_id=$1 limit 1", [CLUB_IDS.alpha])).rows[0].id;
    for (const [id, club, status] of [[asset, CLUB_IDS.alpha, "published"], [foreign, CLUB_IDS.bravo, "published"], [retired, CLUB_IDS.alpha, "orphaned"]]) {
      await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
        values($1,$2,'onzio-media',$3,'schedule','graphic','image/webp',100,100,100,$4,$5,now())`,
        [id, club, `${club}/schedule/${id}.webp`, "a".repeat(64), status]);
    }
    await db.query("insert into onzio.matches(id,club_id,season_id,date,time,opponent,league_logo_asset_id) values($1,$2,$3,'2027-05-02','19:45','League logo regression',$4)", [match, CLUB_IDS.alpha, season, asset]);
    expect((await db.query("select league_logo_asset_id from onzio.matches where id=$1", [match])).rows[0].league_logo_asset_id).toBe(asset);
    expect((await db.query("select onzio_private.media_asset_has_references($1,$2,$3) linked", [CLUB_IDS.alpha, asset, `${CLUB_IDS.alpha}/schedule/${asset}.webp`])).rows[0].linked).toBe(true);
    for (const [id, message] of [[foreign, "MEDIA_NOT_PUBLISHED"], [retired, "MEDIA_NOT_PUBLISHED"]]) {
      await db.query("savepoint invalid_media");
      await expect(db.query("update onzio.matches set league_logo_asset_id=$1 where id=$2", [id, match])).rejects.toThrow(message);
      await db.query("rollback to savepoint invalid_media");
    }
    await db.query("savepoint invalid_url");
    await expect(db.query("update onzio.matches set league_logo_url='javascript:alert(1)' where id=$1", [match])).rejects.toThrow("matches_league_logo_url_check");
    await db.query("rollback to savepoint invalid_url");
    await db.query("update onzio.matches set league_logo_asset_id=null,league_logo_url=null where id=$1", [match]);
    expect((await db.query("select onzio_private.media_asset_has_references($1,$2,$3) linked", [CLUB_IDS.alpha, asset, `${CLUB_IDS.alpha}/schedule/${asset}.webp`])).rows[0].linked).toBe(false);
  } finally { await db.query("rollback"); await db.end(); }
});
