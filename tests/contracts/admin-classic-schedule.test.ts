import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyForm, hasResult, matchTooLong, normalizeScore, monthGroupKey, formatRowDate, MAX_MATCH_SCORE } from "@/components/admin/schedule/schedule-model";

const page = readFileSync("app/admin/(protected)/schedule/page.tsx", "utf8");
const legacy = readFileSync("components/admin/schedule/LegacySchedulePage.tsx", "utf8");

describe("classic Schedule regression boundaries", () => {
  it("enters the classic guard only inside the classic component", () => {
    expect(page).toContain('return portal.portal === "reimagined" ? <LegacySchedulePage /> : <ClassicSchedulePage />');
    expect(page.indexOf("useUnsavedGuard({")).toBeGreaterThan(page.indexOf("function ClassicSchedulePage()"));
    expect(legacy).not.toContain("useUnsavedGuard");
    expect(legacy).toContain("<AdminSidePanel");
  });
  it("retains nullable scores and season defaults without client tenant fields", () => {
    expect(emptyForm("season")).toEqual({
      date: "", time: "", opponent: "", opponent_short_name: null, opponent_logo_url: null, competition: "",
      sponsor_name: null, sponsor_logo_url: null, sponsor_link: null, home: true, venue: "", address: "", city: "", state: "",
      rose_city_score: null, opponent_score: null, season_id: "season",
    });
    expect(hasResult({ rose_city_score: 0, opponent_score: 0 })).toBe(true);
    expect(hasResult({ rose_city_score: 0, opponent_score: null })).toBe(false);
    expect(normalizeScore(Number.NaN)).toBeNull();
    expect(normalizeScore(0)).toBe(0);
    expect(MAX_MATCH_SCORE).toBe(99);
  });
  it("retains length errors and plain-date labels", () => {
    expect(matchTooLong({ ...emptyForm(), opponent: "x".repeat(81) })).toBe("Opponent name can be at most 80 characters.");
    expect(matchTooLong({ ...emptyForm(), opponent: "x".repeat(80) })).toBeNull();
    expect(monthGroupKey("2026-03-14")).toBe("March 2026");
    expect(formatRowDate("2026-03-14")).toBe("Sat 14");
  });
});
