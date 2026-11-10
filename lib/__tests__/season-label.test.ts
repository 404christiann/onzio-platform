import { describe, expect, it } from "vitest";
import {
  firstSeasonAfterNothing,
  yearsForSeasonName,
  newestSeasonFirst,
  nextSeasonAfter,
  SEASON_NAME_MAX,
  seasonNameProblem,
  seasonNameProblemText,
} from "@/lib/season-label";

// ADMIN-RE-11a: the name "Start next season" suggests, and the checks on a name
// typed over it. seasons.label is free text, 1 to 40 characters, unique per club.

describe("nextSeasonAfter keeps its year labels", () => {
  it("moves a one-year season to the next year", () => {
    expect(nextSeasonAfter({ start_year: 2026, end_year: 2026 })).toEqual({ label: "2027", start_year: 2027, end_year: 2027 });
    expect(nextSeasonAfter({ label: "2026", start_year: 2026, end_year: 2026 }).label).toBe("2027");
  });

  it("moves a split season to the next pair of years", () => {
    expect(nextSeasonAfter({ label: "2025–26", start_year: 2025, end_year: 2026 })).toEqual({
      label: "2026–27",
      start_year: 2026,
      end_year: 2027,
    });
    expect(nextSeasonAfter({ start_year: 2099, end_year: 2100 }).label).toBe("2100–01");
  });
});

describe("nextSeasonAfter alternates Spring and Fall", () => {
  it("follows Spring with Fall of the same year", () => {
    expect(nextSeasonAfter({ label: "Spring 2026", start_year: 2026, end_year: 2026 })).toEqual({
      label: "Fall 2026",
      start_year: 2026,
      end_year: 2026,
    });
  });

  it("follows Fall with Spring of the next year", () => {
    expect(nextSeasonAfter({ label: "Fall 2026", start_year: 2026, end_year: 2026 })).toEqual({
      label: "Spring 2027",
      start_year: 2027,
      end_year: 2027,
    });
  });

  it("reads the name whatever its capitals and spacing", () => {
    expect(nextSeasonAfter({ label: "  spring   2026 ", start_year: 2026, end_year: 2026 }).label).toBe("Fall 2026");
    expect(nextSeasonAfter({ label: "FALL 2030", start_year: 2030, end_year: 2030 }).label).toBe("Spring 2031");
  });

  it("falls back to the years when the name is not Spring or Fall plus a year", () => {
    expect(nextSeasonAfter({ label: "Fall Showcase 2026", start_year: 2026, end_year: 2026 }).label).toBe("2027");
    expect(nextSeasonAfter({ label: "Winter 2026", start_year: 2026, end_year: 2026 }).label).toBe("2027");
    expect(nextSeasonAfter({ label: "Spring 2026–27", start_year: 2026, end_year: 2027 }).label).toBe("2027–28");
  });

  it("never suggests a name longer than the limit", () => {
    expect(nextSeasonAfter({ label: "Spring 2026", start_year: 2026, end_year: 2026 }).label.length).toBeLessThanOrEqual(SEASON_NAME_MAX);
  });
});

describe("firstSeasonAfterNothing", () => {
  it("suggests the club's current year", () => {
    expect(firstSeasonAfterNothing("2026-11-09")).toEqual({ label: "2026", start_year: 2026, end_year: 2026 });
    expect(firstSeasonAfterNothing("2027-01-01").label).toBe("2027");
  });

  it("keeps the year inside what the database accepts", () => {
    expect(firstSeasonAfterNothing("1850-01-01").start_year).toBe(2000);
    expect(firstSeasonAfterNothing("2999-01-01").start_year).toBe(2200);
    expect(firstSeasonAfterNothing("garbage").start_year).toBeGreaterThanOrEqual(2000);
  });
});

describe("newestSeasonFirst", () => {
  const row = (label: string, start_year: number, end_year: number, created_at: string) => ({ label, start_year, end_year, created_at });

  it("puts the latest years first", () => {
    const sorted = [row("2025", 2025, 2025, "2025-01-01"), row("2026–27", 2026, 2027, "2026-01-01"), row("2026", 2026, 2026, "2026-02-01")].sort(newestSeasonFirst);
    expect(sorted.map((s) => s.label)).toEqual(["2026–27", "2026", "2025"]);
  });

  it("puts Fall before Spring of the same year, whatever order they were made in", () => {
    const sorted = [row("Fall 2026", 2026, 2026, "2026-01-01"), row("Spring 2026", 2026, 2026, "2026-06-01")].sort(newestSeasonFirst);
    expect(sorted.map((s) => s.label)).toEqual(["Fall 2026", "Spring 2026"]);
  });

  it("breaks any other tie by the day the season was made", () => {
    const sorted = [row("Alpha", 2026, 2026, "2026-01-01"), row("Beta", 2026, 2026, "2026-03-01")].sort(newestSeasonFirst);
    expect(sorted.map((s) => s.label)).toEqual(["Beta", "Alpha"]);
  });
});

describe("seasonNameProblem", () => {
  const taken = ["Spring 2026", "2025–26"];

  it("accepts a fresh name", () => {
    expect(seasonNameProblem("Fall 2026", taken)).toBeNull();
    expect(seasonNameProblem("x".repeat(SEASON_NAME_MAX), taken)).toBeNull();
  });

  it("refuses an empty name or one that is only spaces", () => {
    expect(seasonNameProblem("", taken)).toBe("empty");
    expect(seasonNameProblem("   ", taken)).toBe("empty");
  });

  it("refuses a name over 40 characters, counting what will be saved", () => {
    expect(seasonNameProblem("x".repeat(SEASON_NAME_MAX + 1), taken)).toBe("too-long");
    expect(seasonNameProblem(` ${"x".repeat(SEASON_NAME_MAX)} `, taken)).toBeNull();
  });

  it("refuses a name another season has, whatever the capitals or spaces", () => {
    expect(seasonNameProblem("Spring 2026", taken)).toBe("taken");
    expect(seasonNameProblem("  spring 2026 ", taken)).toBe("taken");
    expect(seasonNameProblem("2025–26", taken)).toBe("taken");
  });

  it("counts emoji and other non-Latin text as the database does, in characters", () => {
    expect(seasonNameProblem("春季赛 2026", taken)).toBeNull();
    expect(seasonNameProblem("🏆".repeat(SEASON_NAME_MAX), taken)).toBeNull();
    expect(seasonNameProblem("🏆".repeat(SEASON_NAME_MAX + 1), taken)).toBe("too-long");
  });
});

describe("seasonNameProblemText", () => {
  it("says the duplicate in plain words with the name that clashes", () => {
    expect(seasonNameProblemText("taken", "  Spring 2026 ")).toBe("A season called “Spring 2026” already exists. Pick another name.");
  });

  it("keeps a very long clashing name short", () => {
    const text = seasonNameProblemText("taken", "x".repeat(200));
    expect(text.length).toBeLessThan(120);
  });

  it("explains an empty name and a long one", () => {
    expect(seasonNameProblemText("empty", "")).toBe("Give the season a name.");
    expect(seasonNameProblemText("too-long", "x".repeat(41))).toBe("Use 40 characters or fewer.");
  });
});

describe("yearsForSeasonName: the years saved with a name typed over the suggestion", () => {
  const suggested = { startYear: 2026, endYear: 2026 };

  it("keeps the suggestion's years when the name says nothing about years", () => {
    expect(yearsForSeasonName("Fall Showcase", suggested)).toEqual(suggested);
    expect(yearsForSeasonName("Winter league", suggested)).toEqual(suggested);
    expect(yearsForSeasonName("", suggested)).toEqual(suggested);
  });

  it("follows a Spring or Fall name's year", () => {
    expect(yearsForSeasonName("Fall 2025", suggested)).toEqual({ startYear: 2025, endYear: 2025 });
    expect(yearsForSeasonName("  spring 2030 ", suggested)).toEqual({ startYear: 2030, endYear: 2030 });
  });

  it("follows a plain year and a split season", () => {
    expect(yearsForSeasonName("2028", suggested)).toEqual({ startYear: 2028, endYear: 2028 });
    expect(yearsForSeasonName("2025–26", suggested)).toEqual({ startYear: 2025, endYear: 2026 });
    expect(yearsForSeasonName("2025-26", suggested)).toEqual({ startYear: 2025, endYear: 2026 });
    expect(yearsForSeasonName("2099–2100", suggested)).toEqual({ startYear: 2099, endYear: 2100 });
  });

  it("falls back when the years would not be accepted by the database", () => {
    // 2000 to 2200, and the end year at most two after the start (20260726000200_phase2_content.sql)
    expect(yearsForSeasonName("Fall 1999", suggested)).toEqual(suggested);
    expect(yearsForSeasonName("Fall 2201", suggested)).toEqual(suggested);
    expect(yearsForSeasonName("2025–31", suggested)).toEqual(suggested);
    expect(yearsForSeasonName("2026–25", suggested)).toEqual(suggested);
  });
});
