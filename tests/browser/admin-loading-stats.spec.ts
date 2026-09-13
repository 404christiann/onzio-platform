import { expect, test, type Page } from "@playwright/test";

// Read-only browser response fixtures isolate completion ordering without
// changing tenant records. Authentication and the protected shell remain real.
const SEASON_A = "10000000-0000-4000-8000-000000000001";
const SEASON_B = "10000000-0000-4000-8000-000000000002";
const MATCH_A = "20000000-0000-4000-8000-000000000001";
const MATCH_B = "20000000-0000-4000-8000-000000000002";
const MATCH_C = "20000000-0000-4000-8000-000000000003";
const PLAYER = "30000000-0000-4000-8000-000000000001";
const seasons = [
  { id: SEASON_A, label: "2026–27", start_year: 2026, end_year: 2027, active: true },
  { id: SEASON_B, label: "2025–26", start_year: 2025, end_year: 2026, active: false },
];
const fieldStats = (goals: number) => ({
  player_id: PLAYER, starts: 1, mins: 90, goals, assists: 0, tackles: 0,
  offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0,
});

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

type ReadRequest = { table: string; operation: string; columns: string; filters: { column: string; value: string }[] };
type ReadOverride = (request: ReadRequest) => Promise<unknown[] | "abort" | undefined>;

async function fixtureReads(page: Page, override: ReadOverride = async () => undefined) {
  const hostname = new URL(test.info().project.use.baseURL as string).hostname;
  expect(hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost")).toBe(true);
  await page.route("**/rest/v1/seasons?**", (route) => route.fulfill({ json: seasons }));
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON() as ReadRequest;
    if (body.operation !== "select") {
      // These tests must never send mutations, including on a failed load.
      await route.abort();
      throw new Error(`Unexpected mutation: ${body.operation} ${body.table}`);
    }
    const replacement = await override(body);
    if (replacement === "abort") return route.abort();
    let data: unknown[] | undefined = replacement;
    if (!data && body.table === "matches") {
      data = [
        { id: MATCH_A, date: "2026-09-01", time: "19:00", opponent: "First Opponent", home: true, season_id: SEASON_A },
        { id: MATCH_B, date: "2026-09-08", time: "19:00", opponent: "Second Opponent", home: true, season_id: SEASON_A },
        { id: MATCH_C, date: "2025-09-01", time: "19:00", opponent: "Historical Opponent", home: true, season_id: SEASON_B },
      ];
    }
    if (!data && body.table === "players") data = [{ id: PLAYER, name: "Loading Fixture Player", number: 9, position: "Forward", active: true }];
    if (!data && body.table === "player_season_stats") data = [fieldStats(0)];
    if (!data && ["goalkeeper_season_stats", "player_match_stats", "goalkeeper_match_stats"].includes(body.table)) data = [];
    if (!data) return route.continue();
    return route.fulfill({ json: { data, error: null, count: null } });
  });
}

const byFilter = (request: ReadRequest, column: string) => request.filters.find((filter) => filter.column === column)?.value;

test("Match Stats keeps its selector skeleton until matches arrive and ignores a superseded stats response", async ({ page }) => {
  const matches = gate();
  const firstStats = gate();
  const firstRequested = gate();
  await fixtureReads(page, async (request) => {
    if (request.table === "matches") await matches.wait;
    if (request.table === "player_match_stats") {
      if (byFilter(request, "match_id") === MATCH_A) {
        firstRequested.release();
        await firstStats.wait;
        return [fieldStats(13)];
      }
      return [fieldStats(8)];
    }
    return undefined;
  });
  await page.goto("/admin/stats");
  await expect(page.getByRole("heading", { name: "Match Stats", exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading matches", exact: true })).toBeVisible();
  await expect(page.getByText("No matches are assigned to this season.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save All Stats" })).toBeDisabled();
  matches.release();
  const matchSelect = page.getByRole("combobox", { name: "Match", exact: true });
  await expect(matchSelect).toBeEnabled();
  await matchSelect.selectOption(MATCH_A);
  await firstRequested.wait;
  await expect(page.getByRole("status", { name: "Loading match stats", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="stat-input"]')).toHaveCount(0);
  await matchSelect.selectOption(MATCH_B);
  await expect(page.locator('[data-slot="stat-input"]').nth(1)).toHaveValue("8");
  const lateResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/admin/data")) return false;
    const request = response.request().postDataJSON() as ReadRequest;
    return request.table === "player_match_stats" && byFilter(request, "match_id") === MATCH_A;
  });
  firstStats.release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("status", { name: "Loading match stats", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="stat-input"]').nth(1)).toHaveValue("8");
  await expect(page.getByRole("button", { name: "Save All Stats" })).toBeDisabled();
});

test("Season Stats keeps old totals hidden while a new season loads and ignores its late response", async ({ page }) => {
  const firstSeason = gate();
  const firstRequested = gate();
  await fixtureReads(page, async (request) => {
    if (request.table === "player_season_stats") {
      if (byFilter(request, "season_id") === SEASON_A) {
        firstRequested.release();
        await firstSeason.wait;
        return [fieldStats(13)];
      }
      return [fieldStats(8)];
    }
    return undefined;
  });
  await page.goto("/admin/season-stats");
  await firstRequested.wait;
  await expect(page.getByRole("status", { name: "Loading season stats", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(SEASON_B);
  await expect(page.locator('[data-slot="stat-input"]').first()).toHaveValue("8");
  const lateResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/admin/data")) return false;
    const request = response.request().postDataJSON() as ReadRequest;
    return request.table === "player_season_stats" && byFilter(request, "season_id") === SEASON_A;
  });
  firstSeason.release();
  await (await lateResponse).finished();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole("status", { name: "Loading season stats", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="stat-input"]').first()).toHaveValue("8");
  await expect(page.getByRole("button", { name: "Save All", exact: true })).toBeDisabled();
});

test("a failed Match Stats request ends the skeleton without exposing default editable totals", async ({ page }) => {
  await fixtureReads(page, async (request) => {
    if (request.table === "player_match_stats") return "abort";
    if (request.table === "player_season_stats" && byFilter(request, "season_id") === SEASON_B) return [];
    return undefined;
  });
  await page.goto("/admin/stats");
  const matchSelect = page.getByRole("combobox", { name: "Match", exact: true });
  await expect(matchSelect).toBeEnabled();
  await matchSelect.selectOption(MATCH_A);
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading match stats", exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="stat-input"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save All Stats" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(SEASON_B);
  await expect(matchSelect).toBeEnabled();
  await matchSelect.selectOption(MATCH_C);
  await expect(page.getByText("No players are assigned to this season.", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading match stats", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Error:" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save All Stats" })).toBeDisabled();
});

test("failed schedule reads end loading and keep Add Match unavailable", async ({ page }) => {
  await fixtureReads(page, async (request) => request.table === "matches" ? "abort" : undefined);
  await page.goto("/admin/schedule");
  await expect(page.getByText("Error:", { exact: false })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading schedule", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Match", exact: false })).toBeDisabled();
  await expect(page.getByText("No matches yet", { exact: true })).toHaveCount(0);
});
