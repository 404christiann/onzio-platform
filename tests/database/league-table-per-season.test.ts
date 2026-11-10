import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-RE-11b (decision 0002): one league table per season, and our row
// (is_club) updates itself from the club's saved league games. Each test runs
// in a transaction that is rolled back.
//
// Christian's decision (2026-11-09, "Keep typed, new seasons auto"): a season that
// existed before the migration keeps its hand-typed our row
// (seasons.standings_from_scores = false); a season created after works it out
// from its saved league games (true). The seed runs after the migrations, so
// Alpha's seeded season is true here; the tests that need a season that "was
// there before" set it false, and the migration replay at the foot proves
// every season that existed when it ran is false.

const MIGRATION = resolve(__dirname, "../../supabase/migrations/20261110090000_league_table_per_season.sql");
const ALPHA = CLUB_IDS.alpha;
const BRAVO = CLUB_IDS.bravo;
const CHARLIE = CLUB_IDS.charlie;

let db: Client;
let season: string;

type Row = { played: number; wins: number; draws: number; losses: number; goal_difference: number; points: number };

async function rejects(sql: string, values: unknown[], message: string) {
  await db.query("savepoint expected_failure");
  try {
    await expect(db.query(sql, values)).rejects.toThrow(message);
  } finally {
    await db.query("rollback to savepoint expected_failure");
  }
}

async function addSeason(club: string, label: string, startYear: number, active = false): Promise<string> {
  return (await db.query(
    "insert into onzio.seasons (club_id,label,start_year,end_year,active) values ($1,$2,$3,$3,$4) returning id",
    [club, label, startYear, active],
  )).rows[0].id;
}

async function addTeam(club: string, seasonId: string | null, name: string, order: number, isClub = false): Promise<string> {
  return (await db.query(
    "insert into onzio.league_standings (club_id,season_id,team_name,sort_order,is_club) values ($1,$2,$3,$4,$5) returning id",
    [club, seasonId, name, order, isClub],
  )).rows[0].id;
}

async function addGame(
  club: string,
  seasonId: string,
  ours: number | null,
  theirs: number | null,
  extra: { league?: boolean; date?: string } = {},
): Promise<string> {
  return (await db.query(
    `insert into onzio.matches (club_id,season_id,date,time,opponent,home,venue,rose_city_score,opponent_score,league_game)
     values ($1,$2,$3,'10:00','RE-11b opponent',true,'Park',$4,$5,$6) returning id`,
    [club, seasonId, extra.date ?? "2026-11-14", ours, theirs, extra.league ?? true],
  )).rows[0].id;
}

async function ourRow(club: string, seasonId: string): Promise<Row> {
  return (await db.query(
    "select played,wins,draws,losses,goal_difference,points from onzio.league_standings where club_id=$1 and season_id=$2 and is_club",
    [club, seasonId],
  )).rows[0];
}

const ZERO: Row = { played: 0, wins: 0, draws: 0, losses: 0, goal_difference: 0, points: 0 };

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

describe("the new columns", () => {
  it("defaults league_game to true and refuses null", async () => {
    const game = await addGame(ALPHA, season, null, null);
    expect((await db.query("select league_game from onzio.matches where id=$1", [game])).rows[0].league_game).toBe(true);
    await rejects("update onzio.matches set league_game=null where id=$1", [game], "league_game");
  });

  it("makes season_id required and tied to the same club's season", async () => {
    const bravoSeason = (await db.query("select id from onzio.seasons where club_id=$1 and active", [BRAVO])).rows[0].id;
    await rejects(
      "insert into onzio.league_standings (club_id,season_id,team_name) values ($1,$2,'Wrong club')",
      [ALPHA, bravoSeason],
      "league_standings_season_fk",
    );
  });

  it("keeps team names to 60 characters, counted as characters", async () => {
    await addTeam(ALPHA, season, "x".repeat(60), 0);
    await addTeam(ALPHA, season, "é".repeat(60), 1);
    await rejects(
      "insert into onzio.league_standings (club_id,season_id,team_name,sort_order) values ($1,$2,$3,2)",
      [ALPHA, season, "x".repeat(61)],
      "league_standings_team_name_length",
    );
  });
});

describe("sort order", () => {
  it("is unique inside one club's season", async () => {
    await addTeam(ALPHA, season, "One", 0);
    await addTeam(ALPHA, season, "Two", 1);
    await db.query("set constraints all immediate");
    await rejects(
      "insert into onzio.league_standings (club_id,season_id,team_name,sort_order) values ($1,$2,'Clash',1)",
      [ALPHA, season],
      "league_standings_club_season_sort_order_key",
    );
  });

  it("lets another season, or another club, use the same numbers", async () => {
    const other = await addSeason(ALPHA, "RE-11b other", 2030);
    await addTeam(ALPHA, season, "One", 0);
    await addTeam(ALPHA, other, "One", 0);
    const bravoSeason = (await db.query("select id from onzio.seasons where club_id=$1 and active", [BRAVO])).rows[0].id;
    await addTeam(BRAVO, bravoSeason, "One", 0);
  });

  it("lets one save swap and shift the order of several rows", async () => {
    const a = await addTeam(ALPHA, season, "A", 0);
    const b = await addTeam(ALPHA, season, "B", 1);
    const c = await addTeam(ALPHA, season, "C", 2);
    // What the standings editor sends: existing rows upserted with new indexes in one statement.
    await db.query(
      `insert into onzio.league_standings (id,club_id,season_id,team_name,sort_order)
       values ($1,$4,$5,'A',2),($2,$4,$5,'B',0),($3,$4,$5,'C',1)
       on conflict (id) do update set sort_order = excluded.sort_order`,
      [a, b, c, ALPHA, season],
    );
    await db.query("set constraints all immediate");
    const order = (await db.query("select team_name from onzio.league_standings where club_id=$1 and season_id=$2 order by sort_order", [ALPHA, season])).rows;
    expect(order.map((row) => row.team_name)).toEqual(["B", "C", "A"]);
  });
});

describe("a row saved without a season (code deployed before this change)", () => {
  it("goes to the club's shown season", async () => {
    const id = await addTeam(ALPHA, null, "Old code team", 0);
    const row = (await db.query("select season_id from onzio.league_standings where id=$1", [id])).rows[0];
    expect(row.season_id).toBe(season);
  });

  it("goes to the newest season when none is shown", async () => {
    await db.query("update onzio.seasons set active=false where club_id=$1", [ALPHA]);
    const newer = await addSeason(ALPHA, "RE-11b newer", 2031);
    const id = await addTeam(ALPHA, null, "Old code team", 0);
    expect((await db.query("select season_id from onzio.league_standings where id=$1", [id])).rows[0].season_id).toBe(newer);
  });

  it("says plainly that a club with no season needs one first", async () => {
    await rejects(
      "insert into onzio.league_standings (club_id,team_name) values ($1,'No season')",
      [CHARLIE],
      "Add a season before adding a league table.",
    );
  });
});

describe("starting a season copies the teams at zero", () => {
  it("copies names, order, our team and logos, with every number at zero", async () => {
    await db.query(
      `insert into onzio.league_standings
         (club_id,season_id,team_name,team_abbreviation,logo_url,is_club,sort_order,played,wins,draws,losses,goal_difference,points)
       values ($1,$2,'Our team','OUR',null,true,0,10,6,2,2,9,20),
              ($1,$2,'Rivals FC','RIV',null,false,1,10,5,3,2,4,18)`,
      [ALPHA, season],
    );
    const next = await addSeason(ALPHA, "RE-11b next", 2032);
    const copied = (await db.query(
      `select team_name,team_abbreviation,is_club,sort_order,played,wins,draws,losses,goal_difference,points
       from onzio.league_standings where club_id=$1 and season_id=$2 order by sort_order`,
      [ALPHA, next],
    )).rows;
    expect(copied).toEqual([
      { team_name: "Our team", team_abbreviation: "OUR", is_club: true, sort_order: 0, ...ZERO },
      { team_name: "Rivals FC", team_abbreviation: "RIV", is_club: false, sort_order: 1, ...ZERO },
    ]);
    // The old season keeps its table as it was.
    const kept = (await db.query("select played,points from onzio.league_standings where club_id=$1 and season_id=$2 and is_club", [ALPHA, season])).rows[0];
    expect(kept).toEqual({ played: 10, points: 20 });
  });

  it("copies from the club's newest table, and a third season copies the second", async () => {
    await addTeam(ALPHA, season, "First table team", 0, true);
    const second = await addSeason(ALPHA, "RE-11b second", 2032);
    await db.query("update onzio.league_standings set team_name='Renamed in second' where club_id=$1 and season_id=$2", [ALPHA, second]);
    const third = await addSeason(ALPHA, "RE-11b third", 2033);
    const names = (await db.query("select team_name from onzio.league_standings where club_id=$1 and season_id=$2", [ALPHA, third])).rows;
    expect(names).toEqual([{ team_name: "Renamed in second" }]);
  });

  it("copies nothing when the club has no table yet, and never another club's", async () => {
    const empty = await addSeason(ALPHA, "RE-11b empty", 2034);
    expect((await db.query("select count(*)::int as n from onzio.league_standings where club_id=$1 and season_id=$2", [ALPHA, empty])).rows[0].n).toBe(0);
    const bravoSeason = (await db.query("select id from onzio.seasons where club_id=$1 and active", [BRAVO])).rows[0].id;
    await addTeam(BRAVO, bravoSeason, "Bravo only", 0);
    const alphaNext = await addSeason(ALPHA, "RE-11b alpha next", 2035);
    expect((await db.query("select count(*)::int as n from onzio.league_standings where club_id=$1 and season_id=$2", [ALPHA, alphaNext])).rows[0].n).toBe(0);
  });

  it("lets a season with only its copied table be deleted", async () => {
    await addTeam(ALPHA, season, "Team", 0);
    const next = await addSeason(ALPHA, "RE-11b deletable", 2036);
    await db.query("delete from onzio.seasons where id=$1", [next]);
    expect((await db.query("select count(*)::int as n from onzio.league_standings where season_id=$1", [next])).rows[0].n).toBe(0);
  });
});

describe("saving a score updates our row", () => {
  let other: string;

  beforeEach(async () => {
    await addTeam(ALPHA, season, "Our team", 0, true);
    other = await addTeam(ALPHA, season, "Rivals FC", 1);
  });

  it("counts a win, a draw and a loss, goal difference and points", async () => {
    await addGame(ALPHA, season, 3, 1);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 2, points: 3 });
    await addGame(ALPHA, season, 1, 1);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, goal_difference: 2, points: 4 });
    await addGame(ALPHA, season, 0, 2);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 3, wins: 1, draws: 1, losses: 1, goal_difference: 0, points: 4 });
  });

  it("counts a game only once both scores are in", async () => {
    const game = await addGame(ALPHA, season, null, null);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
    await db.query("update onzio.matches set rose_city_score=2 where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
    await db.query("update onzio.matches set opponent_score=0 where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 2, points: 3 });
  });

  it("follows an edited score and a cleared score back, without drifting", async () => {
    const game = await addGame(ALPHA, season, 2, 0);
    await addGame(ALPHA, season, 1, 1);
    await db.query("update onzio.matches set rose_city_score=0, opponent_score=4 where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 2, wins: 0, draws: 1, losses: 1, goal_difference: -4, points: 1 });
    // The same score saved again changes nothing.
    await db.query("update onzio.matches set rose_city_score=0, opponent_score=4 where id=$1", [game]);
    await db.query("update onzio.matches set rose_city_score=0, opponent_score=4 where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 2, wins: 0, draws: 1, losses: 1, goal_difference: -4, points: 1 });
    await db.query("update onzio.matches set rose_city_score=null, opponent_score=null where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 0, draws: 1, losses: 0, goal_difference: 0, points: 1 });
  });

  it("drops a deleted game", async () => {
    const game = await addGame(ALPHA, season, 5, 0);
    await db.query("delete from onzio.matches where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
  });

  it("ignores games that are not league games, and follows the switch", async () => {
    const friendly = await addGame(ALPHA, season, 4, 0, { league: false });
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
    await db.query("update onzio.matches set league_game=true where id=$1", [friendly]);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 4, points: 3 });
    await db.query("update onzio.matches set league_game=false where id=$1", [friendly]);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
  });

  it("keeps each season's table to that season's games, and follows a game moved between seasons", async () => {
    const next = await addSeason(ALPHA, "RE-11b next", 2032);
    const game = await addGame(ALPHA, season, 2, 1);
    await addGame(ALPHA, next, 0, 0);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 1, points: 3 });
    expect(await ourRow(ALPHA, next)).toEqual({ played: 1, wins: 0, draws: 1, losses: 0, goal_difference: 0, points: 1 });
    await db.query("update onzio.matches set season_id=$2 where id=$1", [game, next]);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
    expect(await ourRow(ALPHA, next)).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, goal_difference: 1, points: 4 });
  });

  it("never touches another team's row, another club's table or a past season", async () => {
    await db.query("update onzio.league_standings set played=7, points=11 where id=$1", [other]);
    const bravoSeason = (await db.query("select id from onzio.seasons where club_id=$1 and active", [BRAVO])).rows[0].id;
    await addTeam(BRAVO, bravoSeason, "Bravo us", 0, true);
    await db.query("update onzio.league_standings set played=4, points=9 where club_id=$1", [BRAVO]);
    const past = await addSeason(ALPHA, "RE-11b past", 2020);
    await addTeam(ALPHA, past, "Past us", 0, true);
    await db.query("update onzio.league_standings set played=3, points=5 where season_id=$1", [past]);
    await addGame(ALPHA, season, 1, 0);
    expect((await db.query("select played,points from onzio.league_standings where id=$1", [other])).rows[0]).toEqual({ played: 7, points: 11 });
    expect((await db.query("select played,points from onzio.league_standings where club_id=$1", [BRAVO])).rows[0]).toEqual({ played: 4, points: 9 });
    expect((await db.query("select played,points from onzio.league_standings where season_id=$1", [past])).rows[0]).toEqual({ played: 3, points: 5 });
  });

  it("is a no-op for a season with no table, or with no team marked as ours", async () => {
    const bare = await addSeason(ALPHA, "RE-11b bare", 2040);
    await addGame(ALPHA, bare, 2, 0);
    await db.query("update onzio.league_standings set is_club=false where club_id=$1 and season_id=$2", [ALPHA, season]);
    await addGame(ALPHA, season, 2, 0);
    expect((await db.query("select sum(played)::int as n from onzio.league_standings where club_id=$1 and season_id=$2", [ALPHA, season])).rows[0].n).toBe(0);
  });
});

describe("seasons that keep their typed row, and seasons that work it out", () => {
  it("is true for a season created after the migration, and never null", async () => {
    const created = await addSeason(ALPHA, "RE-11b created after", 2050);
    expect((await db.query("select standings_from_scores as f from onzio.seasons where id=$1", [created])).rows[0].f).toBe(true);
    await db.query("update onzio.seasons set standings_from_scores=null where id=$1", [created]).then(
      () => { throw new Error("expected a not-null failure"); },
      (error: Error) => expect(error.message).toContain("standings_from_scores"),
    );
  });

  it("leaves an existing season's typed row alone on a score save, an edit, a clear and a delete", async () => {
    await db.query("update onzio.seasons set standings_from_scores=false where id=$1", [season]); // as a season that was there before
    await db.query(
      `insert into onzio.league_standings (club_id,season_id,team_name,is_club,sort_order,played,wins,draws,losses,goal_difference,points)
       values ($1,$2,'Typed us',true,0,10,4,1,5,-3,13)`,
      [ALPHA, season],
    );
    const typed = { played: 10, wins: 4, draws: 1, losses: 5, goal_difference: -3, points: 13 };
    const game = await addGame(ALPHA, season, 3, 0);
    expect(await ourRow(ALPHA, season)).toEqual(typed);
    await db.query("update onzio.matches set rose_city_score=0, opponent_score=2 where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual(typed);
    await db.query("update onzio.matches set rose_city_score=null, opponent_score=null where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual(typed);
    await db.query("delete from onzio.matches where id=$1", [game]);
    expect(await ourRow(ALPHA, season)).toEqual(typed);
  });

  it("works out a new season's row on save, edit and clear, and ignores non-league games", async () => {
    await addTeam(ALPHA, season, "Our team", 0, true);
    const created = await addSeason(ALPHA, "RE-11b new hub season", 2051);
    expect(await ourRow(ALPHA, created)).toEqual(ZERO);
    const game = await addGame(ALPHA, created, 2, 1);
    expect(await ourRow(ALPHA, created)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 1, points: 3 });
    await db.query("update onzio.matches set rose_city_score=1, opponent_score=1 where id=$1", [game]);
    expect(await ourRow(ALPHA, created)).toEqual({ played: 1, wins: 0, draws: 1, losses: 0, goal_difference: 0, points: 1 });
    await addGame(ALPHA, created, 9, 0, { league: false });
    expect(await ourRow(ALPHA, created)).toEqual({ played: 1, wins: 0, draws: 1, losses: 0, goal_difference: 0, points: 1 });
    await db.query("update onzio.matches set rose_city_score=null, opponent_score=null where id=$1", [game]);
    expect(await ourRow(ALPHA, created)).toEqual(ZERO);
    // The season before it, still typed, was never touched.
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
  });

  it("starts working a typed season out from its games once it is switched on", async () => {
    await db.query("update onzio.seasons set standings_from_scores=false where id=$1", [season]);
    await db.query(
      "insert into onzio.league_standings (club_id,season_id,team_name,is_club,sort_order,played,points) values ($1,$2,'Typed us',true,0,10,13)",
      [ALPHA, season],
    );
    await addGame(ALPHA, season, 1, 0);
    expect(await ourRow(ALPHA, season)).toMatchObject({ played: 10, points: 13 });
    await db.query("update onzio.seasons set standings_from_scores=true where id=$1", [season]);
    const second = await addGame(ALPHA, season, 2, 2);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, goal_difference: 1, points: 4 });
    expect(second).toBeTruthy();
  });
});

describe("a Standings page saved from an old snapshot", () => {
  const stale = (id: string) =>
    db.query(
      `insert into onzio.league_standings (id,club_id,season_id,team_name,is_club,sort_order,played,wins,draws,losses,goal_difference,points)
       values ($1,$2,$3,'Renamed us',true,0,0,0,0,0,0,0)
       on conflict (id) do update set team_name=excluded.team_name, is_club=excluded.is_club, sort_order=excluded.sort_order,
         played=excluded.played, wins=excluded.wins, draws=excluded.draws, losses=excluded.losses,
         goal_difference=excluded.goal_difference, points=excluded.points`,
      [id, ALPHA, season],
    );

  it("cannot put the old numbers back on our row in a season that works them out, and still saves the rest", async () => {
    const ours = await addTeam(ALPHA, season, "Our team", 0, true);
    await addGame(ALPHA, season, 2, 0); // the score is saved after the page was opened
    await stale(ours); // the page, still showing zeros, is saved
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 2, points: 3 });
    expect((await db.query("select team_name from onzio.league_standings where id=$1", [ours])).rows[0].team_name).toBe("Renamed us");
    // The next score still moves it.
    await addGame(ALPHA, season, 0, 1);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 2, wins: 1, draws: 0, losses: 1, goal_difference: 1, points: 3 });
  });

  it("lets a season that is typed by hand change every number", async () => {
    await db.query("update onzio.seasons set standings_from_scores=false where id=$1", [season]);
    const ours = await addTeam(ALPHA, season, "Our team", 0, true);
    await db.query("update onzio.league_standings set played=10, points=13 where id=$1", [ours]);
    expect(await ourRow(ALPHA, season)).toMatchObject({ played: 10, points: 13 });
    await stale(ours);
    expect(await ourRow(ALPHA, season)).toEqual(ZERO);
  });

  it("lets another team's numbers be typed in a season that works out ours, and a newly marked team keep what was sent", async () => {
    const ours = await addTeam(ALPHA, season, "Our team", 0, true);
    const rival = await addTeam(ALPHA, season, "Rivals FC", 1);
    await db.query("update onzio.league_standings set played=7, points=11 where id=$1", [rival]);
    expect((await db.query("select played, points from onzio.league_standings where id=$1", [rival])).rows[0]).toEqual({ played: 7, points: 11 });
    // Moving "our team" to the rival: the new row keeps its typed numbers until the next score; the old one is now an ordinary row.
    await db.query("update onzio.league_standings set is_club=false where id=$1", [ours]);
    await db.query("update onzio.league_standings set is_club=true where id=$1", [rival]);
    expect((await db.query("select played, points from onzio.league_standings where id=$1", [rival])).rows[0]).toEqual({ played: 7, points: 11 });
    await addGame(ALPHA, season, 1, 0);
    expect(await ourRow(ALPHA, season)).toEqual({ played: 1, wins: 1, draws: 0, losses: 0, goal_difference: 1, points: 3 });
  });
});

describe("a copied table shares its logo files", () => {
  it("copies the logo address into the new season, so the same file is used by two seasons", async () => {
    await db.query(
      "insert into onzio.league_standings (club_id,season_id,team_name,logo_url,sort_order) values ($1,$2,'Rivals FC','https://example.test/storage/v1/object/public/standings/teams/rivals.png',0)",
      [ALPHA, season],
    );
    const next = await addSeason(ALPHA, "RE-11b shared logo", 2070);
    const urls = (await db.query(
      "select count(*)::int as n from onzio.league_standings where club_id=$1 and logo_url=$2",
      [ALPHA, "https://example.test/storage/v1/object/public/standings/teams/rivals.png"],
    )).rows[0].n;
    expect(urls).toBe(2);
    expect(next).toBeTruthy();
  });
});

describe("two scores saved at the same moment", () => {
  it("both count (the second waits for the first, then totals with it)", async () => {
    // Real committed data, removed in finally, so a second connection can see it.
    await db.query("rollback");
    const second = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
    await second.connect();
    const ids = { season: "", team: "", gameA: "", gameB: "" };
    try {
      ids.season = (await db.query(
        "insert into onzio.seasons (club_id,label,start_year,end_year) values ($1,'RE-11b race',2090,2090) returning id", [ALPHA])).rows[0].id;
      ids.team = (await db.query(
        "insert into onzio.league_standings (club_id,season_id,team_name,is_club) values ($1,$2,'Race us',true) returning id", [ALPHA, ids.season])).rows[0].id;
      ids.gameA = await addGame(ALPHA, ids.season, null, null);
      ids.gameB = await addGame(ALPHA, ids.season, null, null);
      await db.query("begin");
      await second.query("begin");
      await db.query("update onzio.matches set rose_city_score=1, opponent_score=0 where id=$1", [ids.gameA]);
      const pending = second.query("update onzio.matches set rose_city_score=2, opponent_score=0 where id=$1", [ids.gameB]);
      await new Promise((done) => setTimeout(done, 300));
      await db.query("commit");
      await pending;
      await second.query("commit");
      const row = (await db.query("select played,wins,goal_difference,points from onzio.league_standings where id=$1", [ids.team])).rows[0];
      expect(row).toEqual({ played: 2, wins: 2, goal_difference: 3, points: 6 });
    } finally {
      await second.query("rollback").catch(() => undefined);
      await second.end();
      await db.query("rollback").catch(() => undefined);
      if (ids.season) {
        await db.query("delete from onzio.matches where season_id=$1", [ids.season]);
        await db.query("delete from onzio.seasons where id=$1", [ids.season]);
      }
      await db.query("begin");
    }
  });
});

describe("the migration on rows that were there before it", () => {
  // Put the schema back to how production was, load legacy-shaped rows, run the
  // migration file, and look at what the backfill did. All inside this test's
  // transaction.
  async function stepBack() {
    await db.query("drop trigger refresh_league_row_after_game on onzio.matches");
    await db.query("drop trigger keep_computed_league_row on onzio.league_standings");
    await db.query("drop function onzio_private.keep_computed_league_row()");
    await db.query("drop trigger copy_league_standings_into_new_season on onzio.seasons");
    await db.query("drop trigger default_league_standings_season on onzio.league_standings");
    await db.query("alter table onzio.league_standings drop constraint league_standings_team_name_length");
    await db.query("alter table onzio.league_standings drop column season_id");
    await db.query("alter table onzio.matches drop column league_game");
    await db.query("alter table onzio.seasons drop column standings_from_scores");
    await db.query("drop function onzio_private.refresh_league_row_after_game()");
    await db.query("drop function onzio_private.refresh_club_league_row(uuid, uuid)");
    await db.query("drop function onzio_private.copy_league_standings_into_new_season()");
    await db.query("drop function onzio_private.default_league_standings_season()");
  }

  const legacy = (club: string, name: string, order: number, extra = "") =>
    db.query(
      `insert into onzio.league_standings (club_id,team_name,sort_order,played,points ${extra ? ",is_club" : ""})
       values ($1,$2,$3,7,13 ${extra ? ",true" : ""})`,
      [club, name, order],
    );

  it("moves every row to the shown season, renumbers a clashing order, and keeps the typed numbers", async () => {
    await stepBack();
    await legacy(ALPHA, "Dup B", 0);
    await legacy(ALPHA, "Dup A", 0);
    await legacy(ALPHA, "Ours", 1, "club");
    // Bravo: nothing shown, two seasons: the newest gets the table.
    await db.query("update onzio.seasons set active=false where club_id=$1", [BRAVO]);
    await addSeason(BRAVO, "RE-11b older", 2090);
    const newest = await addSeason(BRAVO, "RE-11b newest", 2091);
    await legacy(BRAVO, "Bravo team", 5);
    await db.query(readFileSync(MIGRATION, "utf8"));

    const alpha = (await db.query(
      "select team_name,season_id,sort_order,played,points from onzio.league_standings where club_id=$1 order by sort_order",
      [ALPHA],
    )).rows;
    expect(alpha.map((row) => row.season_id)).toEqual([season, season, season]);
    expect(alpha.map((row) => row.sort_order)).toEqual([0, 1, 2]);
    expect(alpha.map((row) => row.team_name).sort()).toEqual(["Dup A", "Dup B", "Ours"]);
    expect(alpha.every((row) => row.played === 7 && row.points === 13)).toBe(true);
    const bravo = (await db.query("select season_id,sort_order from onzio.league_standings where club_id=$1", [BRAVO])).rows;
    expect(bravo).toEqual([{ season_id: newest, sort_order: 5 }]);
    // Every season that existed keeps its typed row; one created after the migration works it out.
    const flags = (await db.query("select distinct standings_from_scores as f from onzio.seasons")).rows;
    expect(flags).toEqual([{ f: false }]);
    const created = await addSeason(ALPHA, "RE-11b after migration", 2060);
    expect((await db.query("select standings_from_scores as f from onzio.seasons where id=$1", [created])).rows[0].f).toBe(true);
  });

  it("stops, without changing anything, when a club has a table and no season", async () => {
    await stepBack();
    await legacy(CHARLIE, "No season team", 0);
    await expect(db.query(readFileSync(MIGRATION, "utf8"))).rejects.toThrow("a club has league table rows but no season");
  });

  it("stops when a team name is over 60 characters", async () => {
    await stepBack();
    await legacy(ALPHA, "x".repeat(61), 0);
    await expect(db.query(readFileSync(MIGRATION, "utf8"))).rejects.toThrow("over 60 characters");
  });
});
