import { describe, expect, it } from "vitest";
import {
  deleteVerdict,
  leagueSummary,
  pickViewedSeason,
  readySeason,
  statRowHasNumbers,
  suggestionFor,
  type HubSeason,
} from "@/lib/admin-seasons-data";

// ADMIN-RE-11a: the rules behind the Seasons hub, apart from the database reads.

let n = 0;
const season = (label: string, start: number, end = start, active = false): HubSeason => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  label,
  startYear: start,
  endYear: end,
  active,
  createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
});

describe("readySeason: a season that exists but is not shown on the website", () => {
  it("is none with no seasons, or while the newest season is the one shown", () => {
    expect(readySeason([])).toBeNull();
    expect(readySeason([season("2026", 2026, 2026, true), season("2025", 2025)])).toBeNull();
  });

  it("is the newest season when it is newer than the one shown", () => {
    const shown = season("Spring 2026", 2026, 2026, true);
    const fresh = season("Fall 2026", 2026);
    expect(readySeason([shown, fresh])?.label).toBe("Fall 2026");
  });

  it("is not an older season that was just never shown", () => {
    expect(readySeason([season("2026", 2026, 2026, true), season("2024", 2024)])).toBeNull();
  });

  it("is the newest season when nothing is shown yet", () => {
    expect(readySeason([season("2024", 2024), season("2025", 2025)])?.label).toBe("2025");
  });
});

describe("pickViewedSeason", () => {
  const shown = season("2026", 2026, 2026, true);
  const past = season("2025", 2025);
  const all = [shown, past];

  it("opens on the season the website shows", () => {
    expect(pickViewedSeason(all, undefined)?.id).toBe(shown.id);
  });

  it("opens the season asked for", () => {
    expect(pickViewedSeason(all, past.id)?.id).toBe(past.id);
  });

  it("ignores a season id that is not this club's, or not an id at all", () => {
    expect(pickViewedSeason(all, "11111111-1111-4111-8111-111111111111")?.id).toBe(shown.id);
    expect(pickViewedSeason(all, "not-an-id")?.id).toBe(shown.id);
  });

  it("opens on the newest season when none is shown, and on nothing with no seasons", () => {
    expect(pickViewedSeason([past], undefined)?.id).toBe(past.id);
    expect(pickViewedSeason([], undefined)).toBeNull();
  });
});

describe("suggestionFor", () => {
  it("follows the newest season by name and years", () => {
    const rows = [season("Spring 2026", 2026), season("Fall 2025", 2025)];
    expect(suggestionFor(rows, "2026-11-09").label).toBe("Fall 2026");
  });

  it("starts from the club's year with no season at all", () => {
    expect(suggestionFor([], "2026-11-09")).toEqual({ label: "2026", startYear: 2026, endYear: 2026 });
  });
});

describe("deleteVerdict: a season can go only when it is empty", () => {
  const empty = { matches: 0, rowsWithNumbers: 0, statRows: 12 };

  it("allows a season with no games and only zero stat rows", () => {
    expect(deleteVerdict(season("2027", 2027), empty)).toEqual({ deletable: true });
  });

  it("refuses the season the website shows", () => {
    const verdict = deleteVerdict(season("2026", 2026, 2026, true), empty);
    expect(verdict.deletable).toBe(false);
    expect(verdict).toMatchObject({ reason: "shown" });
  });

  it("refuses a season with games", () => {
    expect(deleteVerdict(season("2025", 2025), { ...empty, matches: 3 })).toMatchObject({ deletable: false, reason: "games" });
  });

  it("refuses a season with player numbers", () => {
    expect(deleteVerdict(season("2025", 2025), { ...empty, rowsWithNumbers: 1 })).toMatchObject({ deletable: false, reason: "numbers" });
  });
});

describe("statRowHasNumbers", () => {
  it("ignores the ids and counts any non-zero stat", () => {
    expect(statRowHasNumbers({ player_id: "a", season_id: "b", goals: 0, assists: 0 })).toBe(false);
    expect(statRowHasNumbers({ player_id: "a", season_id: "b", goals: 0, mins: 90 })).toBe(true);
    expect(statRowHasNumbers({ player_id: "a", season_id: "b", saves: null })).toBe(false);
  });
});

describe("leagueSummary", () => {
  const row = (is_club: boolean, points: number) => ({ is_club, points });

  it("gives our place and points", () => {
    expect(leagueSummary([row(false, 31), row(true, 27), row(false, 25)])).toEqual({ rank: 2, of: 3, points: 27 });
  });

  it("is none with no table, or when our team is not in it", () => {
    expect(leagueSummary([])).toBeNull();
    expect(leagueSummary([row(false, 3)])).toBeNull();
  });
});
