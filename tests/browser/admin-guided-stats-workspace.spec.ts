import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { expect, test, type Page } from "@playwright/test";

const clubId = "11111111-1111-4111-8111-111111111111";
const url = process.env.SUPABASE_TEST_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(process.env.ADMIN_GUIDED_BASE_URL ?? "http://alpha.localhost:3110").hostname !== "alpha.localhost") {
  throw new Error("Stats workspace fixtures require the isolated loopback Alpha tenant.");
}
const client = createClient(url, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
}).schema("onzio");
const tables = ["seasons", "players", "matches", "player_season_stats", "goalkeeper_season_stats", "player_match_stats", "goalkeeper_match_stats"];
const artifacts = "/private/tmp/onzio-stats-workspace";
async function checked(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const response = await client.from(table).select("*").eq("club_id", clubId);
    await checked(response);
    result[table] = (response.data ?? []).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
}
async function fixtures() {
  const suffix = randomUUID().slice(0, 8);
  const seasonIds = [randomUUID(), randomUUID()];
  const playerIds = [randomUUID(), randomUUID()];
  const matchIds = [randomUUID(), randomUUID(), randomUUID()];
  const names = [`Workspace Forward ${suffix}`, `Workspace Keeper ${suffix}`];
  const original = await snapshot();
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  await writeFile(`${artifacts}/original-${suffix}.json`, JSON.stringify(original), { mode: 0o600 });
  async function restore() {
    for (const [table, column, ids] of [
      ["player_match_stats", "player_id", playerIds], ["goalkeeper_match_stats", "player_id", playerIds],
      ["player_season_stats", "player_id", playerIds], ["goalkeeper_season_stats", "player_id", playerIds],
      ["matches", "id", matchIds], ["players", "id", playerIds], ["seasons", "id", seasonIds],
    ] as const) await checked(await client.from(table).delete().eq("club_id", clubId).in(column, ids));
    expect(await snapshot()).toEqual(original);
  }
  try {
    await checked(await client.from("seasons").insert(seasonIds.map((id, index) => ({ id, club_id: clubId, label: `Workspace ${2024 + index} ${suffix}`, start_year: 2024 + index, end_year: 2025 + index, active: false }))));
    await checked(await client.from("players").insert(playerIds.map((id, index) => ({ id, club_id: clubId, name: names[index], number: index ? 91 : 90, age: 22, position: index ? "Goalkeeper" : "Forward", active: false }))));
    for (const [index, seasonId] of seasonIds.entries()) {
      await checked(await client.from("player_season_stats").insert({ club_id: clubId, player_id: playerIds[0], season_id: seasonId, goals: index + 1, starts: 2, mins: 180 }));
      await checked(await client.from("goalkeeper_season_stats").insert({ club_id: clubId, player_id: playerIds[1], season_id: seasonId, saves: index + 4, starts: 2, mins: 180 }));
    }
    await checked(await client.from("matches").insert(matchIds.map((id, index) => ({ id, club_id: clubId, season_id: seasonIds[index === 2 ? 1 : 0], date: `2026-06-${10 + index}`, time: "18:00", opponent: `Workspace Opponent ${index}`, home: true }))));
    await checked(await client.from("player_match_stats").insert(matchIds.map((id, index) => ({ club_id: clubId, player_id: playerIds[0], match_id: id, starts: true, mins: 75, goals: index + 3 }))));
    await checked(await client.from("goalkeeper_match_stats").insert(matchIds.map((id, index) => ({ club_id: clubId, player_id: playerIds[1], match_id: id, starts: false, mins: 0, saves: index + 5 }))));
  } catch (error) { await restore(); throw error; }
  return { seasonIds, playerIds, matchIds, names, suffix, restore };
}

async function selectPlayer(page: Page, name: string) {
  const back = page.getByRole("button", { name: "All players", exact: true });
  if (await back.isVisible()) await back.click();
  const search = page.getByRole("searchbox", { name: "Search players", exact: true });
  await expect(search).toBeVisible();
  await search.fill("");
  await page.getByRole("button", { name: `Select ${name}`, exact: true }).click();
}
async function setTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true });
  if (await button.count()) await button.click();
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
}
async function saved(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved successfully" })).toBeVisible();
  await expect(page.getByRole("button", { name: label, exact: true })).toBeDisabled();
}
const fieldLabels = ["goals", "assists", "tackles", "offsides", "fouls", "fouls suffered", "yellow cards", "red cards", "minutes"];
const keeperLabels = ["goals against", "saves", "clean sheets", "yellow cards", "red cards", "minutes"];
const databaseKeys: Record<string, string> = { "fouls suffered": "fouls_suffered", "yellow cards": "yellow", "red cards": "red", "minutes": "mins", "goals against": "goals_against", "clean sheets": "clean_sheets" };
async function editNumbers(page: Page, name: string, labels: string[], offset: number, largeMinutes = true) {
  const values: Record<string, number> = {};
  for (const [index, label] of labels.entries()) {
    const input = page.getByRole("spinbutton", { name: `${name}: ${label}`, exact: true });
    await expect(input).toBeVisible();
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    const value = label === "minutes" ? (largeMinutes ? 16020 : 120) + offset : index + offset;
    await input.fill(String(value));
    values[databaseKeys[label] ?? label] = value;
  }
  return values;
}
async function checkRow(table: string, playerId: string, contextKey: string, contextId: string, values: Record<string, number | boolean>) {
  const response = await client.from(table).select("*").eq("club_id", clubId).eq("player_id", playerId).eq(contextKey, contextId).single();
  await checked(response);
  expect(response.data).toMatchObject(values);
}
async function verifyViewport(page: Page, saveLabel: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const save = page.getByRole("button", { name: saveLabel, exact: true });
  await expect(save).toBeVisible();
  const box = (await save.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test.describe.configure({ mode: "serial" });
for (const width of [320, 390, 1440]) {
  test(`${width}px player workspace: all fields, historical cohort, draft navigation, real whole-scope persistence and both themes`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 844 });
    const fixture = await fixtures();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      for (const route of ["season-stats", "stats"]) {
        const match = route === "stats";
        const saveLabel = match ? "Save All Stats" : "Save All";
        await page.goto(`/admin/${route}`);
        await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonIds[0]);
        if (match) {
          const matches = page.getByRole("combobox", { name: "Match", exact: true });
          await expect(matches).toBeEnabled();
          await matches.selectOption(fixture.matchIds[0]);
        }
        await selectPlayer(page, fixture.names[0]);
        const labels = match ? fieldLabels : [...fieldLabels, "starts"];
        const fieldValues: Record<string, number | boolean> = await editNumbers(page, fixture.names[0], labels, match ? 30 : 20, !match);
        if (match) {
          const minutes = page.getByRole("spinbutton", { name: `${fixture.names[0]}: minutes`, exact: true });
          await expect(minutes).toHaveAttribute("max", "300");
          await minutes.fill("301");
          await expect(minutes).toHaveValue("300");
          await expect(page.getByRole("button", { name: `Increase ${fixture.names[0]}: minutes`, exact: true })).toBeDisabled();
          await minutes.fill(String(fieldValues.mins));
          const starter = page.getByRole("checkbox", { name: `${fixture.names[0]}: started the match`, exact: true });
          await starter.uncheck(); fieldValues.starts = false;
        }
        await selectPlayer(page, fixture.names[1]);
        const keeperValues: Record<string, number | boolean> = await editNumbers(page, fixture.names[1], match ? keeperLabels : [...keeperLabels, "starts"], match ? 50 : 40, !match);
        if (match) {
          const starter = page.getByRole("checkbox", { name: `${fixture.names[1]}: started the match`, exact: true });
          await starter.check(); keeperValues.starts = true;
        }
        await selectPlayer(page, fixture.names[0]);
        await expect(page.getByRole("spinbutton", { name: `${fixture.names[0]}: goals`, exact: true })).toHaveValue(String(fieldValues.goals));
        for (const theme of ["light", "dark"] as const) {
          await setTheme(page, theme);
          await verifyViewport(page, saveLabel);
          await page.screenshot({ path: `${artifacts}/${width}-${route}-${theme}.png`, fullPage: true });
        }
        const minutes = page.getByRole("spinbutton", { name: `${fixture.names[0]}: minutes`, exact: true });
        await minutes.focus();
        if (width < 768) {
          await page.setViewportSize({ width, height: 460 });
          await verifyViewport(page, saveLabel);
          await page.setViewportSize({ width, height: 844 });
        }
        await saved(page, saveLabel);
        const contextKey = match ? "match_id" : "season_id";
        const contextId = match ? fixture.matchIds[0] : fixture.seasonIds[0];
        await checkRow(match ? "player_match_stats" : "player_season_stats", fixture.playerIds[0], contextKey, contextId, fieldValues);
        await checkRow(match ? "goalkeeper_match_stats" : "goalkeeper_season_stats", fixture.playerIds[1], contextKey, contextId, keeperValues);
        await page.reload();
        await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonIds[0]);
        if (match) {
          const matches = page.getByRole("combobox", { name: "Match", exact: true });
          await expect(matches).toBeEnabled(); await matches.selectOption(fixture.matchIds[0]);
        }
        await selectPlayer(page, fixture.names[1]);
        await expect(page.getByRole("spinbutton", { name: `${fixture.names[1]}: saves`, exact: true })).toHaveValue(String(keeperValues.saves));
        await selectPlayer(page, fixture.names[0]);
        await expect(page.getByRole("spinbutton", { name: `${fixture.names[0]}: goals`, exact: true })).toHaveValue(String(fieldValues.goals));
        const back = page.getByRole("button", { name: "All players", exact: true });
        if (await back.isVisible()) await back.click();
        const search = page.getByRole("searchbox", { name: "Search players", exact: true });
        await search.fill("No matching player");
        await expect(page.getByRole("button", { name: `Select ${fixture.names[0]}`, exact: true })).toHaveCount(0);
        await search.fill(fixture.names[0]);
        await page.getByRole("button", { name: `Select ${fixture.names[0]}`, exact: true }).click();
        await expect(page.getByRole("spinbutton", { name: `${fixture.names[0]}: goals`, exact: true })).toHaveValue(String(fieldValues.goals));
      }
      expect(errors).toEqual([]);
    } finally { await fixture.restore(); }
  });
}

test("phone scope changes: cancel/discard/save, failed save retains context and drafts, match scope stays independent", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await fixtures();
  try {
    for (const route of ["season-stats", "stats"]) {
      const match = route === "stats";
      await page.goto(`/admin/${route}`);
      const seasons = page.getByRole("combobox", { name: "Season", exact: true });
      await seasons.selectOption(fixture.seasonIds[0]);
      const matches = page.getByRole("combobox", { name: "Match", exact: true });
      if (match) { await expect(matches).toBeEnabled(); await matches.selectOption(fixture.matchIds[0]); }
      await selectPlayer(page, fixture.names[0]);
      const goals = page.getByRole("spinbutton", { name: `${fixture.names[0]}: goals`, exact: true });
      await goals.fill("73");
      const scope = match ? matches : seasons;
      const target = match ? fixture.matchIds[1] : fixture.seasonIds[1];
      const original = match ? fixture.matchIds[0] : fixture.seasonIds[0];
      await scope.selectOption(target);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(scope).toHaveValue(original);
      await expect(goals).toHaveValue("73");
      await scope.selectOption(target);
      await page.getByRole("button", { name: "Discard changes", exact: true }).click();
      await expect(scope).toHaveValue(target);
      await selectPlayer(page, fixture.names[0]);
      await expect(goals).toHaveValue(match ? "4" : "2");
      await goals.fill("74");
      await page.route("**/api/admin/data", async route => {
        if (route.request().postDataJSON().operation === "upsert") return route.fulfill({ json: { data: null, error: { message: "Synthetic save failure" }, count: null } });
        return route.continue();
      });
      await scope.selectOption(original);
      await page.getByRole("button", { name: "Save & switch", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Synthetic save failure");
      await expect(scope).toHaveValue(target);
      await expect(goals).toHaveValue("74");
      await page.unroute("**/api/admin/data");
      // Whether the failed confirmation stays open or closes, its retry must
      // await a real saved result before changing context.
      if (!await page.getByRole("dialog").isVisible()) await scope.selectOption(original);
      await page.getByRole("button", { name: "Save & switch", exact: true }).click();
      await expect(scope).toHaveValue(original);
      await checkRow(match ? "player_match_stats" : "player_season_stats", fixture.playerIds[0], match ? "match_id" : "season_id", target, { goals: 74 });
      await selectPlayer(page, fixture.names[0]);
      await expect(goals).toHaveValue(match ? "3" : "1");
      if (match) {
        // A match write does not silently recompute manual Season totals.
        await checkRow("player_season_stats", fixture.playerIds[0], "season_id", fixture.seasonIds[1], { goals: 74 });
        await goals.fill("81");
        await seasons.selectOption(fixture.seasonIds[1]);
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(seasons).toHaveValue(fixture.seasonIds[0]);
        await expect(matches).toHaveValue(fixture.matchIds[0]);
        await expect(goals).toHaveValue("81");
      }
    }
  } finally { await fixture.restore(); }
});
