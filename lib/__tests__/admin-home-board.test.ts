import { describe, expect, it } from "vitest";
import {
  gameLine,
  needsSummary,
  pickBoardGames,
  recordShort,
  resultBars,
  signUpsNeed,
  versus,
} from "@/lib/admin-home-board";

// ADMIN-RE-24b: the new home's game picks and words (design:
// admin-plain-search-two-clubs.html).

const CHICAGO = "America/Chicago";
// Tuesday, Nov 10 2026, 12:00 in Chicago.
const NOW = new Date("2026-11-10T18:00:00Z");

const game = (over: Partial<Parameters<typeof pickBoardGames>[0][number]>) => ({
  id: "g",
  date: "2026-11-10",
  time: "19:30",
  opponent: "Westside Strikers",
  home: true,
  competition: "UPSL Midwest Central",
  venue: "Hanson Park",
  rose_city_score: null,
  opponent_score: null,
  ...over,
});

describe("pickBoardGames", () => {
  it("takes the oldest unscored game two hours after kickoff, and the next game not yet kicked off", () => {
    const rows = [
      game({ id: "scored", date: "2026-10-31", rose_city_score: 3, opponent_score: 2 }),
      game({ id: "missing-old", date: "2026-11-01" }),
      game({ id: "missing", date: "2026-11-07" }),
      game({ id: "today-morning", date: "2026-11-10", time: "11:00" }), // kicked off an hour ago
      game({ id: "tonight", date: "2026-11-10", time: "19:30" }),
      game({ id: "later", date: "2026-11-14" }),
    ];
    const picked = pickBoardGames(rows, CHICAGO, NOW);
    expect(picked.missingScore?.id).toBe("missing-old");
    expect(picked.nextGame?.id).toBe("tonight");
  });

  it("finds nothing when every game is scored or still to come", () => {
    expect(pickBoardGames([game({ id: "a", date: "2026-11-14" })], CHICAGO, NOW)).toEqual({
      missingScore: null,
      nextGame: expect.objectContaining({ id: "a" }),
    });
    expect(pickBoardGames([], CHICAGO, NOW)).toEqual({ missingScore: null, nextGame: null });
  });

  it("never treats a game that started less than two hours ago as missing its score", () => {
    const rows = [game({ id: "now", date: "2026-11-10", time: "11:00" })];
    expect(pickBoardGames(rows, CHICAGO, NOW)).toEqual({ missingScore: null, nextGame: null });
  });
});

describe("home words", () => {
  it("says how many things need you with plural rules", () => {
    expect(needsSummary(0)).toBe("Nothing needs you right now");
    expect(needsSummary(1)).toBe("1 thing needs you");
    expect(needsSummary(2)).toBe("2 things need you");
    expect(needsSummary(1284)).toBe("1,284 things need you");
  });

  it("writes a game as the design does", () => {
    const g = game({ date: "2026-11-14" });
    expect(versus(g)).toBe("vs Westside Strikers");
    expect(versus({ ...g, home: false })).toBe("at Westside Strikers");
    expect(gameLine(g)).toBe("Sat, Nov 14 · Home · UPSL Midwest Central");
    expect(gameLine({ ...g, home: false }, "venue")).toBe("Sat, Nov 14 · 7:30 PM · Away · Hanson Park · UPSL Midwest Central");
    expect(gameLine({ ...g, home: null, competition: null, time: null }, "venue")).toBe("Sat, Nov 14 · Hanson Park");
  });

  it("names the forms new sign-ups came through, never the people", () => {
    expect(signUpsNeed(1, ["Youth Academy"])).toEqual({ title: "1 new sign-up this week", sub: "Youth Academy" });
    expect(signUpsNeed(3, ["Youth Academy", "Special Olympics Soccer", "Tryouts"])).toEqual({
      title: "3 new sign-ups this week",
      sub: "Youth Academy, Special Olympics Soccer and 1 more",
    });
    expect(signUpsNeed(2, []).sub).toBe("From your sign-up forms");
  });

  it("shortens a record and scales the bars to the biggest score", () => {
    expect(recordShort({ won: 8, drawn: 3, lost: 1 })).toBe("W8 D3 L1");
    const bars = resultBars([
      { id: "a", date: "2026-10-01", opponent: "A", us: 4, them: 1 },
      { id: "b", date: "2026-10-08", opponent: "B", us: 0, them: 2 },
      { id: "c", date: "2026-10-15", opponent: "C", us: 99, them: 0 },
    ]);
    expect(bars.map((bar) => [bar.up, bar.down])).toEqual([
      [4 / 99, 1 / 99],
      [0, 2 / 99],
      [1, 0],
    ]);
    expect(bars[0].label).toBe("4–1 A");
    expect(resultBars([{ id: "z", date: "2026-10-01", opponent: "Z", us: 0, them: 0 }])[0]).toMatchObject({ up: 0, down: 0 });
  });
});
