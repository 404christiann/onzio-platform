import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { seasonDeleteState, sortSeasonList, type SeasonDeleteState, type SeasonListItem } from "@/lib/admin-seasons-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("@/components/admin/seasons/rose-city/seasons-ops", () => ({
  setActiveSeason: async () => ({ error: null }),
  createNextSeason: async () => ({ error: null }),
  deleteSeason: async () => ({ error: null }),
}));

import RoseCitySeasonsPage from "@/components/admin/seasons/rose-city/RoseCitySeasonsPage";

const root = resolve(__dirname, "../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const classic = source("components/admin/ClassicSeasonsPage.tsx");
const ops = source("components/admin/seasons/rose-city/seasons-ops.ts");
const roseCity = source("components/admin/seasons/rose-city/RoseCitySeasonsPage.tsx");
const page = source("app/admin/(protected)/seasons/page.tsx");

const season = (label: string, year: number, active = false): SeasonListItem => ({ id: `id-${label}`, label, start_year: year, end_year: year, active });
const deletable: SeasonDeleteState = { deletable: true, reason: "No matches or recorded stats. This season can be deleted.", matchCount: 0, statRowCount: 10 };
const locked: SeasonDeleteState = { deletable: false, reason: "This season has matches and cannot be deleted.", matchCount: 18, statRowCount: 33 };

function render(props: { seasons: SeasonListItem[]; deleteStates?: Record<string, SeasonDeleteState>; hasStandings?: boolean }) {
  return renderToStaticMarkup(createElement(RoseCitySeasonsPage, { deleteStates: {}, hasStandings: false, ...props }));
}

describe("RC-ADMIN-4b-seasons: where it runs", () => {
  it("is Rose City's Seasons page, picked by the club's slug on the server; every other classic club keeps the classic page", () => {
    expect(page).toContain('const ROSE_CITY_SLUG = "rose-city"');
    expect(page).toContain("if (club.slug !== ROSE_CITY_SLUG) return <ClassicSeasonsPage />");
    expect(page).toContain("loadSeasonsList(supabase, club.id)");
    expect(page).toContain('hasStandings={!isAdminRouteHiddenForClub(club.slug, "standings")}');
    // The reimagined hub branch is untouched.
    expect(page).toContain("<SeasonsHub");
    // No new template selector in a shared file.
    expect(page).not.toContain("presentationTemplateKey");
    expect(page).not.toContain("cinematic@2");
  });

  it("leaves ClassicSeasonsPage, which Diverse City renders, as it was (its own tests still pin its copy and button)", () => {
    expect(classic).toContain("Create Next Season");
    expect(classic).toContain("Standings is one league table that does not change with the season.");
    expect(classic).toContain("Confirm Delete");
  });
});

describe("RC-ADMIN-4b-seasons: the list", () => {
  const seasons = [season("2028", 2028), season("2027", 2027, true), season("2026", 2026)];
  const deleteStates = { "id-2028": deletable, "id-2027": deletable, "id-2026": locked };
  const html = render({ seasons, deleteStates });

  it("shows the numbers and the rows in the first paint, with no loading state to move later", () => {
    expect(html).toContain("Active season");
    expect(html).toContain(">2027<");
    expect(html).toContain("Season records");
    expect(html).toContain(">3<");
    expect(html).toContain("2028 season");
    expect(html).not.toMatch(/aria-busy|skeleton|shimmer/i);
    expect(roseCity).not.toContain("useEffect");
    expect(roseCity).not.toContain("Skeleton");
  });

  it("names the next season on the button, and puts Make active and Delete on each other season only", () => {
    expect(html).toContain("Create 2029 season");
    expect(html).not.toContain("Create Next Season");
    expect(html.match(/Make active/g)?.length).toBe(2);
    expect(html.match(/>Delete</g)?.length).toBe(2);
    expect(html).toContain("This season has matches and cannot be deleted.");
    expect(html).toContain("18 matches · 33 player stat rows");
  });

  it("disables Delete for a season the guard keeps, with the reason as its title", () => {
    const locked2026 = html.slice(html.indexOf('data-season-id="id-2026"'));
    expect(locked2026).toMatch(/data-danger=""[^>]*disabled=""[^>]*title="This season has matches and cannot be deleted\."/);
  });

  it("asks before it switches the active season, and names the pages that switch", () => {
    expect(roseCity).toContain("Make ${pending.season.label} the active season?");
    expect(roseCity).toContain("switch from {active ? active.label : \"no season\"} to {pending.season.label} on the admin and on your website");
    expect(roseCity).toContain("You can switch back any time.");
  });

  it("confirms a delete in a real dialog and not by a second click on the same button", () => {
    expect(roseCity).toContain("Delete the ${pending.season.label} season?");
    expect(roseCity).toContain("This can’t be undone.");
    expect(roseCity).toContain("destructive");
    expect(roseCity).not.toContain("Confirm Delete");
  });

  it("says a season exists already rather than posting a duplicate name", () => {
    const taken = render({ seasons: [season("2028", 2028), season("2027", 2027, true)] });
    expect(taken).toContain("Create 2029 season");
    // sorted newest first by the server: the newest is 2028, so the next is 2029 and free
    const clash = renderToStaticMarkup(createElement(RoseCitySeasonsPage, {
      seasons: [season("2027", 2027, true), season("2028", 2028)], deleteStates: {}, hasStandings: false,
    }));
    expect(clash).toContain("A 2028 season already exists.");
  });

  it("shows the empty state with no Create button", () => {
    const empty = render({ seasons: [] });
    expect(empty).toContain("No seasons have been set up yet. Contact Onzio to create your first season.");
    expect(empty).not.toMatch(/Create \S+ season/);
  });
});

describe("RC-ADMIN-4b-seasons: Standings is hidden for Rose City", () => {
  it("never links to Standings or the league table, and does not name them in Rose City's copy", () => {
    const html = render({ seasons: [season("2027", 2027, true)], hasStandings: false });
    expect(html).not.toMatch(/href="[^"]*(standings|league)/i);
    expect(html).not.toMatch(/standings|league table/i);
    expect(html).toContain("The active season is what Roster, Schedule and Stats show.");
  });

  it("says each season has its own league table, and not that it ignores the season, for a club that has Standings", () => {
    const html = render({ seasons: [season("2027", 2027, true)], hasStandings: true });
    expect(html).toContain("Roster, Schedule, Stats and Standings show.");
    expect(html).toContain("Each season has its own league table.");
    expect(html).not.toContain("does not change with the season");
    expect(roseCity).not.toContain("does not change with the season");
  });
});

describe("RC-ADMIN-4b-seasons: the writes are the classic page's, unchanged", () => {
  const same = [
    '.update({ active: false })',
    '.neq("id", "00000000-0000-0000-0000-000000000000")',
    '.update({ active: true })',
    '.insert([{ label: next.label, start_year: next.start_year, end_year: next.end_year, active: false }])',
    '.select("id, position")',
    '.eq("active", true)',
    'goals: 0, assists: 0, tackles: 0, starts: 0,',
    'yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0,',
    'goals_against: 0, saves: 0, clean_sheets: 0,',
    'supabase.from("player_season_stats").delete().eq("season_id", seasonId)',
    'supabase.from("goalkeeper_season_stats").delete().eq("season_id", seasonId)',
    'supabase.from("seasons").delete().eq("id", seasonId)',
    "Season created, but some player stats were not seeded:",
    "Season created, but players could not be loaded for stat seeding:",
  ];
  it.each(same)("keeps %s", (snippet) => {
    expect(classic).toContain(snippet);
    expect(ops).toContain(snippet);
  });

  it("deactivates before it activates, as the single-active index requires", () => {
    expect(ops.indexOf("update({ active: false })")).toBeLessThan(ops.indexOf("update({ active: true })"));
  });

  it("deletes the stat rows before the season, after re-checking the guard", () => {
    const body = ops.slice(ops.indexOf("export async function deleteSeason"));
    expect(body.indexOf("readDeleteState")).toBeLessThan(body.indexOf('from("player_season_stats").delete()'));
    expect(body.indexOf('from("player_season_stats").delete()')).toBeLessThan(body.indexOf('from("goalkeeper_season_stats").delete()'));
    expect(body.indexOf('from("goalkeeper_season_stats").delete()')).toBeLessThan(body.indexOf('from("seasons").delete()'));
  });
});

describe("RC-ADMIN-4b-seasons: the delete guard is the classic page's", () => {
  it("allows a delete only with no matches and no non-zero stats, with the classic sentences", () => {
    expect(seasonDeleteState(0, [{ player_id: "p", season_id: "s", goals: 0 }], [])).toMatchObject({ deletable: true, statRowCount: 1 });
    expect(seasonDeleteState(2, [], []).reason).toBe("This season has matches and cannot be deleted.");
    expect(seasonDeleteState(0, [{ goals: 1 }], []).reason).toBe("This season has field player stats and cannot be deleted.");
    expect(seasonDeleteState(0, [], [{ saves: 3 }]).reason).toBe("This season has goalkeeper stats and cannot be deleted.");
    for (const sentence of [
      "This season has matches and cannot be deleted.",
      "This season has field player stats and cannot be deleted.",
      "This season has goalkeeper stats and cannot be deleted.",
      "No matches or recorded stats. This season can be deleted.",
    ]) expect(classic).toContain(sentence);
  });

  it("orders newest first, Fall ahead of Spring of the same year", () => {
    const rows = [
      { ...season("Spring 2027", 2027), created_at: "2026-01-01" },
      { ...season("Fall 2027", 2027), created_at: "2026-02-01" },
      { ...season("2026", 2026), created_at: "2025-01-01" },
    ];
    expect(sortSeasonList(rows).map((row) => row.label)).toEqual(["Fall 2027", "Spring 2027", "2026"]);
  });
});

describe("RC-ADMIN-4b-seasons: verify-rc-admin still drives the page", () => {
  it("finds the Create button under both names and confirms in the dialog", () => {
    const spec = source(".claude/skills/verify-rc-admin/rc-admin-verify.spec.ts");
    expect(spec).toContain("/^Create (Next Season|.+ season)$/");
    expect("Create Next Season").toMatch(/^Create (Next Season|.+ season)$/);
    expect("Create 2028 season").toMatch(/^Create (Next Season|.+ season)$/);
  });
});
