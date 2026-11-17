import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAdminRouteHref,
  getReimaginedPageTitle,
  getVisibleAdminMoreRows,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

// ADMIN-RE-19: "How the team is doing" (design: cd-analytics-a, cd-analytics-b).
// The page keeps its route. Under a reimagined club it shows the season game by
// game and one player at a time; a club still on the classic admin gets the
// page it has today. This file pins where the two part, that the page only
// reads (no write, no schema, no service role), that the charts are plain SVG
// and CSS that never tell anything by color alone, and the break-ui limits.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/analytics/page.tsx");
const data = source("lib/admin-analytics-data.ts");
const view = source("lib/admin-analytics-view.ts");
const component = source("components/admin/reimagined/TeamAnalytics.tsx");
const chart = source("components/admin/analytics/PlayerChart.tsx");
const css = source("components/admin/reimagined/analytics.module.css");
const chartCss = source("components/admin/analytics/player-chart.module.css");
const classic = source("components/admin/ClassicAnalyticsPage.tsx");
const queries = source("lib/queries.ts");

describe("the Analytics page keeps both admins working (ADMIN-RE-19)", () => {
  it("is a server page that resolves session, tenant and role itself", () => {
    expect(page).not.toMatch(/^"use client"/m);
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("getClubContext({ hostname:");
    expect(page).toContain('club.role !== "owner" && club.role !== "admin"');
    expect(page).toContain('redirect("/admin/login?error=not_authorized")');
  });

  it("hands a club still on the classic admin the page it has today", () => {
    expect(page).toContain("readAdminPortal(supabase, club.id)");
    expect(page).toContain('portal.portal !== "reimagined") return <ClassicAnalyticsPage />');
    // The classic page moved whole: Chart.js, the radar and the roster read are still there
    expect(classic).toContain('"use client"');
    expect(classic).toContain("export default function ClassicAnalyticsPage()");
    expect(classic).toContain("Chart.register(...registerables)");
    expect(classic).toContain("fetchRoster(undefined, clubId)");
    expect(classic).toContain("fetchPlayerMatchTrend");
  });

  it("says plainly when nothing could be read, and when no season is shown yet", () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('data.status === "no-season"');
    expect(page).toContain('getAdminRouteHref("seasons")');
  });

  it("links by manifest path", () => {
    expect(page).toContain('getAdminRouteHref("score")');
    expect(page).toContain('getAdminRouteHref("match-stats")');
    expect(page).toContain('getAdminRouteHref("roster")');
    expect(getAdminRouteHref("score")).toBe("/admin/score");
    expect(getAdminRouteHref("match-stats")).toBe("/admin/stats");
    expect(getAdminRouteHref("roster")).toBe("/admin/roster");
  });
});

describe("the page only reads, and only this club's rows (ADMIN-RE-19)", () => {
  it("uses the signed-in person's own client, never the service role", () => {
    expect(data).toContain('supabase.schema("onzio")');
    expect(data).not.toMatch(/service-role|SERVICE_ROLE|supabase-admin|createServiceClient/);
    expect(page).not.toMatch(/service-role|SERVICE_ROLE/);
  });

  it("writes nothing", () => {
    for (const file of [data, view, component, page]) {
      expect(file).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(file).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    }
  });

  it("scopes every read to the club", () => {
    const reads = data.match(/\.from\("[a-z_]+"\)/g) ?? [];
    expect(reads.sort()).toEqual(
      [
        '.from("goalkeeper_season_totals")',
        '.from("matches")',
        '.from("player_match_stats")',
        '.from("player_season_totals")',
        '.from("players")',
        '.from("seasons")',
      ].sort(),
    );
    expect(data.match(/\.eq\("club_id", clubId\)/g)).toHaveLength(reads.length);
  });

  it("reads the season the website shows, not a season it was asked for", () => {
    expect(data).toContain('.eq("active", true)');
    expect(data).not.toContain("searchParams");
    expect(data).toContain('{ status: "no-season" }');
  });

  it("selects no personal detail: games, scores, names, numbers and goals only", () => {
    expect(data).toContain('.select("id,date,opponent,rose_city_score,opponent_score")');
    expect(data).toContain('.select("id,name,position,number,active")');
    expect(data).toContain('.select("match_id,player_id,goals,assists")');
    expect(data).not.toMatch(/select\("\*"\)|select\(`\*`\)/);
    // Every column list, including the two kept in constants
    const columns = [
      ...(data.match(/\.select\("([^"]+)"\)/g) ?? []),
      ...(data.match(/_COLUMNS = "([^"]+)"/g) ?? []),
    ].join(" ");
    expect(columns).not.toMatch(/email|phone|guardian|hometown|school|photo|bio|height|weight|age|status_token/i);
    expect(columns).toContain("fouls_suffered");
  });

  it("pages every read, since the API returns at most a thousand rows", () => {
    expect(data).toContain("const PAGE = 1000");
    expect(data).toContain(".range(from, to)");
  });

  it("changes no schema and does not widen the tenant lookup", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/admin_portal|admin_flags|time_zone/);
    // Optional fields only: the classic page's reads of the match log are unchanged
    expect(queries).toContain("saves?:        number;");
    expect(queries).toContain("goalsAgainst?: number;");
  });

  it("reads one player's games with the existing log query, on demand", () => {
    expect(component).toContain('import { fetchPlayerMatchLog, type MatchLogRow } from "@/lib/queries"');
    expect(component).toContain("fetchPlayerMatchLog(playerId, keeper, seasonId, clubId)");
    expect(component).not.toMatch(/from\("|supabase-server|createClient/);
  });
});

describe("the charts (ADMIN-RE-19)", () => {
  it("are plain SVG and CSS: no chart library", () => {
    for (const file of [component, chart, view, data]) {
      expect(file).not.toMatch(/from ["'](?:chart\.js|recharts|d3|@nivo|echarts|plotly|react-chartjs-2)/);
    }
  });

  it("tell every result by its score and a letter, not by color alone", () => {
    expect(component).toContain('const RESULT_LETTER = { won: "W", drew: "D", lost: "L" }');
    expect(component).toContain("aria-label={`${resultWord(result)} ${scoreLine(game)} against ${game.opponent}");
    expect(component).toContain('<span className={styles.letter}');
    // The scored and let-in bars are named beside the chart, with a swatch, in text-token ink
    expect(component).toContain("Scored");
    expect(component).toContain("Let in");
    expect(css).toMatch(/\.axisName\s*\{[^}]*color: hsl\(var\(--foreground\)\)/);
  });

  it("offer the whole season as a plain table", () => {
    expect(component).toContain("<table className={styles.table}");
    expect(component).toContain('<caption className="sr-only">Every game this season, newest first</caption>');
    expect(component).toContain('<th scope="col">Result</th>');
    expect(component).toContain("aria-expanded={listOpen}");
  });

  it("make every game a real button with a name, and the card closable by key and by button", () => {
    expect(component).toContain('<button\n                key={game.id}\n                type="button"');
    expect(component).toContain('event.key === "Escape"');
    expect(component).toContain('aria-label="Close game details"');
    expect(component).toContain("returnTo.current?.focus()");
    expect(component).toContain('role="dialog"');
  });

  it("write the player's corners as real text with their numbers", () => {
    expect(chart).toContain("aria-label={`${name}: ${radarSummary(axes)}`}");
    expect(chart).toContain("{axis.label}");
    expect(chart).toContain("{axis.text}");
    expect(chart).toContain('aria-hidden="true" focusable="false"');
  });

  it("keep the SVG out of the icon-only folder, since the shape is a chart and not an icon", () => {
    expect(chart).toContain("<svg");
    expect(component).not.toMatch(/<svg[\s>]/);
    expect(component).toContain('import { PlayerChart } from "@/components/admin/analytics/PlayerChart"');
  });

  it("the shape moves only for people who have not asked for less motion", () => {
    const motion = [css, chartCss].flatMap((file) => file.match(/@media \(prefers-reduced-motion: no-preference\)/g) ?? []);
    expect(motion.length).toBeGreaterThanOrEqual(3);
    // Nothing that moves the chart is declared before the first reduced-motion block
    const beforeMotion = css.split("@media (prefers-reduced-motion: no-preference)")[0];
    expect(beforeMotion).not.toMatch(/animation:/);
    expect(chartCss.split("@media (prefers-reduced-motion: no-preference)")[0]).not.toMatch(/transition: d /);
  });

  it("have a dark pair for the chart colors", () => {
    expect(css).toContain(':global([data-admin-theme="dark"]) .page');
    expect(css).toContain("--ana-pop: #d6247a");
    expect(chartCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("break-ui limits (ADMIN-RE-19)", () => {
  it("shows the last twelve games, six on a phone, and the rest in the list", () => {
    expect(component).toContain("const WIDE_GAMES = 12");
    expect(component).toContain("const NARROW_GAMES = 6");
    expect(component).toContain("Last {WIDE_GAMES} games");
    expect(component).toContain("Last {NARROW_GAMES} games");
  });

  it("lets long and non-Latin names wrap or end in an ellipsis instead of widening the page", () => {
    expect(css).toMatch(/\.chipName\s*\{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.scorerName\s*\{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.whoName\s*\{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.gameOpp\s*\{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.listName\s*\{[^}]*-webkit-line-clamp: 2/);
    expect(css).toMatch(/\.gameVs\s*\{[^}]*overflow-wrap: anywhere/);
    expect(component).toContain("title={player.name}");
    expect(css).not.toMatch(/overflow-x:\s*scroll/);
  });

  it("keeps controls at least 44px, and a bar always visible however many goals", () => {
    expect(css).toMatch(/\.chip\s*\{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.closeButton\s*\{[^}]*width: 44px;[^}]*height: 44px/);
    expect(css).toContain("height: max(3px, calc(var(--g) * var(--unit) - 2px))");
  });

  it("has a screen for no results, no players and a player with no games", () => {
    expect(component).toContain("No results yet");
    expect(component).toContain("No players yet");
    expect(component).toContain("No games yet");
    expect(component).toContain("could not be loaded");
  });

  it("splits the phone from the laptop at 640px", () => {
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).not.toMatch(/@media \(min-width: 640px\)/);
  });
});

describe("the menu entry (ADMIN-RE-19)", () => {
  const context = (over: Partial<AdminRouteAccessContext> = {}): AdminRouteAccessContext =>
    ({ role: "owner", adminPortal: "reimagined", ...over }) as AdminRouteAccessContext;

  it("is already in More as 'How the team is doing', opening /admin/analytics", () => {
    const rows = getVisibleAdminMoreRows(context());
    const row = rows.find((candidate) => candidate.label === "How the team is doing");
    expect(row).toBeDefined();
    expect(row?.href).toBe("/admin/analytics");
  });

  it("names the page in the top bar", () => {
    expect(getReimaginedPageTitle("/admin/analytics")).toBe("How the team is doing");
  });
});
