import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-11c (decision 0001): season totals are the sum of a player's saved
// player numbers plus a hand-entered adjustment. Christian's decision
// (2026-11-10, "Keep today's numbers"): the migration sets every adjustment to
// typed total - games, so no total visitors see moves, and an adjustment may be
// negative. Each test runs in a transaction that is rolled back.

const MIGRATION = resolve(__dirname, "../../supabase/migrations/20261110160000_season_totals_add_up.sql");
const ALPHA = CLUB_IDS.alpha;
const BRAVO = CLUB_IDS.bravo;

let db: Client;
let season: string;
let playerCount = 0;

async function rejects(sql: string, values: unknown[], message: string | RegExp) {
  await db.query("savepoint expected_failure");
  try {
    await expect(db.query(sql, values)).rejects.toThrow(message);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

async function asOwner(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}

async function addPlayer(club: string, keeper = false): Promise<string> {
  playerCount += 1;
  return (await db.query(
    "insert into onzio.players (club_id,number,name,position,age) values ($1,$2,$3,$4,20) returning id",
    [club, 80 + playerCount, `RE-11c player ${playerCount}`, keeper ? "Goalkeeper" : "Forward"],
  )).rows[0].id;
}

/** A player in the season, with a totals row (typed numbers optional). */
async function inSeason(club: string, seasonId: string, typed: Record<string, number> = {}, keeper = false): Promise<string> {
  const player = await addPlayer(club, keeper);
  const columns = ["club_id", "player_id", "season_id", ...Object.keys(typed)];
  const values = [club, player, seasonId, ...Object.values(typed)];
  await db.query(
    `insert into onzio.${keeper ? "goalkeeper" : "player"}_season_stats (${columns.join(",")})
     values (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    values,
  );
  return player;
}

async function addGame(club: string, seasonId: string, date = "2026-11-14"): Promise<string> {
  return (await db.query(
    `insert into onzio.matches (club_id,season_id,date,time,opponent,home,venue)
     values ($1,$2,$3,'10:00','RE-11c opponent',true,'Park') returning id`,
    [club, seasonId, date],
  )).rows[0].id;
}

async function numbers(club: string, player: string, game: string, values: Record<string, number | boolean>, keeper = false) {
  const columns = ["club_id", "player_id", "match_id", ...Object.keys(values)];
  await db.query(
    `insert into onzio.${keeper ? "goalkeeper" : "player"}_match_stats (${columns.join(",")})
     values (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    [club, player, game, ...Object.values(values)],
  );
}

async function adjust(club: string, player: string, seasonId: string, values: Record<string, number>, keeper = false) {
  const columns = ["club_id", "player_id", "season_id", ...Object.keys(values)];
  await db.query(
    `insert into onzio.${keeper ? "goalkeeper" : "player"}_season_adjustments (${columns.join(",")})
     values (${columns.map((_, index) => `$${index + 1}`).join(",")})`,
    [club, player, seasonId, ...Object.values(values)],
  );
}

async function totals(player: string, seasonId: string = season, keeper = false): Promise<Record<string, number>> {
  const { club_id: _club, player_id: _player, season_id: _season, ...rest } = (await db.query(
    `select * from onzio.${keeper ? "goalkeeper" : "player"}_season_totals where player_id=$1 and season_id=$2`,
    [player, seasonId],
  )).rows[0];
  return rest;
}

async function played(player: string, game: string, keeper = false): Promise<boolean> {
  return (await db.query(
    `select played from onzio.${keeper ? "goalkeeper" : "player"}_match_stats where player_id=$1 and match_id=$2`,
    [player, game],
  )).rows[0].played;
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  season = (await db.query("select id from onzio.seasons where club_id=$1 and active", [ALPHA])).rows[0].id;
});

afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("season totals add up", () => {
  it("are the sum of the games plus the adjustment", async () => {
    const player = await inSeason(ALPHA, season);
    const one = await addGame(ALPHA, season, "2026-11-01");
    const two = await addGame(ALPHA, season, "2026-11-08");
    await numbers(ALPHA, player, one, { starts: true, mins: 90, goals: 2, assists: 1, yellow: 1 });
    await numbers(ALPHA, player, two, { mins: 30, goals: 3 });
    await adjust(ALPHA, player, season, { goals: 2, mins: 180, starts: 2 });

    expect(await totals(player)).toEqual({
      games_played: 2, goals: 7, assists: 1, tackles: 0, starts: 3, yellow: 1, red: 0,
      mins: 300, offsides: 0, fouls: 0, fouls_suffered: 0,
    });
  });

  it("count only the season's own games, and a row with nothing entered adds nothing", async () => {
    const other = (await db.query(
      "insert into onzio.seasons (club_id,label,start_year,end_year) values ($1,'RE-11c other',2040,2041) returning id",
      [ALPHA],
    )).rows[0].id;
    const player = await inSeason(ALPHA, season);
    await db.query("insert into onzio.player_season_stats (club_id,player_id,season_id) values ($1,$2,$3)", [ALPHA, player, other]);
    await numbers(ALPHA, player, await addGame(ALPHA, season), { goals: 1 });
    await numbers(ALPHA, player, await addGame(ALPHA, season, "2026-11-21"), {});
    await numbers(ALPHA, player, await addGame(ALPHA, other, "2040-10-01"), { goals: 4 });

    expect((await totals(player)).goals).toBe(1);
    expect((await totals(player)).games_played).toBe(1);
    expect((await totals(player, other)).goals).toBe(4);
  });

  it("work the same for keepers", async () => {
    const keeper = await inSeason(ALPHA, season, {}, true);
    const game = await addGame(ALPHA, season);
    await numbers(ALPHA, keeper, game, { starts: true, mins: 90, saves: 6, goals_against: 1 }, true);
    await adjust(ALPHA, keeper, season, { saves: 10, clean_sheets: 3, mins: 900 }, true);

    expect(await totals(keeper, season, true)).toEqual({
      games_played: 1, goals_against: 1, saves: 16, clean_sheets: 3, starts: 1, yellow: 0, red: 0, mins: 990,
    });
  });

  it("list every player with a totals row, at 0 when nothing is entered", async () => {
    const player = await inSeason(ALPHA, season);
    expect(await totals(player)).toMatchObject({ games_played: 0, goals: 0, mins: 0 });
  });
});

describe("adjustments", () => {
  it("may be negative while the total stays at 0 or above", async () => {
    const player = await inSeason(ALPHA, season);
    await numbers(ALPHA, player, await addGame(ALPHA, season), { mins: 90, goals: 3 });
    await adjust(ALPHA, player, season, { goals: -3, mins: -40 });
    expect(await totals(player)).toMatchObject({ goals: 0, mins: 50 });
  });

  it("refuse one that would take a total below 0", async () => {
    const player = await inSeason(ALPHA, season);
    await numbers(ALPHA, player, await addGame(ALPHA, season), { goals: 1 });
    await rejects(
      "insert into onzio.player_season_adjustments (club_id,player_id,season_id,goals) values ($1,$2,$3,-2)",
      [ALPHA, player, season],
      "SEASON_TOTAL_BELOW_ZERO",
    );
    await adjust(ALPHA, player, season, { goals: -1 });
    await rejects(
      "update onzio.player_season_adjustments set goals=-2 where player_id=$1",
      [player],
      "SEASON_TOTAL_BELOW_ZERO",
    );
    const keeper = await inSeason(ALPHA, season, {}, true);
    await rejects(
      "insert into onzio.goalkeeper_season_adjustments (club_id,player_id,season_id,saves) values ($1,$2,$3,-1)",
      [ALPHA, keeper, season],
      "SEASON_TOTAL_BELOW_ZERO",
    );
  });

  it("never show a total below 0 when games are taken away later", async () => {
    const player = await inSeason(ALPHA, season);
    const game = await addGame(ALPHA, season);
    await numbers(ALPHA, player, game, { goals: 3 });
    await adjust(ALPHA, player, season, { goals: -2 });
    await db.query("delete from onzio.player_match_stats where player_id=$1", [player]);
    expect((await totals(player)).goals).toBe(0);
  });

  it("keep every number within 9,999, either way", async () => {
    const player = await inSeason(ALPHA, season);
    await adjust(ALPHA, player, season, { mins: 9999, goals: 9999 });
    await rejects("update onzio.player_season_adjustments set mins=10000 where player_id=$1", [player], "mins_check");
    await rejects("update onzio.player_season_adjustments set goals=10000 where player_id=$1", [player], "goals_check");
    // Below -9,999 the "never below 0" trigger answers first (it runs before the CHECK).
    await rejects("update onzio.player_season_adjustments set goals=-10000 where player_id=$1", [player], /goals_check|SEASON_TOTAL_BELOW_ZERO/);
    const keeper = await inSeason(ALPHA, season, {}, true);
    await adjust(ALPHA, keeper, season, { mins: 9999 }, true);
    await rejects("update onzio.goalkeeper_season_adjustments set mins=-10000 where player_id=$1", [keeper], /mins_check|SEASON_TOTAL_BELOW_ZERO/);
  });

  it("belong to a player who is in the season, and go when that row goes", async () => {
    const player = await addPlayer(ALPHA);
    await rejects(
      "insert into onzio.player_season_adjustments (club_id,player_id,season_id,goals) values ($1,$2,$3,1)",
      [ALPHA, player, season],
      "foreign key",
    );
    const member = await inSeason(ALPHA, season);
    await adjust(ALPHA, member, season, { goals: 2 });
    await db.query("delete from onzio.player_season_stats where player_id=$1", [member]);
    expect((await db.query("select count(*)::int as n from onzio.player_season_adjustments where player_id=$1", [member])).rows[0].n).toBe(0);
  });

  it("can't point at another club's player or season", async () => {
    const bravoSeason = (await db.query("select id from onzio.seasons where club_id=$1 and active", [BRAVO])).rows[0].id;
    const bravoPlayer = await inSeason(BRAVO, bravoSeason);
    await rejects(
      "insert into onzio.player_season_adjustments (club_id,player_id,season_id,goals) values ($1,$2,$3,1)",
      [ALPHA, bravoPlayer, bravoSeason],
      "foreign key",
    );
  });
});

describe("played", () => {
  it("is set by any number, and stays unset for a row with nothing in it", async () => {
    const player = await inSeason(ALPHA, season);
    const keeper = await inSeason(ALPHA, season, {}, true);
    const empty = await addGame(ALPHA, season, "2026-11-01");
    const scored = await addGame(ALPHA, season, "2026-11-08");
    const carded = await addGame(ALPHA, season, "2026-11-15");
    await numbers(ALPHA, player, empty, {});
    await numbers(ALPHA, player, scored, { goals: 1, played: false });
    await numbers(ALPHA, keeper, carded, { yellow: 1 }, true);
    expect(await played(player, empty)).toBe(false);
    expect(await played(player, scored)).toBe(true);
    expect(await played(keeper, carded, true)).toBe(true);
  });

  it("can be set on its own, and unset again when no number is left", async () => {
    const player = await inSeason(ALPHA, season);
    const game = await addGame(ALPHA, season);
    await numbers(ALPHA, player, game, { played: true });
    expect(await played(player, game)).toBe(true);
    expect((await totals(player)).games_played).toBe(1);
    await db.query("update onzio.player_match_stats set played=false where player_id=$1", [player]);
    expect(await played(player, game)).toBe(false);
    await db.query("update onzio.player_match_stats set assists=1, played=false where player_id=$1", [player]);
    expect(await played(player, game)).toBe(true);
  });

  it("is left alone by a save that doesn't mention it (the old Match stats page)", async () => {
    const player = await inSeason(ALPHA, season);
    const game = await addGame(ALPHA, season);
    await numbers(ALPHA, player, game, { played: true });
    await db.query(
      `insert into onzio.player_match_stats (club_id,player_id,match_id,goals) values ($1,$2,$3,0)
       on conflict (club_id,player_id,match_id) do update set goals=excluded.goals`,
      [ALPHA, player, game],
    );
    expect(await played(player, game)).toBe(true);
  });
});

describe("who can read and write", () => {
  it("lets visitors read a live club's totals but not write adjustments", async () => {
    const player = await inSeason(ALPHA, season);
    await numbers(ALPHA, player, await addGame(ALPHA, season), { goals: 2 });
    await db.query("set local role anon");
    const rows = (await db.query("select goals from onzio.player_season_totals where player_id=$1", [player])).rows;
    expect(rows).toEqual([{ goals: 2 }]);
    await rejects(
      "insert into onzio.player_season_adjustments (club_id,player_id,season_id,goals) values ($1,$2,$3,1)",
      [ALPHA, player, season],
      "permission denied",
    );
    await rejects("update onzio.player_season_totals set goals=1 where player_id=$1", [player], /permission denied|cannot update view/);
  });

  it("lets the club's owner write adjustments and nobody else", async () => {
    const player = await inSeason(ALPHA, season);
    await asOwner();
    await adjust(ALPHA, player, season, { goals: 2 });
    await db.query("update onzio.player_season_adjustments set goals=3 where player_id=$1", [player]);
    expect((await totals(player)).goals).toBe(3);
    await db.query("reset role");
    const other = await inSeason(ALPHA, season);
    await asOwner(USER_IDS.unaffiliated);
    const changed = await db.query("update onzio.player_season_adjustments set goals=4 where player_id=$1", [player]);
    expect(changed.rowCount).toBe(0);
    await rejects(
      "insert into onzio.player_season_adjustments (club_id,player_id,season_id,goals) values ($1,$2,$3,1)",
      [ALPHA, other, season],
      "row-level security",
    );
    await db.query("reset role");
    expect((await totals(player)).goals).toBe(3);
  });

  it("works out the below-0 check with the saving person's own rights", async () => {
    const definers = (await db.query(
      `select proname, prosecdef from pg_proc
       where proname in ('check_field_adjustment_keeps_totals','check_goalkeeper_adjustment_keeps_totals') order by proname`,
    )).rows;
    expect(definers).toEqual([
      { proname: "check_field_adjustment_keeps_totals", prosecdef: false },
      { proname: "check_goalkeeper_adjustment_keeps_totals", prosecdef: false },
    ]);
  });

  it("reads the views with the reader's own rights", async () => {
    const options = (await db.query(
      "select relname, reloptions from pg_class where relname in ('player_season_totals','goalkeeper_season_totals') order by relname",
    )).rows;
    expect(options).toEqual([
      { relname: "goalkeeper_season_totals", reloptions: ["security_invoker=true"] },
      { relname: "player_season_totals", reloptions: ["security_invoker=true"] },
    ]);
  });
});

describe("the migration on rows that were there before it", () => {
  // Put the schema back to how production was, load typed totals and saved
  // games, run the migration file, and look at what the backfill did.
  async function stepBack() {
    await db.query("drop view onzio.player_season_totals");
    await db.query("drop view onzio.goalkeeper_season_totals");
    await db.query("drop table onzio.player_season_adjustments");
    await db.query("drop table onzio.goalkeeper_season_adjustments");
    await db.query("drop trigger mark_field_player_played on onzio.player_match_stats");
    await db.query("drop trigger mark_goalkeeper_played on onzio.goalkeeper_match_stats");
    await db.query("drop function onzio_private.mark_field_player_played()");
    await db.query("drop function onzio_private.mark_goalkeeper_played()");
    await db.query("drop function onzio_private.check_field_adjustment_keeps_totals()");
    await db.query("drop function onzio_private.check_goalkeeper_adjustment_keeps_totals()");
    await db.query("alter table onzio.player_match_stats drop column played");
    await db.query("alter table onzio.goalkeeper_match_stats drop column played");
  }

  it("keeps every total exactly as it was typed, even below what the games give", async () => {
    await stepBack();
    const one = await addGame(ALPHA, season, "2026-11-01");
    const two = await addGame(ALPHA, season, "2026-11-08");
    // Typed above the games: games before Onzio.
    const above = await inSeason(ALPHA, season, { goals: 7, starts: 9, mins: 990 });
    await numbers(ALPHA, above, one, { starts: true, mins: 90, goals: 5 });
    // Typed below the games: never updated after games were entered.
    const below = await inSeason(ALPHA, season, { goals: 2, mins: 10, tackles: 1 });
    await numbers(ALPHA, below, one, { mins: 20, goals: 3, tackles: 4 });
    await numbers(ALPHA, below, two, { goals: 2 });
    // Typed equal to the games: needs no adjustment.
    const same = await inSeason(ALPHA, season, { goals: 1, mins: 45 });
    await numbers(ALPHA, same, one, { mins: 45, goals: 1 });
    // A "Save all" row with nothing in it, and nothing typed.
    const bench = await inSeason(ALPHA, season);
    await numbers(ALPHA, bench, one, {});
    // A keeper whose games carry cards the typed total doesn't.
    const keeper = await inSeason(ALPHA, season, { saves: 31, mins: 916, clean_sheets: 4 }, true);
    await numbers(ALPHA, keeper, one, { mins: 7, saves: 2, yellow: 2, red: 2 }, true);

    const before = (await db.query(
      `select player_id, goals, assists, tackles, starts, yellow, red, mins, offsides, fouls, fouls_suffered
       from onzio.player_season_stats order by player_id`,
    )).rows;
    const keepersBefore = (await db.query(
      `select player_id, goals_against, saves, clean_sheets, starts, yellow, red, mins
       from onzio.goalkeeper_season_stats order by player_id`,
    )).rows;

    await db.query(readFileSync(MIGRATION, "utf8"));

    const after = (await db.query(
      `select player_id, goals, assists, tackles, starts, yellow, red, mins, offsides, fouls, fouls_suffered
       from onzio.player_season_totals order by player_id`,
    )).rows;
    const keepersAfter = (await db.query(
      `select player_id, goals_against, saves, clean_sheets, starts, yellow, red, mins
       from onzio.goalkeeper_season_totals order by player_id`,
    )).rows;
    expect(after).toEqual(before);
    expect(keepersAfter).toEqual(keepersBefore);

    // The typed numbers themselves are untouched.
    expect((await db.query("select goals from onzio.player_season_stats where player_id=$1", [below])).rows[0].goals).toBe(2);
    // The adjustments are typed - games, negative where the games give more.
    const adjustments = (await db.query(
      "select player_id, goals, mins, tackles from onzio.player_season_adjustments where player_id = any($1)",
      [[above, below, same, bench]],
    )).rows;
    expect(adjustments).toEqual(expect.arrayContaining([
      { player_id: above, goals: 2, mins: 900, tackles: 0 },
      { player_id: below, goals: -3, mins: -10, tackles: -3 },
    ]));
    expect(adjustments).toHaveLength(2);
    expect((await db.query("select yellow, red, saves from onzio.goalkeeper_season_adjustments where player_id=$1", [keeper])).rows)
      .toEqual([{ yellow: -2, red: -2, saves: 29 }]);

    // Played: only rows with something in them.
    expect(await played(above, one)).toBe(true);
    expect(await played(below, two)).toBe(true);
    expect(await played(bench, one)).toBe(false);
    expect(await played(keeper, one, true)).toBe(true);
  });
});
