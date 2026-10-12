import { expect, test, type Page } from "@playwright/test";

const seasonId = "33333333-3333-4333-8333-333333333331";
const matchId = "33333333-3333-4333-8333-333333333332";
const playerId = "33333333-3333-4333-8333-333333333333";
const name = "Discard regression player";
const fields = { starts: 1, mins: 75, goals: 3, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0 };

async function unloadWarns(page: Page) {
  return page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

for (const width of [390, 1440]) for (const initialView of ["match", "season"] as const) {
  test(`${width}px ${initialView}: discard clears the draft before stalled tab navigation`, async ({ page }) => {
    const base = new URL(test.info().project.use.baseURL!);
    if (base.hostname !== "alpha.localhost") throw new Error("Discard regression requires the isolated Alpha tenant.");
    await page.setViewportSize({ width, height: 844 });
    const mutations: string[] = [];
    const reads: Record<string, unknown[]> = {
      matches: [{ id: matchId, season_id: seasonId, opponent: "Discard regression match", date: "2026-06-10", time: "18:00", home: true }],
      players: [{ id: playerId, name, number: 9, position: "Forward", active: true }],
      player_season_stats: [{ ...fields, goals: 17, player_id: playerId, season_id: seasonId }],
      goalkeeper_season_stats: [],
      player_match_stats: [{ ...fields, starts: true, player_id: playerId, match_id: matchId }],
      goalkeeper_match_stats: [],
    };
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!["alpha.localhost", "127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
      if (url.pathname === "/rest/v1/seasons") return route.fulfill({ json: [{ id: seasonId, label: "Discard regression season", start_year: 2026, end_year: 2027, active: true }] });
      if (url.pathname === "/api/admin/data") {
        const input = request.postDataJSON();
        if (input.operation !== "select") { mutations.push(input.operation); return route.abort(); }
        if (!(input.table in reads)) throw new Error(`Unexpected Stats read: ${input.table}`);
        return route.fulfill({ json: { data: reads[input.table], error: null, count: null } });
      }
      if (url.pathname.startsWith("/api/stripe/")) return route.abort();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !(url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token")) {
        mutations.push(`${request.method()} ${url.pathname}`); return route.abort();
      }
      return route.continue();
    });
    const nextView = initialView === "match" ? "season" : "match";
    let release = () => {};
    const navigation = new Promise<void>(resolve => { release = resolve; });
    let held = false;
    try {
      await page.goto(`/admin/stats?view=${initialView}`);
      if (initialView === "match") {
        const matches = page.getByRole("combobox", { name: "Match", exact: true });
        await expect(matches).toBeEnabled(); await matches.selectOption(matchId);
      }
      await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
      const goals = page.getByRole("spinbutton", { name: `${name}: goals`, exact: true });
      const baseline = initialView === "match" ? "3" : "17";
      await expect(goals).toHaveValue(baseline);
      await goals.fill("8");
      await expect(page.getByText("1 player with unsaved changes", { exact: true })).toBeVisible();
      await expect.poll(() => unloadWarns(page)).toBe(true);
      await page.route(url => url.pathname === "/admin/stats" && url.searchParams.get("view") === nextView && url.searchParams.has("_rsc"), async route => {
        held = true; await navigation; await route.continue();
      });
      await page.getByRole("tab", { name: nextView === "season" ? "Season stats" : "Match stats", exact: true }).click();
      await page.getByRole("button", { name: "Discard changes", exact: true }).click();
      await expect.poll(() => held).toBe(true);
      await expect(goals).toHaveValue(baseline);
      await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
      await expect.poll(() => unloadWarns(page)).toBe(false);
      await expect(page.getByRole("tab", { name: initialView === "match" ? "Match stats" : "Season stats", exact: true })).toHaveAttribute("aria-selected", "true");
      release();
      await expect(page.getByRole("tab", { name: nextView === "season" ? "Season stats" : "Match stats", exact: true })).toHaveAttribute("aria-selected", "true");
      expect(mutations).toEqual([]);
    } finally { release(); }
  });
}
