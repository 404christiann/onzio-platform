import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";
import { getAdminRouteHref } from "@/lib/admin-route-manifest";
import { SEASON_NAME_MAX } from "@/lib/season-label";

// ADMIN-RE-11a: This season hub and season names. The name and hub rules are
// pinned in lib/__tests__/season-label.test.ts and admin-seasons-data.test.ts;
// this file pins where the page runs, what it reads and how it writes, that
// no schema or tenant-resolution change came with it, and that the classic page
// is still there for clubs on the old admin.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/seasons/page.tsx");
const hub = source("components/admin/reimagined/SeasonsHub.tsx");
const loader = source("lib/admin-seasons-data.ts");
const css = source("components/admin/reimagined/seasons.module.css");
const classic = source("components/admin/ClassicSeasonsPage.tsx");

const SEASON_ID = "1f061f06-1f06-4f06-8f06-1f061f061f06";
const PLAYER_ID = "2f062f06-2f06-4f06-8f06-2f062f062f06";

const seasonInsert = (payload: Record<string, unknown>) =>
  adminDataRequestSchema.safeParse({ table: "seasons", operation: "insert", columns: "id,label", payload, single: "single" });

describe("where the hub runs", () => {
  it("is the Seasons page for a reimagined club, and the old page, unchanged, for a classic one", () => {
    expect(page).toContain('portal.portal !== "reimagined") return <ClassicSeasonsPage />');
    expect(classic).toContain("Create Next Season");
    expect(classic).toContain("does not change with the season");
    expect(page).not.toContain('redirect("/admin/schedule")');
  });

  it("resolves the club from the host and the signed-in person on the server, never from the browser", () => {
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("getClubContext({ hostname: requestHeaders.get(\"host\")");
    expect(page).toContain("readAdminPortal(supabase, club.id)");
    expect(page).not.toMatch(/searchParams[^;]*club_?id/i);
  });

  it("offers changes only while the club may change its website, as the home does", () => {
    expect(page).toContain("canMutateContent");
    expect(page).toContain('club.lifecycle === "onboarding"');
    expect(page).toContain("canChange={canMutateContent}");
  });

  it("links the cards to the manifest's paths, for pages every owner and administrator has", () => {
    expect(page).toContain('getAdminRouteHref("standings")');
    expect(page).toContain('${getAdminRouteHref("match-stats")}?view=season');
    expect(page).toContain('getAdminRouteHref("schedule")');
    // None of those depends on the club's template (lib/admin-route-manifest.ts).
    expect(getAdminRouteHref("standings")).toBe("/admin/standings");
    expect(getAdminRouteHref("match-stats")).toBe("/admin/stats");
    expect(source("app/admin/(protected)/season-stats/page.tsx")).toContain('redirect("/admin/stats?view=season")');
    expect(getAdminRouteHref("schedule")).toBe("/admin/schedule");
    expect(page).not.toContain("presentationTemplateKey");
  });

  it("is for owners and administrators only", () => {
    expect(page).toContain('club.role !== "owner" && club.role !== "admin"');
    expect(page).toContain("/admin/login?error=not_authorized");
  });

  it("words the saved state by whether the website is live or paused (decision 2)", () => {
    expect(page).toContain("savedLabel(websiteState(club))");
  });
});

describe("what the hub reads", () => {
  it("reads through the signed-in person's client, scoped to the club", () => {
    expect(loader).toContain('supabase.schema("onzio")');
    for (const table of ["seasons", "league_standings", "matches", "player_season_stats", "goalkeeper_season_stats"]) {
      expect(loader).toContain(`.from("${table}")`);
    }
    expect(loader.match(/\.eq\("club_id", clubId\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(loader).not.toMatch(/service[-_ ]?role/i);
  });

  it("selects no personal detail and no media", () => {
    expect(loader).not.toMatch(/email|phone|guardian|answers|status_token/i);
    expect(loader).toContain('.select("is_club,points,sort_order")');
  });

  it("never adds columns to tenant resolution", () => {
    const tenant = source("lib/club-context.ts");
    expect(tenant).not.toMatch(/admin_portal|admin_flags|time_zone/);
    expect(page + loader + hub).not.toContain("club-context.ts");
  });
});

describe("how the hub writes", () => {
  it("writes only through POST /api/admin/data and never sends a club id", () => {
    expect(hub).toContain('fetch("/api/admin/data"');
    expect(hub).not.toMatch(/createClient|supabase-browser|admin-client/);
    expect(hub).not.toMatch(/club_?id/i);
  });

  it("starts a season with the shape the data route accepts", () => {
    expect(seasonInsert({ label: "Fall 2026", start_year: 2026, end_year: 2026, active: false }).success).toBe(true);
    expect(hub).toContain('table: "seasons"');
    expect(hub).toContain("active: false");
  });

  it("starts a season inactive; showing it is its own, separate step", () => {
    const start = hub.slice(hub.indexOf("async function startSeason"), hub.indexOf("async function switchTo"));
    expect(start).toContain("active: false");
    expect(start).not.toContain("active: true");
    expect(start).toContain('setStep("ask")');
  });

  it("switches the old season off before the new one on, and puts the old one back when that fails", () => {
    const body = hub.slice(hub.indexOf("async function switchTo"), hub.indexOf("function failedSwitch"));
    expect(body.indexOf("payload: { active: false }")).toBeGreaterThan(-1);
    expect(body.indexOf("payload: { active: false }")).toBeLessThan(body.indexOf("payload: { active: true }"));
    expect(body.match(/payload: \{ active: true \}/g)?.length).toBe(2);
  });

  it("checks the name before it is sent and again from what the database answers", () => {
    expect(hub).toContain("seasonNameProblem(name, takenNames)");
    expect(hub).toContain("isDuplicate(season.message)");
    expect(hub).toContain("disabled={busy !== null || nameProblem !== null}");
    expect(SEASON_NAME_MAX).toBe(40);
  });

  it("seeds a zero totals row per active player, field players and goalkeepers apart", () => {
    expect(hub).toContain('table: "player_season_stats"');
    expect(hub).toContain('table: "goalkeeper_season_stats"');
    expect(hub).toContain('position !== "Goalkeeper"');
    const rows = adminDataRequestSchema.safeParse({
      table: "player_season_stats",
      operation: "insert",
      columns: "player_id",
      payload: [{ player_id: PLAYER_ID, season_id: SEASON_ID, goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0 }],
    });
    expect(rows.success).toBe(true);
  });

  it("deletes only after looking again, and only an empty season that is not shown", () => {
    const body = hub.slice(hub.indexOf("async function deleteViewed"), hub.indexOf("const viewingPast"));
    expect(body).toContain("deleteVerdict(season");
    expect(body.indexOf("deleteVerdict(season")).toBeLessThan(body.indexOf('operation: "delete"'));
    for (const request of ["player_season_stats", "goalkeeper_season_stats", "seasons"]) {
      expect(body).toMatch(new RegExp(`table: "${request}", operation: "delete"[^}]*filters: \\[\\{ kind: "eq"`));
    }
  });

  it("never deletes without a filter, which would clear the whole club's table", () => {
    const deletes = hub.match(/operation: "delete"[^}]*\}/g) ?? [];
    expect(deletes.length).toBe(3);
    for (const request of deletes) expect(request).toContain("filters:");
  });
});

describe("the page's words", () => {
  it("uses the glossary's words and the design's questions", () => {
    for (const text of [
      "This season",
      "The season your website shows.",
      "Start next season",
      "Start your first season",
      "Season name",
      "Start season",
      "on your website now?",
      "Not yet",
      "Yes, switch",
      "is ready",
      "Show it",
      "No seasons yet",
    ]) {
      expect(hub).toContain(text);
    }
  });

  it("does not promise a league table copy the platform does not make yet (RE-11b)", () => {
    expect(hub).not.toMatch(/fresh league table/i);
    expect(hub).toContain("One table for every season");
  });

  it("shows a name counter that goes red past the limit instead of silently cutting the name", () => {
    expect(hub).toContain("{count} / {SEASON_NAME_MAX}");
    expect(hub).not.toContain("maxLength");
    expect(css).toContain(".counter[data-over]");
  });

  it("keeps long names to a line with the full name on hover", () => {
    expect(hub).toContain("title={ready.label}");
    expect(css).toMatch(/\.footTitle[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.switchText[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.bannerName[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.cardMain[^}]*overflow-wrap: anywhere/);
  });

  it("uses plural rules and thousands separators for counts", () => {
    expect(hub).toContain('new Intl.PluralRules("en-US")');
    expect(hub).toContain('new Intl.NumberFormat("en-US")');
  });
});

describe("no schema change", () => {
  it("adds no migration and no generated type", () => {
    let changed: string[] = [];
    try {
      changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { cwd: process.cwd(), encoding: "utf8" })
        .split("\n")
        .filter(Boolean);
    } catch {
      return; // no origin/main to compare with here
    }
    expect(changed.filter((file) => file.startsWith("supabase/migrations/"))).toEqual([]);
    expect(changed).not.toContain("lib/database.generated.ts");
    expect(changed).not.toContain("lib/club-context.ts");
  });
});

describe("follow-up to the review of #116", () => {
  it("saves the years the typed name says, not always the suggestion's", () => {
    const start = hub.slice(hub.indexOf("async function startSeason"), hub.indexOf("async function switchTo"));
    expect(start).toContain("yearsForSeasonName(label, suggestion)");
    expect(start).toContain("start_year: years.startYear");
    expect(start).toContain("end_year: years.endYear");
    expect(start).not.toContain("start_year: suggestion.startYear");
  });

  it("orders the classic page's seasons newest first, with Fall ahead of Spring of one year", () => {
    expect(classic).toContain("newestSeasonFirst");
    expect(classic).toMatch(/rows\.sort\(|\.sort\(newestSeasonFirst/);
  });

  it("refuses to delete when a stat read hit its row cap, since it cannot tell the rest are empty", () => {
    const body = hub.slice(hub.indexOf("async function deleteViewed"), hub.indexOf("const viewingPast"));
    expect(body).toContain("STAT_READ_LIMIT");
    expect(body).toMatch(/length >= STAT_READ_LIMIT/);
  });
});
