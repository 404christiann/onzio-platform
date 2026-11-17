import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema } from "@/lib/admin-data-contract";

// ADMIN-RE-06: Enter a score. The loader's behaviour is pinned in
// lib/__tests__/admin-score-data.test.ts and the route in
// tests/contracts/admin-route-manifest.test.ts; this file pins the matches
// write schema and where the page runs, what it reads and how it writes.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/score/page.tsx");
const entry = source("components/admin/reimagined/ScoreEntry.tsx");
const loader = source("lib/admin-score-data.ts");
const css = source("components/admin/reimagined/score.module.css");

const MATCH_ID = "0f060f06-0f06-4f06-8f06-0f060f060f06";
const SEASON_ID = "1f061f06-1f06-4f06-8f06-1f061f061f06";

function scoreUpdate(payload: unknown) {
  return adminDataRequestSchema.safeParse({
    table: "matches",
    operation: "update",
    columns: "id,rose_city_score,opponent_score",
    payload,
    filters: [{ kind: "eq", column: "id", value: MATCH_ID }],
  });
}

/** What the old /admin/schedule page sends through lib/admin-client.ts. */
const SCHEDULE_PAGE_ROW = {
  date: "2026-11-07",
  time: "10:00",
  opponent: "Westfield",
  opponent_short_name: null,
  opponent_logo_url: null,
  opponent_logo_asset_id: null,
  competition: null,
  sponsor_name: null,
  sponsor_logo_url: null,
  sponsor_logo_asset_id: null,
  sponsor_link: null,
  home: true,
  venue: "Delta Park",
  address: null,
  city: null,
  state: null,
  rose_city_score: 2,
  opponent_score: null,
  season_id: SEASON_ID,
};

describe("matches write schema (ADMIN-RE-06)", () => {
  it("accepts a score-only update, including 0–0 and clearing a score", () => {
    expect(scoreUpdate({ rose_city_score: 3, opponent_score: 1 }).success).toBe(true);
    expect(scoreUpdate({ rose_city_score: 0, opponent_score: 0 }).success).toBe(true);
    expect(scoreUpdate({ rose_city_score: 99, opponent_score: 99 }).success).toBe(true);
    expect(scoreUpdate({ rose_city_score: null, opponent_score: null }).success).toBe(true);
  });

  it("refuses scores that are not whole numbers from 0 to 99", () => {
    for (const bad of [-1, 100, 2.5, "3", true, Number.MAX_SAFE_INTEGER]) {
      expect(scoreUpdate({ rose_city_score: bad, opponent_score: 0 }).success).toBe(false);
      expect(scoreUpdate({ rose_city_score: 0, opponent_score: bad }).success).toBe(false);
    }
  });

  it("keeps the old schedule page's insert and update working", () => {
    for (const operation of ["insert", "update"] as const) {
      const parsed = adminDataRequestSchema.safeParse({
        table: "matches",
        operation,
        payload: operation === "insert" ? [SCHEDULE_PAGE_ROW] : SCHEDULE_PAGE_ROW,
        filters: operation === "update" ? [{ kind: "eq", column: "id", value: MATCH_ID }] : [],
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
    // Every other onzio.matches column is allowed, so later packages extend rather than replace.
    expect(
      scoreUpdate({
        id: MATCH_ID,
        attendance: 120,
        scorers: [{ name: "A. Player", minute: 12 }],
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("refuses unknown columns and any tenant identity in the payload", () => {
    expect(scoreUpdate({ rose_city_score: 1, opponent_score: 0, league_points: 3 }).success).toBe(false);
    expect(scoreUpdate({ rose_city_score: 1, opponent_score: 0, club_id: SEASON_ID }).success).toBe(false);
    expect(scoreUpdate({ rose_city_score: 1, opponent_score: 0, clubId: SEASON_ID }).success).toBe(false);
    expect(scoreUpdate({ date: "Nov 7" }).success).toBe(false);
    expect(scoreUpdate({ season_id: "not-a-uuid" }).success).toBe(false);
    expect(scoreUpdate({ attendance: -5 }).success).toBe(false);
  });

  it("still requires a payload for a matches write", () => {
    expect(
      adminDataRequestSchema.safeParse({ table: "matches", operation: "update", filters: [] }).success,
    ).toBe(false);
  });
});

describe("Enter a score page (ADMIN-RE-06)", () => {
  it("is a server page that resolves session, club and role itself", () => {
    expect(page).not.toContain('"use client"');
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain('hostname: requestHeaders.get("host") ?? ""');
    expect(page).toMatch(/club\.role !== "owner" && club\.role !== "admin"/);
    expect(page).not.toMatch(/service-role|SERVICE_ROLE|createServiceRoleClient/);
    expect(page).not.toMatch(/searchParams|clubId=|club_id/);
  });

  it("sends a classic club to the old schedule page", () => {
    expect(page).toContain("const portal = await readAdminPortal(supabase, club.id);");
    expect(page).toContain('if (portal.portal !== "reimagined") redirect("/admin/schedule");');
    // The redirect comes before any data is read.
    expect(page.indexOf('redirect("/admin/schedule")')).toBeLessThan(page.indexOf("loadScorePageData("));
  });

  it("reads through the signed-in person's client, scoped to the club, with no personal details", () => {
    expect(page).toContain("loadScorePageData(supabase, club.id, portal.timeZone)");
    expect(loader).not.toMatch(/service-role|SERVICE_ROLE|createServiceRoleClient/);
    expect(loader.match(/\.eq\("club_id", clubId\)/g)).toHaveLength(3);
    expect(loader).not.toMatch(/email|phone|guardian|answers|registrant/);
  });

  it("writes through POST /api/admin/data as a matches update filtered by id", () => {
    expect(entry).toContain('fetch("/api/admin/data", {');
    expect(entry).toContain('method: "POST"');
    expect(entry).toContain('table: "matches"');
    expect(entry).toContain('operation: "update"');
    expect(entry).toContain('filters: [{ kind: "eq", column: "id", value: game.id }]');
    expect(entry).toContain("payload: { rose_city_score: ours, opponent_score: theirs }");
    expect(entry).not.toMatch(/club_id|clubId/);
    // No browser-client writes: the route resolves the club and checks the session.
    expect(entry).not.toMatch(/supabase-browser|admin-client|createClient/);
    // Exactly one changed row counts as saved.
    expect(entry).toContain("body.data.length !== 1");
  });

  it("changes the match only: no league table write until ADMIN-RE-11b", () => {
    expect(entry).not.toMatch(/league_standings|standings/);
    expect(loader).not.toMatch(/league_standings/);
  });

  it("uses the design's words and the hold-aware saved label", () => {
    expect(page).toContain("savedText={savedLabel(websiteState(club))}");
    for (const words of [
      "Enter a score",
      "Save score",
      "Saving…",
      "Result missing",
      "Earlier results",
      "No earlier results yet",
      "All scores are in",
      "Add a game",
      "Who scored?",
      "Add goal scorers to Match stats",
    ]) {
      expect(entry).toContain(words);
    }
    expect(entry).not.toContain("Saved · on your website");
  });

  it("links Who scored? to Match stats, which has no match preselect to pass", () => {
    expect(entry).toContain('href="/admin/stats?view=match"');
    const stats = source("components/admin/stats/CombinedStatsPage.tsx");
    expect(stats).toContain('searchParams.get("view")');
    expect(stats).not.toMatch(/searchParams\.get\("match/);
  });

  it("takes Add a game from the manifest, so it follows that job when its page ships", () => {
    expect(page).toContain('const addGameHref = canSave ? getAdminHomeJobHref("add-game") : null;');
    expect(page).not.toContain("presentationTemplateKey");
  });

  it("uses the shared NumberStepper, 0 to 99, with the admin's own icons", () => {
    expect(entry).toContain('from "@/components/ui/number-stepper"');
    expect(entry).toContain("const MAX_SCORE = 99;");
    expect(entry).toMatch(/min=\{0\}\s+max=\{MAX_SCORE\}/);
    expect(entry).not.toContain("lucide-react");
  });

  it("wraps long names to two lines with the full name on hover", () => {
    expect(css).toMatch(/\.vs,\s*\.teamName,\s*\.resultTitle \{[^}]*-webkit-line-clamp: 2;/);
    expect(entry).toContain("title={name}");
    expect(entry).toContain("title={vsLine(game)}");
  });
});
