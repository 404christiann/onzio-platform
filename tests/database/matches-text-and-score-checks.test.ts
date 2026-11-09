import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { CLUB_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-07c (decision 7): onzio.matches holds the same text limits as the
// admin's Zod contract, and scores from 0 to 99. Each test runs in a
// transaction that is rolled back.

let db: Client;
let gameId: string;

async function rejects(sql: string, values: unknown[], constraint: string) {
  await db.query("savepoint expected_failure");
  try {
    await expect(db.query(sql, values)).rejects.toThrow(constraint);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

const CONSTRAINTS: Record<keyof typeof MATCH_TEXT_LIMITS, string> = {
  opponent: "matches_opponent_length",
  opponent_short_name: "matches_opponent_short_name_length",
  venue: "matches_venue_length",
  competition: "matches_competition_length",
  address: "matches_address_length",
  city: "matches_city_length",
  state: "matches_state_length",
};

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  const season = (await db.query("select id from onzio.seasons where club_id=$1 order by active desc limit 1", [CLUB_IDS.alpha])).rows[0];
  gameId = (await db.query(
    `insert into onzio.matches (club_id, season_id, date, time, opponent, home, venue)
     values ($1,$2,'2026-11-14','10:00','RE-07c check',true,'Lincoln Park') returning id`,
    [CLUB_IDS.alpha, season.id],
  )).rows[0].id;
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("onzio.matches text limits", () => {
  it("are the admin's limits", () => {
    expect(Object.keys(CONSTRAINTS).sort()).toEqual(Object.keys(MATCH_TEXT_LIMITS).sort());
  });

  it.each(Object.entries(MATCH_TEXT_LIMITS))("keeps %s at %i characters and refuses one more", async (field, limit) => {
    const constraint = CONSTRAINTS[field as keyof typeof MATCH_TEXT_LIMITS];
    await db.query(`update onzio.matches set ${field}=$2 where id=$1`, [gameId, "x".repeat(limit)]);
    // Characters, not bytes: a limit of accented letters fits too.
    await db.query(`update onzio.matches set ${field}=$2 where id=$1`, [gameId, "é".repeat(limit)]);
    await rejects(`update onzio.matches set ${field}=$2 where id=$1`, [gameId, "x".repeat(limit + 1)], constraint);
  });

  it("still lets the optional text be empty", async () => {
    await db.query(
      "update onzio.matches set opponent_short_name=null, competition=null, address=null, city=null, state=null where id=$1",
      [gameId],
    );
  });
});

describe("onzio.matches scores", () => {
  it("keeps whole scores from 0 to 99, and no score at all", async () => {
    for (const [ours, theirs] of [[0, 0], [99, 99], [null, null]]) {
      await db.query("update onzio.matches set rose_city_score=$2, opponent_score=$3 where id=$1", [gameId, ours, theirs]);
    }
  });

  it("refuses a score over 99 on either side, and below 0 as before", async () => {
    await rejects("update onzio.matches set rose_city_score=100 where id=$1", [gameId], "matches_rose_city_score_max");
    await rejects("update onzio.matches set opponent_score=100 where id=$1", [gameId], "matches_opponent_score_max");
    await rejects("update onzio.matches set rose_city_score=-1 where id=$1", [gameId], "rose_city_score_check");
  });
});
