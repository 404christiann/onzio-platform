import { describe, expect, it } from "vitest";
import {
  DEFAULT_STANDINGS_ROWS,
  normalizeStandingsRows,
  sortStandingsRows,
  teamAbbreviation,
} from "@/lib/standings-content";
import type { DBLeagueStandingRow } from "@/lib/db-types";

function row(
  id: string,
  points: number,
  goalDifference: number,
  wins = 0,
): DBLeagueStandingRow {
  return {
    id,
    team_name: id,
    team_abbreviation: null,
    logo_url: null,
    played: 1,
    wins,
    draws: 0,
    losses: 0,
    goal_difference: goalDifference,
    points,
    is_club: false,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };
}

describe("teamAbbreviation", () => {
  it("uses the first two words", () => {
    expect(teamAbbreviation("Rose City FC")).toBe("RC");
  });

  it("falls back for empty names", () => {
    expect(teamAbbreviation("")).toBe("FC");
  });
});

describe("sortStandingsRows", () => {
  it("sorts by points, goal difference, then wins", () => {
    const sorted = sortStandingsRows([
      row("third", 10, 2, 3),
      row("first", 12, 1, 3),
      row("second", 10, 5, 2),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});

describe("normalizeStandingsRows", () => {
  it("returns default rows when the database has no standings yet", () => {
    expect(normalizeStandingsRows([])).toEqual(DEFAULT_STANDINGS_ROWS);
  });

  it("fills missing abbreviations from team names", () => {
    const [normalized] = normalizeStandingsRows([
      {
        ...row("row-a", 1, 0),
        team_name: "Pasadena Athletic",
        team_abbreviation: "",
      },
    ]);

    expect(normalized.team_abbreviation).toBe("PA");
  });
});
