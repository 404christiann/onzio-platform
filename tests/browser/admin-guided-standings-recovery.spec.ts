import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) for (const failedTable of ["league_standings", "league_standings_settings"]) {
  test(`${width}px Standings: recover ${failedTable} refresh without duplicating a saved team`, async ({ page }) => {
    const base = new URL(test.info().project.use.baseURL!);
    if (base.hostname !== "alpha.localhost") throw new Error("Standings recovery requires the isolated Alpha tenant.");
    await page.setViewportSize({ width, height: 844 });
    let records: Record<string, unknown>[] = [], settings: Record<string, unknown>[] = [];
    let failedRefresh = false, inserts = 0;
    const mutations: string[] = [];
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (!["alpha.localhost", "127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
      const table = url.pathname === "/rest/v1/league_standings_settings" ? "league_standings_settings" : url.pathname === "/rest/v1/league_standings" ? "league_standings" : null;
      if (table) {
        if (failedRefresh && table === failedTable) return route.fulfill({ status: 503, json: { code: "QA_READ_UNAVAILABLE", message: "Standings refresh unavailable" } });
        return route.fulfill({ json: table === "league_standings" ? records : settings });
      }
      if (url.pathname === "/api/admin/data") {
        const input = request.postDataJSON();
        mutations.push(`${input.table}:${input.operation}`);
        let data: Record<string, unknown>[];
        if (input.table === "league_standings_settings" && input.operation === "upsert") {
          settings = input.payload; data = settings;
        } else if (input.table === "league_standings" && input.operation === "insert") {
          inserts++;
          data = input.payload.map((row: Record<string, unknown>, index: number) => ({ ...row, id: `44444444-4444-4444-8444-${String(inserts * 10 + index).padStart(12, "0")}`, created_at: "2026-10-12T00:00:00Z" }));
          records.push(...data); failedRefresh = true;
        } else if (input.table === "league_standings" && input.operation === "upsert") {
          data = input.payload;
          for (const row of data) {
            const index = records.findIndex(record => record.id === row.id);
            if (index < 0) throw new Error("Recovered save lost the inserted team ID");
            records[index] = { ...records[index], ...row };
          }
        } else throw new Error(`Unexpected Standings operation ${input.table}:${input.operation}`);
        return route.fulfill({ json: { data, error: null, count: null } });
      }
      if (url.pathname.startsWith("/api/stripe/")) return route.abort();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && !(url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token")) throw new Error(`Unexpected real mutation ${request.method()} ${url.pathname}`);
      return route.continue();
    });
    await page.goto("/admin/standings");
    await page.getByRole("button", { name: "Add Team", exact: true }).click();
    await page.getByRole("textbox", { name: "Team name", exact: true }).fill("Recovery team");
    const save = page.getByRole("button", { name: "Save Standings", exact: true });
    await save.click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(save).toHaveText("Save Standings");
    expect(records).toHaveLength(1);
    const persistedId = records[0].id;
    await expect(save).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add Team", exact: true })).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toContainText("were saved");
    const retry = page.getByRole("button", { name: "Retry loading", exact: true });
    await retry.click();
    await expect(retry).toBeEnabled({ timeout: 20_000 });
    await expect(save).toBeDisabled();
    expect(inserts).toBe(1);
    expect(mutations).toHaveLength(2);
    failedRefresh = false;
    await retry.click();
    const name = page.getByRole("textbox", { name: "Team name", exact: true });
    await expect(name).toHaveValue("Recovery team");
    await expect(retry).toHaveCount(0);
    await name.fill("Recovered team");
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Saved successfully" })).toBeVisible();
    await expect(save).toBeDisabled();
    expect(inserts).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: persistedId, team_name: "Recovered team" });
    expect(mutations).toEqual(["league_standings_settings:upsert", "league_standings:insert", "league_standings_settings:upsert", "league_standings:upsert"]);
  });
}
