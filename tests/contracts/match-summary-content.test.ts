import { describe, expect, it } from "vitest";
import {
  EMPTY_MATCH_SUMMARY, STANDARD_MATCH_STAT_LABELS, formatPeopleLines, formatStaffLines, matchSummarySchema,
  normalizeMatchSummary, parsePeopleLines, parseStaffLines, readMatchSummary, scorersFromEvents, type MatchSummary,
} from "@/lib/match-summary";

const summary: MatchSummary = {
  events: [
    { minute: "23′", side: "club", kind: "goal", player: "#8 J. Hernandez", detail: "Assist: #10 G. Alfaro" },
    { minute: "41′", side: "opponent", kind: "yellow", player: "#5 B. Williams", detail: "" },
    { minute: "45′+2′", side: "opponent", kind: "goal", player: "#9 D. Ortiz", detail: "" },
    { minute: "58′", side: "club", kind: "sub", player: "#14 L. Castillo", detail: "#11 R. Vega" },
    { minute: "71′", side: "club", kind: "goal", player: "G. Alfaro", detail: "" },
  ],
  stats: [{ label: "Possession %", club: 54.5, opponent: 45.5 }, { label: "Shots", club: 14, opponent: 9 }],
  officials: [{ role: "Referee", name: "Dennis Maybourn" }],
  kit: [{ item: "Jersey", color: "Red" }],
  lineups: {
    club: { starting: [{ number: "8", name: "J. Hernandez" }], bench: [], staff: [{ name: "G. Morales", role: "Head Coach" }] },
    opponent: { starting: [], bench: [{ number: "18", name: "T. Wright" }], staff: [] },
  },
};

describe("Match Summary content rules", () => {
  it("accepts a full summary and Sam's sixteen standard statistics", () => {
    expect(matchSummarySchema.parse(summary)).toEqual(summary);
    expect(STANDARD_MATCH_STAT_LABELS).toHaveLength(16);
    expect(STANDARD_MATCH_STAT_LABELS).toContain("Expected goals");
  });

  it("rejects values the page cannot show safely", () => {
    const event = summary.events[0], person = { number: "8", name: "J. Hernandez" };
    for (const change of [
      { events: [{ ...event, kind: "penalty" }] },
      { events: [{ ...event, side: "home" }] },
      { events: [{ ...event, player: "x".repeat(81) }] },
      { events: Array.from({ length: 61 }, () => event) },
      { stats: [{ label: "Shots", club: -1, opponent: 2 }] },
      { stats: Array.from({ length: 25 }, () => ({ label: "Shots", club: 1, opponent: 1 })) },
      { officials: [{ role: "Referee", name: "x".repeat(61) }] },
      { lineups: { ...summary.lineups, club: { ...summary.lineups.club, starting: Array.from({ length: 16 }, () => person) } } },
      { lineups: { ...summary.lineups, club: { ...summary.lineups.club, starting: [{ number: "#8x9", name: "J." }] } } },
      { extra: true },
    ]) expect(matchSummarySchema.safeParse({ ...summary, ...change }).success, JSON.stringify(change).slice(0, 70)).toBe(false);
  });

  it("reads lineups and staff typed one per line, and writes them back the same way", () => {
    expect(parsePeopleLines("#8 J. Hernandez\n10  G. Alfaro\n\n  #1 M. Soto  \nNo number")).toEqual([
      { number: "8", name: "J. Hernandez" }, { number: "10", name: "G. Alfaro" }, { number: "1", name: "M. Soto" }, { number: "", name: "No number" },
    ]);
    expect(formatPeopleLines([{ number: "8", name: "J. Hernandez" }, { number: "", name: "No number" }])).toBe("#8 J. Hernandez\nNo number");
    expect(parseStaffLines("G. Morales - Head Coach\nJ. Alewine — Assistant Coach\nU. Jenkins")).toEqual([
      { name: "G. Morales", role: "Head Coach" }, { name: "J. Alewine", role: "Assistant Coach" }, { name: "U. Jenkins", role: "" },
    ]);
    expect(formatStaffLines([{ name: "G. Morales", role: "Head Coach" }, { name: "U. Jenkins", role: "" }])).toBe("G. Morales - Head Coach\nU. Jenkins");
  });

  it("builds Rose City's scorers from its goals, for the Home strip and the summary header", () => {
    expect(scorersFromEvents(summary.events)).toEqual(["J. Hernandez (23′)", "G. Alfaro (71′)"]);
    expect(scorersFromEvents([])).toEqual([]);
  });

  it("saves an empty summary as blank and drops empty rows", () => {
    expect(normalizeMatchSummary(EMPTY_MATCH_SUMMARY)).toBeNull();
    const draft = { ...EMPTY_MATCH_SUMMARY, events: [{ minute: " 12′ ", side: "club" as const, kind: "goal" as const, player: " #7 R. Diaz ", detail: "" }, { minute: "", side: "club" as const, kind: "goal" as const, player: "", detail: "" }], stats: [{ label: "", club: 0, opponent: 0 }] };
    expect(normalizeMatchSummary(draft)).toEqual({ ...EMPTY_MATCH_SUMMARY, events: [{ minute: "12′", side: "club", kind: "goal", player: "#7 R. Diaz", detail: "" }] });
  });

  it("treats a missing or damaged stored summary as no summary", () => {
    expect(readMatchSummary(null)).toBeNull();
    expect(readMatchSummary(undefined)).toBeNull();
    expect(readMatchSummary({ events: "bad" })).toBeNull();
    expect(readMatchSummary(summary)).toEqual(summary);
  });
});
