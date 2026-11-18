import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS } from "../fixtures/entities";

it("stores only the canonical YouTube embed link (or nothing) as a match replay", async () => {
  assertSafeTestEnvironment();
  const db = new Client(localPostgresConfig());
  await db.connect();
  const match = randomUUID();
  try {
    await db.query("begin");
    const season = (await db.query("select id from onzio.seasons where club_id=$1 limit 1", [CLUB_IDS.alpha])).rows[0].id;
    await db.query("insert into onzio.matches(id,club_id,season_id,date,time,opponent) values($1,$2,$3,'2027-03-20','19:45','Replay regression')", [match, CLUB_IDS.alpha, season]);
    expect((await db.query("select replay_video_url from onzio.matches where id=$1", [match])).rows[0].replay_video_url).toBeNull();
    for (const ok of ["https://www.youtube.com/embed/fJf_A4LdKDw?rel=0", "", null]) {
      await db.query("update onzio.matches set replay_video_url=$1 where id=$2", [ok, match]);
      expect((await db.query("select replay_video_url from onzio.matches where id=$1", [match])).rows[0].replay_video_url).toBe(ok);
    }
    for (const bad of ["https://www.youtube.com/watch?v=fJf_A4LdKDw", "https://vimeo.com/123456", "javascript:alert(1)", `https://www.youtube.com/embed/${"a".repeat(11)}?rel=0&autoplay=1`]) {
      await db.query("savepoint invalid_replay");
      await expect(db.query("update onzio.matches set replay_video_url=$1 where id=$2", [bad, match])).rejects.toThrow("matches_replay_video_url_check");
      await db.query("rollback to savepoint invalid_replay");
    }
  } finally { await db.query("rollback"); await db.end(); }
});
