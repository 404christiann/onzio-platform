import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import {
  competitionPayload,
  distinctCompetitions,
  MATCH_COLUMNS,
  RECENT_COMPETITION_LIMIT,
} from "@/lib/admin-add-game-data";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";

// Add a game's optional "Which competition?" (follow-up to ADMIN-RE-22). Pins
// where it is asked, what is saved (blank is null), the "Last used" chips, and
// that no schema or tenant-select change was needed.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = source("app/admin/(protected)/add-game/page.tsx");
const form = source("components/admin/reimagined/AddGame.tsx");
const loader = source("lib/admin-add-game-data.ts");
const clubContext = source("lib/club-context.ts");

const GAME = {
  season_id: "11111111-1111-4111-8111-111111111111",
  date: "2026-11-14",
  time: "10:00",
  opponent: "Northgate",
  home: true,
  venue: "Lincoln Park",
};

describe("Which competition? (what is saved)", () => {
  it("saves a blank answer, or only spaces, as null and trims the rest", () => {
    expect(competitionPayload("")).toEqual({ competition: null });
    expect(competitionPayload("   ")).toEqual({ competition: null });
    expect(competitionPayload("  Spring League ")).toEqual({ competition: "Spring League" });
  });

  it("is an insert /api/admin/data accepts, up to the 80-character limit and no further", () => {
    const insert = (competition: string | null) =>
      adminDataRequestSchema.safeParse({
        table: "matches",
        operation: "insert",
        columns: MATCH_COLUMNS,
        payload: { ...GAME, ...competitionPayload(competition ?? "") },
      }).success;
    expect(MATCH_TEXT_LIMITS.competition).toBe(80);
    expect(insert(null)).toBe(true);
    expect(insert("x".repeat(80))).toBe(true);
    expect(
      adminDataRequestSchema.safeParse({
        table: "matches",
        operation: "insert",
        payload: { ...GAME, competition: "x".repeat(81) },
      }).success,
    ).toBe(false);
    expect(MATCH_COLUMNS.split(",")).toContain("competition");
  });
});

describe("Last used competitions", () => {
  it("keeps the newest three distinct competitions, ignoring blanks, case and outer spaces", () => {
    expect(RECENT_COMPETITION_LIMIT).toBe(3);
    expect(distinctCompetitions(["Spring League", " spring league ", "", null, "Cup", "Friendly", "Showcase"])).toEqual([
      "Spring League",
      "Cup",
      "Friendly",
    ]);
    expect(distinctCompetitions([])).toEqual([]);
    expect(distinctCompetitions(["  ", null])).toEqual([]);
  });

  it("reads them with the signed-in person's client, scoped to the club, only where the question shows", () => {
    expect(loader).toContain('.select("competition")');
    expect(loader).toContain('.neq("competition", "")');
    expect(loader).toContain("showCompetition ? readRecentCompetitions(supabase, clubId).catch(() => []) : Promise.resolve([])");
    expect(loader).not.toMatch(/service-role|SERVICE_ROLE/);
  });
});

describe("Which competition? (where it is asked)", () => {
  it("shows only where the club's site definition says the competition shows, never by template key", () => {
    expect(diverseCitySite.admin.schedule.competitionShowsOnNextMatch).toBe(true);
    expect(page).toContain("const showCompetition = codeSiteAdminFor(club)?.schedule.competitionShowsOnNextMatch === true;");
    expect(page).toContain("showCompetition={showCompetition}");
    expect(page).not.toContain("presentationTemplateKey");
    expect(form).toContain("{showCompetition ? (");
    expect(form).toContain("...(showCompetition ? competitionPayload(competition) : {}),");
  });

  it("is an optional text box capped at the contract's limit, with Last used chips", () => {
    expect(form).toContain("Which competition?");
    expect(form).toContain("maxLength={MATCH_TEXT_LIMITS.competition}");
    expect(form).toContain('groupLabel="Last used competitions"');
    // Not required, and no error for leaving it blank.
    expect(form).not.toMatch(/errors\.competition|add-game-competition-error/);
  });

  it("is cleared after Added and the chips stay fresh", () => {
    expect(form).toContain("setCompetitions((current) => distinctCompetitions([saved, ...current]));");
    expect(form).toContain('setCompetition("");');
  });

  it("needed no schema change and nothing new in the tenant select", () => {
    expect(clubContext).not.toContain("competition");
    expect(clubContext).not.toContain("show_competition");
  });
});
