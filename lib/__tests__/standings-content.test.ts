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

  it("returns an empty array on no data when fallbackToSample is false, instead of the Rose City sample table", () => {
    expect(normalizeStandingsRows([], { fallbackToSample: false })).toEqual([]);
  });

  it("still returns the sample table on no data when fallbackToSample is omitted, preserving existing callers' behavior", () => {
    expect(normalizeStandingsRows([])).toEqual(DEFAULT_STANDINGS_ROWS);
  });

  it("ignores fallbackToSample entirely when real rows are present", () => {
    const real = [row("row-a", 5, 1)];
    expect(normalizeStandingsRows(real, { fallbackToSample: false })).toHaveLength(1);
  });

  it("never leaks another club's team names through the disabled fallback", () => {
    // The sample table is Rose City's; academy@1 and editorial@1 previews opt
    // out of it so DCFC/Lions admins never see "Rose City FC" as their own.
    const sampleNames = DEFAULT_STANDINGS_ROWS.map((item) => item.team_name);
    expect(sampleNames).toContain("Rose City FC");
    expect(
      normalizeStandingsRows([], { fallbackToSample: false }).map(
        (item) => item.team_name,
      ),
    ).toEqual([]);
  });
});
