import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema, LEAGUE_TEAM_NAME_LIMIT } from "@/lib/admin-data-contract";

// ADMIN-RE-11b: league table per season, our row updates itself. The database
// behavior is pinned in tests/database/league-table-per-season.test.ts; this
// file pins the write contract, the reads, the migration's place in the ledger
// and that tenant resolution did not change.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const SEASON_ID = "1f061f06-1f06-4f06-8f06-1f061f061f06";
const ROW_ID = "2f062f06-2f06-4f06-8f06-2f062f062f06";

const standingsWrite = (operation: "insert" | "upsert", payload: Record<string, unknown> | Record<string, unknown>[]) =>
  adminDataRequestSchema.safeParse({ table: "league_standings", operation, columns: "id", payload });
const matchWrite = (payload: Record<string, unknown>) =>
  adminDataRequestSchema.safeParse({ table: "matches", operation: "insert", columns: "id", payload });

describe("the write contract", () => {
  it("keeps a team name to 60 characters, counted before trimming", () => {
    expect(LEAGUE_TEAM_NAME_LIMIT).toBe(60);
    expect(standingsWrite("insert", { team_name: "x".repeat(60), season_id: SEASON_ID }).success).toBe(true);
    const over = standingsWrite("insert", { team_name: "x".repeat(61), season_id: SEASON_ID });
    expect(over.success).toBe(false);
    expect(standingsWrite("upsert", [{ id: ROW_ID, team_name: "y".repeat(61) }]).success).toBe(false);
  });

  it("takes a season on a table row, and refuses one that is not an id", () => {
    expect(standingsWrite("upsert", [{ id: ROW_ID, team_name: "Our team", season_id: SEASON_ID, played: 3 }]).success).toBe(true);
    expect(standingsWrite("insert", { team_name: "Our team", season_id: "not-an-id" }).success).toBe(false);
  });

  it("still lets the classic editor send its other columns", () => {
    expect(
      standingsWrite("upsert", [{
        id: null, team_name: "Rivals", team_abbreviation: "RIV", logo_url: null, played: 1, wins: 1, draws: 0,
        losses: 0, goal_difference: 2, points: 3, is_club: false, sort_order: 0, updated_at: "2026-11-10T00:00:00Z",
      }]).success,
    ).toBe(true);
  });

  it("takes league_game on a game as a true or false, and nothing else", () => {
    const game = { season_id: SEASON_ID, date: "2026-11-14", time: "10:00", opponent: "Rivals", venue: "Park" };
    expect(matchWrite({ ...game, league_game: false }).success).toBe(true);
    expect(matchWrite({ ...game, league_game: true }).success).toBe(true);
    expect(matchWrite({ ...game, league_game: "no" }).success).toBe(false);
    expect(matchWrite({ ...game, league_game: null }).success).toBe(false);
  });
});

describe("what reads the table", () => {
  it("filters the public and admin table by season, and falls back to nothing, not another season", () => {
    const queries = source("lib/queries.ts");
    const fn = queries.slice(queries.indexOf("export async function fetchLeagueStandings"), queries.indexOf("/** Fetches editable footer social media links. */"));
    expect(fn).toContain('.eq("season_id", seasonId)');
    expect(fn).toContain('.eq("active", true)');
  });

  it("filters the hub's league summary by the season on view", () => {
    expect(source("lib/admin-seasons-data.ts")).toMatch(/from\("league_standings"\)[\s\S]*?\.eq\("season_id", viewed\.id\)/);
  });

  it("shows our row's numbers read-only in a season that works them out, and never deletes a logo another season uses", () => {
    const page = source("app/admin/(protected)/standings/page.tsx");
    expect(page).toContain("readOnly={autoSeason && row.is_club}");
    expect(page).toContain("standings-auto-note");
    expect(page).toContain("logoUrlsNoLongerUsed(supabase, pendingDeleteUrls)");
    expect(page).not.toMatch(/deleteStorageUrls\("standings", pendingDeleteUrls/);
  });

  it("saves table rows into the season being edited", () => {
    const page = source("app/admin/(protected)/standings/page.tsx");
    expect(page).toContain("season_id: seasonId");
    expect(page).toContain("maxLength={LEAGUE_TEAM_NAME_LIMIT}");
  });

  it("asks League game? on Add a game and sends the answer", () => {
    const form = source("components/admin/reimagined/AddGame.tsx");
    expect(form).toContain("League game?");
    expect(form).toContain("league_game: leagueGame");
  });
});

describe("the migration", () => {
  const FILE = "20261110090000_league_table_per_season.sql";

  it("sorts after every migration on main and after the Rose City 2027 branch's last one", () => {
    const names = readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
    expect(names).toContain(FILE);
    expect(FILE.slice(0, 14) > "20261109210000").toBe(true);
    const later = names.filter((name) => name > FILE);
    expect(later).toEqual([]);
  });

  it("does what the plan says, with the security helpers where the repo keeps them", () => {
    const sql = source(`supabase/migrations/${FILE}`);
    expect(sql).toContain("add column league_game boolean not null default true");
    expect(sql).toContain("references onzio.seasons (club_id, id)");
    expect(sql).toContain("unique (club_id, season_id, sort_order) deferrable initially deferred");
    expect(sql).toContain("league_standings_team_name_length");
    // "Keep typed, new seasons auto": existing seasons false, seasons created after true.
    expect(sql).toMatch(/add column standings_from_scores boolean not null default false;\s+alter table onzio\.seasons\s+alter column standings_from_scores set default true;/);
    expect(sql).toContain("s.standings_from_scores");
    expect(sql).toContain("create trigger keep_computed_league_row");
    expect(sql.match(/security definer\s+set search_path = ''/g)?.length).toBe(5);
    expect(sql.match(/revoke all on function onzio_private\./g)?.length).toBe(5);
    expect(sql).not.toMatch(/drop table|truncate|delete from/i);
  });

  it("does not add to the tenant-resolution select (the 2026-08-14 outage)", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/league_game|season_id/);
    let changed: string[] = [];
    try {
      changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: process.cwd(), encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return;
    }
    expect(changed).not.toContain("lib/club-context.ts");
  });
});
