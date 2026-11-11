import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { gamesNeedingNumbers } from "@/lib/admin-seasons-data";
import {
  emptyFieldNumbers,
  emptyKeeperNumbers,
  fieldNumbersFrom,
  goalSummary,
  groupFor,
  keeperNumbersFrom,
  saveRows,
  setFieldNumber,
  setKeeperNumber,
  tidyName,
  type NumbersPlayer,
} from "@/lib/player-numbers";
import { handLines } from "@/components/admin/reimagined/SeasonTotals";
import type { TotalsPlayer } from "@/lib/admin-season-totals-data";

// ADMIN-RE-11c-2 (design cd-after-game, cd-season-totals; group 1 decisions 2, 3,
// 6, 7, 11): "Who played and scored?" after Enter a score, the hub's "games need
// player numbers", and the Season totals page. Pins the rules behind them, that
// no migration came with this part, and that the tenant select is untouched.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const PLAYER = "11111111-1111-4111-8111-111111111111";
const GAME = "22222222-2222-4222-8222-222222222222";

describe("played (decision 7)", () => {
  it("is set by any number and can be set on its own", () => {
    expect(setFieldNumber(emptyFieldNumbers(), "goals", 1)).toMatchObject({ played: true, goals: 1 });
    expect(setFieldNumber(emptyFieldNumbers(), "starts", true)).toMatchObject({ played: true, starts: true });
    expect(setKeeperNumber(emptyKeeperNumbers(), "saves", 3)).toMatchObject({ played: true, saves: 3 });
    expect(setFieldNumber(emptyFieldNumbers(), "played", true)).toMatchObject({ played: true, goals: 0 });
  });

  it("taking a number back to 0 keeps the player as played; switching Played off clears the row", () => {
    const scored = setFieldNumber(emptyFieldNumbers(), "goals", 2);
    expect(setFieldNumber(scored, "goals", 0)).toMatchObject({ played: true, goals: 0 });
    expect(setFieldNumber(scored, "played", false)).toEqual(emptyFieldNumbers());
    expect(setKeeperNumber(setKeeperNumber(emptyKeeperNumbers(), "saves", 4), "played", false)).toEqual(emptyKeeperNumbers());
  });

  it("reads a saved row: an old 'Save all' row with nothing in it is not played", () => {
    expect(fieldNumbersFrom({ played: false, goals: 0, mins: 0, starts: false }).played).toBe(false);
    expect(fieldNumbersFrom({ played: false, goals: 1 }).played).toBe(true);
    expect(fieldNumbersFrom({ played: true }).played).toBe(true);
    expect(keeperNumbersFrom({ mins: 999 }).mins).toBe(300);
    expect(fieldNumbersFrom(undefined)).toEqual(emptyFieldNumbers());
  });
});

describe("the goals against the score (decision 6)", () => {
  it("says how many of the score's goals are added, and never blocks", () => {
    expect(goalSummary(3, 2, false)).toEqual({ added: 2, of: 3, over: false, ok: false });
    expect(goalSummary(3, 3, false)).toEqual({ added: 3, of: 3, over: false, ok: true });
    expect(goalSummary(3, 2, true)).toEqual({ added: 3, of: 3, over: false, ok: true });
    expect(goalSummary(3, 4, true)).toEqual({ added: 4, of: 3, over: true, ok: false });
    expect(goalSummary(0, 0, false)).toEqual({ added: 0, of: 0, over: false, ok: true });
  });
});

describe("what one save sends", () => {
  it("every row has every column and an explicit played, outfield and keepers apart", () => {
    const players: NumbersPlayer[] = [
      { id: PLAYER, name: "Ana", number: 9, group: "fwd", keeper: false, numbers: setFieldNumber(emptyFieldNumbers(), "goals", 1) },
      { id: GAME, name: "Ben", number: 1, group: "gk", keeper: true, numbers: emptyKeeperNumbers() },
    ];
    const rows = saveRows(players, GAME);
    expect(rows.field).toEqual([{ player_id: PLAYER, match_id: GAME, ...players[0].numbers }]);
    expect(rows.keepers[0]).toMatchObject({ player_id: GAME, match_id: GAME, played: false, saves: 0 });
    expect(Object.keys(rows.field[0]).sort()).toEqual(
      ["player_id", "match_id", "played", "starts", "goals", "assists", "yellow", "red", "mins", "tackles", "offsides", "fouls", "fouls_suffered"].sort(),
    );
    const request = adminDataRequestSchema.safeParse({
      table: "player_match_stats",
      operation: "upsert",
      onConflict: "player_id,match_id",
      columns: "player_id",
      payload: rows.field,
    });
    expect(request.success).toBe(true);
  });

  it("groups players by position, keepers first, and tidies spaces in names", () => {
    expect(groupFor("Goalkeeper", false)).toBe("gk");
    expect(groupFor("Defender", false)).toBe("def");
    expect(groupFor("Midfielder", false)).toBe("mid");
    expect(groupFor("Forward", false)).toBe("fwd");
    expect(groupFor("Forward", true)).toBe("gk");
    expect(tidyName("  Sam   Lee ")).toBe("Sam Lee");
  });
});

describe("games that need player numbers (decision 11)", () => {
  it("are scored games where nobody is marked as played, newest first", () => {
    const games = [
      { id: "a", opponent: "A", home: true, date: "2026-11-01", time: "10:00" },
      { id: "b", opponent: "B", home: false, date: "2026-11-08", time: "10:00" },
      { id: "c", opponent: "C", home: true, date: "2026-11-08", time: "18:00" },
    ];
    expect(gamesNeedingNumbers(games, new Set(["b"])).map((game) => game.id)).toEqual(["c", "a"]);
    expect(gamesNeedingNumbers(games, new Set(["a", "b", "c"]))).toEqual([]);
  });
});

describe("Season totals: from games and added by hand (decision 3)", () => {
  const ana: TotalsPlayer = {
    id: PLAYER,
    name: "Ana",
    number: 9,
    group: "fwd",
    gamesPlayed: 5,
    keeper: false,
    total: { goals: 7, assists: 1, tackles: 0, starts: 5, yellow: 0, red: 0, mins: 450, offsides: 0, fouls: 0, fouls_suffered: 0 },
    fromGames: { goals: 5, assists: 2, tackles: 0, starts: 5, yellow: 0, red: 0, mins: 450, offsides: 0, fouls: 0, fouls_suffered: 0 },
    added: { goals: 2, assists: -1, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0 },
  };

  it("says what came from games and what was added or taken off by hand", () => {
    expect(handLines(ana)).toEqual(["Goals: 5 from games · 2 added by hand", "Assists: 2 from games · 1 taken off by hand"]);
    expect(handLines({ ...ana, added: { ...ana.added, goals: 0, assists: 0 } })).toEqual([]);
  });
});

describe("where it lives", () => {
  const scorePage = source("app/admin/(protected)/score/[matchId]/page.tsx");
  const totalsPage = source("app/admin/(protected)/seasons/totals/page.tsx");
  const list = source("components/admin/reimagined/PlayerNumbers.tsx");
  const totals = source("components/admin/reimagined/SeasonTotals.tsx");
  const entry = source("components/admin/reimagined/ScoreEntry.tsx");

  it("both pages are reimagined-only and send a classic club to the old Stats pages", () => {
    expect(scorePage).toContain('portal.portal !== "reimagined") redirect(`${getAdminRouteHref("match-stats")}?view=match`)');
    expect(totalsPage).toContain('portal.portal !== "reimagined") redirect(`${getAdminRouteHref("match-stats")}?view=season`)');
    for (const page of [scorePage, totalsPage]) {
      expect(page).toContain("requireFreshClubSession(supabase)");
      expect(page).toMatch(/club\.role !== "owner" && club\.role !== "admin"/);
      expect(page).not.toMatch(/service[-_ ]?role/i);
    }
  });

  it("saves through the admin data route only", () => {
    for (const file of [list, totals]) {
      expect(file).toContain('fetch("/api/admin/data"');
      expect(file).not.toMatch(/createClient|supabase\./);
    }
    expect(list).toContain('onConflict: "player_id,match_id"');
    expect(totals).toContain('onConflict: "player_id,season_id"');
  });

  it("asks who played after a score saves, with Later", () => {
    expect(entry).toContain("Who played and scored?");
    expect(entry).toContain("Add player numbers");
    expect(entry).toContain("You’ll find it in This season");
    expect(entry).toContain("href={`/admin/score/${game.id}`}");
  });

  it("uses the glossary's words, not the old spreadsheet's", () => {
    for (const file of [list, totals]) {
      expect(file).not.toMatch(/Match stats|Season stats|Goals against|\bGA\b|Appearances/);
    }
    expect(list).toContain("Goals let in");
    expect(totals).toContain("added by hand");
  });

  it("came with no migration and no change to the tenant select", () => {
    const dir = resolve(process.cwd(), "supabase/migrations");
    for (const name of readdirSync(dir)) {
      expect(readFileSync(resolve(dir, name), "utf8"), name).not.toContain("ADMIN-RE-11c-2");
    }
    const clubContext = source("lib/club-context.ts");
    expect(clubContext).not.toMatch(/season_totals|season_adjustments|played/);
  });
});
