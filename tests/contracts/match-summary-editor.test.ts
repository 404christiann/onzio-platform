import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_MATCH_SUMMARY, matchSummaryColumns } from "@/lib/match-summary";

const editor = () => readFileSync(resolve(process.cwd(), "app/admin/(protected)/schedule/page.tsx"), "utf8");
// The Schedule form's fields live in ScheduleMatchForm.tsx.
const form = () => readFileSync(resolve(process.cwd(), "components/admin/schedule/ScheduleMatchForm.tsx"), "utf8");
const goal = (side: "club" | "opponent", player: string, minute: string) => ({ minute, side, kind: "goal" as const, player, detail: "" });

describe("Schedule editor Match Summary save", () => {
  it("saves an untouched summary as blank and leaves the scorers alone", () => {
    expect(matchSummaryColumns(EMPTY_MATCH_SUMMARY)).toEqual({ summary: null });
  });

  it("updates the Home strip's scorers from Rose City's goals in the timeline", () => {
    const columns = matchSummaryColumns({ ...EMPTY_MATCH_SUMMARY, events: [goal("club", "#8 J. Hernandez", "23′"), goal("opponent", "#9 D. Ortiz", "45′"), goal("club", "#10 G. Alfaro", "71′")] });
    expect(columns.scorers).toEqual(["J. Hernandez (23′)", "G. Alfaro (71′)"]);
    expect(columns.summary?.events).toHaveLength(3);
  });

  it("keeps the scorers when only lineups or statistics are entered", () => {
    const columns = matchSummaryColumns({ ...EMPTY_MATCH_SUMMARY, stats: [{ label: "Shots", club: 3, opponent: 1 }] });
    expect(columns.summary?.stats).toHaveLength(1);
    expect(columns).not.toHaveProperty("scorers");
  });

  it("loads and saves the summary and attendance only for cinematic@2 clubs", () => {
    const source = editor();
    expect(source).toMatch(/\.select\("[^"]*\bsummary\b[^"]*"\)/);
    expect(source).toMatch(/\.select\("[^"]*\battendance\b[^"]*"\)/);
    expect(source.match(/summaryColumnsFor\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('const isCinematic = club.presentationTemplateKey === "cinematic@2"');
    const fields = form();
    expect(fields).toContain('{club.presentationTemplateKey === "cinematic@2" && (');
    expect(fields).toContain('title="Match summary"');
    expect(fields).toContain('label="Stream or replay video (YouTube link)"');
    expect(fields).toContain('label="Attendance"');
  });
});
