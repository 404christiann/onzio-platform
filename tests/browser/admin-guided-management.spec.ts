import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { expect, test, type Page } from "@playwright/test";

const clubId = "11111111-1111-4111-8111-111111111111";
const artifactDirectory = "/private/tmp/onzio-guided-management";
const browserBase = process.env.ADMIN_GUIDED_BASE_URL ?? "http://alpha.localhost:3110";
if (new URL(browserBase).hostname !== "alpha.localhost") {
  throw new Error("Management browser checks require the existing synthetic alpha.localhost tenant.");
}
const url = process.env.SUPABASE_TEST_URL;
if (!url || new URL(url).hostname !== "127.0.0.1") {
  throw new Error("Management browser fixtures require loopback-only Supabase.");
}
const client = createClient(url, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
}).schema("onzio");
const tables = ["seasons", "players", "matches", "player_match_stats", "goalkeeper_match_stats", "player_season_stats", "goalkeeper_season_stats", "league_standings", "registration_forms", "registration_form_fields", "registration_price_options", "registrations"];

async function checkResult(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    const response = await client.from(table).select("*").eq("club_id", clubId);
    await checkResult(response);
    result[table] = (response.data ?? []).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
}
async function fixtures() {
  const suffix = randomUUID().slice(0, 8);
  const seasonId = randomUUID(), playerId = randomUUID(), formId = randomUUID(), priceId = randomUUID(), standingId = randomUUID();
  const matchIds = [randomUUID(), randomUUID(), randomUUID()];
  const rowName = `Guided QA Forward ${suffix}`;
  const formTitle = `Guided QA form ${suffix}`;
  const seasonLabel = `Guided QA 2025 ${suffix}`;
  const original = await snapshot();
  await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });
  const originalPath = `${artifactDirectory}/original-${suffix}.json`;
  await writeFile(originalPath, JSON.stringify(original, null, 2));
  await chmod(originalPath, 0o600);
  async function restore() {
    for (const [table, column, values] of [
      ["registrations", "form_id", [formId]],
      ["registration_form_fields", "form_id", [formId]],
      ["registration_price_options", "form_id", [formId]],
      ["registration_forms", "id", [formId]],
      ["player_match_stats", "player_id", [playerId]],
      ["player_season_stats", "player_id", [playerId]],
      ["matches", "id", matchIds],
      ["players", "id", [playerId]],
      ["seasons", "id", [seasonId]],
      ["league_standings", "id", [standingId]],
    ] as const) await checkResult(await client.from(table).delete().eq("club_id", clubId).in(column, [...values]));
    expect(await snapshot()).toEqual(original);
  }
  try {
    const activeSeason = (original.seasons as { id: string; active: boolean }[]).find(season => season.active);
    if (!activeSeason) throw new Error("Synthetic Alpha must have an active season.");
    await checkResult(await client.from("seasons").insert({ id: seasonId, club_id: clubId, label: seasonLabel, start_year: 2025, end_year: 2026, active: false }));
    await checkResult(await client.from("players").insert({ id: playerId, club_id: clubId, name: rowName, number: 77, age: 22, position: "Forward", active: true }));
    await checkResult(await client.from("player_season_stats").insert([
      { club_id: clubId, player_id: playerId, season_id: activeSeason.id, goals: 3, assists: 2, starts: 2, mins: 150 },
      { club_id: clubId, player_id: playerId, season_id: seasonId, goals: 1, assists: 1, starts: 1, mins: 80 },
    ]));
    await checkResult(await client.from("matches").insert(matchIds.map((id, index) => ({ id, club_id: clubId, season_id: index === 2 ? seasonId : activeSeason.id, date: `2026-06-${index + 10}`, time: "18:00", opponent: `Guided QA Opponent ${index}`, home: true }))));
    await checkResult(await client.from("player_match_stats").insert(matchIds.map((matchId, index) => ({ club_id: clubId, player_id: playerId, match_id: matchId, goals: index + 1, assists: index, mins: 75, starts: true }))));
    await checkResult(await client.from("league_standings").insert({ id: standingId, club_id: clubId, team_name: `Guided QA team ${suffix}`, team_abbreviation: "QA", played: 3, wins: 2, draws: 1, losses: 0, goal_difference: 4, points: 7, sort_order: 77 }));
    await checkResult(await client.from("registration_forms").insert({ id: formId, club_id: clubId, slug: `guided-qa-${suffix}`, title: formTitle, status: "closed", participant_mode: "adult_only", waiver_text: "Synthetic browser consent fixture." }));
    await checkResult(await client.from("registration_price_options").insert({ id: priceId, club_id: clubId, form_id: formId, label: "QA fee", amount_cents: 1250, position: 0, active: true }));
    await checkResult(await client.from("registration_form_fields").insert([
      { club_id: clubId, form_id: formId, field_key: "registrant_name", label: "Registrant name", field_type: "name", participant_scope: "adult", position: 0 },
      { club_id: clubId, form_id: formId, field_key: "consent_signature", label: "Consent signature", field_type: "signature", participant_scope: "all", position: 1 },
    ]));
    await checkResult(await client.from("registrations").insert(["paid", "refunded"].map((status, index) => ({
      club_id: clubId, form_id: formId, price_option_id: priceId, price_label: "QA fee", amount_cents: 1250, status, paid_at: new Date().toISOString(), refunded_at: status === "refunded" ? new Date().toISOString() : null, amount_refunded_cents: status === "refunded" ? 1250 : 0,
      registrant_email: `guided-${status}@local.test`, participant_type: "adult", answers: { registrant_name: `QA ${status} person`, consent_signature: "data:image/png;base64,iVBORw0KGgo=" },
      waiver_accepted_at: new Date().toISOString(), status_token_hash: randomUUID().replaceAll("-", "").repeat(2), submitted_at: new Date(Date.now() - index * 60_000).toISOString(),
    }))));
  } catch (error) { await restore(); throw error; }
  return { seasonId, playerId, matchId: matchIds[2], rowName, formTitle, formId, suffix, seasonLabel, restore };
}

async function setTheme(page: Page, theme: "light" | "dark") {
  const toggle = page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true });
  if (await toggle.count()) await toggle.click();
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
}

test.describe.configure({ mode: "serial" });
for (const width of [390, 1440]) {
  test(`${width}px management: persisted stats, chart theme redraw, registration copy/CSV/disclosure and all route layouts`, async ({ page, context }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width, height: 844 });
    // Recording this fixture before all UI writes and restoring in finally keeps
    // existing Alpha rows, including their timestamps, byte-for-byte unchanged.
    const fixture = await fixtures();
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/admin/seasons");
      await expect(page.getByText(`${fixture.seasonLabel} Season`, { exact: true })).toBeVisible();
      await page.goto("/admin/season-stats");
      await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
      const seasonGoals = page.getByRole("spinbutton", { name: `${fixture.rowName}: goals`, exact: true });
      await expect(seasonGoals).toHaveValue("1");
      expect((await seasonGoals.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await seasonGoals.fill("9");
      await page.getByRole("button", { name: "Save All", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Saved successfully");
      await expect(page.getByRole("button", { name: "Save All", exact: true })).toBeDisabled();
      await page.reload();
      await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
      await expect(seasonGoals).toHaveValue("9");
      const group = page.locator('button[aria-controls="season-stats-forward"]');
      await group.click();
      await expect(group).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#season-stats-forward")).toHaveAttribute("inert", "");
      for (let index = 0; index < 6; index++) {
        await page.keyboard.press("Tab");
        expect(await page.locator("#season-stats-forward").evaluate(element => element.contains(document.activeElement))).toBe(false);
      }
      await group.click();

      await page.goto("/admin/stats");
      await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
      await expect(page.getByRole("combobox", { name: "Match", exact: true })).toBeEnabled();
      await page.getByRole("combobox", { name: "Match", exact: true }).selectOption(fixture.matchId);
      const matchGoals = page.getByRole("spinbutton", { name: `${fixture.rowName}: goals`, exact: true });
      await expect(matchGoals).toHaveValue("3");
      await matchGoals.fill("8");
      await page.getByRole("button", { name: "Save All Stats", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("Saved successfully");
      await expect(page.getByRole("button", { name: "Save All Stats", exact: true })).toBeDisabled();
      await page.reload();
      await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
      await expect(page.getByRole("combobox", { name: "Match", exact: true })).toBeEnabled();
      await page.getByRole("combobox", { name: "Match", exact: true }).selectOption(fixture.matchId);
      await expect(matchGoals).toHaveValue("8");

      await page.goto("/admin/analytics");
      await page.getByRole("group", { name: "Filter players by position" }).getByRole("button", { name: "Forward", exact: true }).click();
      await page.getByRole("button", { name: new RegExp(fixture.rowName) }).click();
      const bar = page.locator('canvas[aria-label="Bar chart comparing player stats vs position average"]');
      const line = page.locator('canvas[aria-label="Line chart showing G+A trend over matches"]');
      await expect(bar).toBeVisible();
      await expect(line).toBeVisible();
      await setTheme(page, "light");
      await page.waitForTimeout(250);
      const before = await Promise.all([bar.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL()), line.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())]);
      await setTheme(page, "dark");
      await expect.poll(async () => await bar.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(before[0]);
      await expect.poll(async () => await line.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(before[1]);

      await page.goto("/admin/registrations");
      await page.getByRole("button", { name: new RegExp(fixture.formTitle) }).click();
      await page.getByRole("button", { name: "Copy link", exact: true }).first().click();
      await expect(page.getByRole("status")).toHaveText("Public registration link copied.");
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain(`/register/guided-qa-${fixture.suffix}`);
      expect(new URL(copied).hostname).toBe(new URL(page.url()).hostname);
      await expect(page.getByLabel("Price name", { exact: true })).toHaveValue("QA fee");
      await expect(page.getByRole("textbox", { name: "QA fee amount in dollars", exact: true })).toHaveValue("12.50");
      await page.getByRole("tab", { name: /Registrants/ }).click();
      await page.getByRole("button", { name: "Paid 1", exact: true }).click();
      if (width === 390) {
        const summary = page.locator("details summary");
        await expect(summary).toHaveCount(1);
        await expect(summary).toContainText("QA paid person");
        await summary.click();
        await expect(page.getByText("Signature captured", { exact: true })).toBeVisible();
      } else {
        await expect(page.locator("table tbody tr")).toHaveCount(1);
        await expect(page.locator("table tbody")).toContainText("QA paid person");
      }
      await page.getByRole("button", { name: "Refunded 1", exact: true }).click();
      await expect(width === 390 ? page.locator("details summary") : page.locator("table tbody")).toContainText("QA refunded person");
      await page.getByRole("button", { name: "All 2", exact: true }).click();
      await page.getByRole("searchbox", { name: "Search registrants by name or email" }).fill("QA paid");
      await expect(width === 390 ? page.locator("details") : page.locator("table tbody tr")).toHaveCount(1);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: "Export CSV", exact: true }).click();
      const stream = await (await downloadPromise).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const csv = Buffer.concat(chunks).toString("utf8");
      expect(csv).toContain("QA paid person"); expect(csv).toContain("QA refunded person"); expect(csv).toContain("12.50");

      for (const theme of ["light", "dark"] as const) {
        for (const route of ["seasons", "stats", "season-stats", "standings", "analytics", "registrations", "members", "payments"]) {
          await page.goto(`/admin/${route}`);
          await expect(page.locator("main h1")).toBeVisible();
          await setTheme(page, theme);
          if (route === "stats") {
            await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
            await expect(page.getByRole("combobox", { name: "Match", exact: true })).toBeEnabled();
            await page.getByRole("combobox", { name: "Match", exact: true }).selectOption(fixture.matchId);
            await expect(page.getByRole("spinbutton", { name: `${fixture.rowName}: goals`, exact: true })).toHaveValue("8");
          }
          if (route === "seasons") await expect(page.getByText(`${fixture.seasonLabel} Season`, { exact: true })).toBeVisible();
          if (route === "season-stats") {
            await page.getByRole("combobox", { name: "Season", exact: true }).selectOption(fixture.seasonId);
            await expect(page.getByRole("spinbutton", { name: `${fixture.rowName}: goals`, exact: true })).toHaveValue("9");
          }
          if (route === "standings") await expect(page.getByRole("textbox", { name: "Team name", exact: true })).toHaveValue(`Guided QA team ${fixture.suffix}`);
          if (route === "analytics") {
            await page.getByRole("group", { name: "Filter players by position" }).getByRole("button", { name: "Forward", exact: true }).click();
            await page.getByRole("button", { name: new RegExp(fixture.rowName) }).click();
            await expect(page.locator('canvas[aria-label="Bar chart comparing player stats vs position average"]')).toBeVisible();
            await expect(page.locator('canvas[aria-label="Line chart showing G+A trend over matches"]')).toBeVisible();
          }
          if (route === "registrations") {
            await page.getByRole("button", { name: new RegExp(fixture.formTitle) }).click();
            await expect(page.getByLabel("Price name", { exact: true })).toHaveValue("QA fee");
          }
          if (route === "members") {
            await expect(page.getByText("You · owner", { exact: true })).toBeVisible();
            await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
          }
          if (route === "payments") await expect(page.getByText("This test club does not require a paid subscription.", { exact: true })).toBeVisible();
          await expect(page.locator('[role="status"][aria-label^="Loading"]')).toHaveCount(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await page.screenshot({ path: `${artifactDirectory}/${width}-${theme}-${route}.png`, fullPage: true });
        }
      }
    } finally { await fixture.restore(); }
  });
}
