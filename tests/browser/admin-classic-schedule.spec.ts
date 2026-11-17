import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import sharp from "sharp";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { checkAdminDialog, checkAdminSaveButton, checkCompositorAnimations } from "./helpers/admin-design-checks";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const theme = process.env.ADMIN_CLASSIC_COLOR_SCHEME ?? "light";
const motion = process.env.ADMIN_CLASSIC_REDUCED_MOTION === "1" ? "reduced" : "normal";
const artifactPrefix = (project: string) => project + "-" + theme + "-" + motion;
const evidence = resolve(process.cwd(), ".codex-work/admin-cl-12/browser");
let db: Client;
let ids: string[];
let rows: Array<Record<string, unknown>>;
let prefix: string;

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== "alpha.localhost") throw new Error("Schedule acceptance requires synthetic alpha.localhost");
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  ids = [];
  rows = [];
  prefix = "CL12 " + randomUUID().slice(0, 8);
  const season = await db.query("select id from onzio.seasons where club_id=$1 and active=true order by id", [ALPHA]);
  expect(season.rows).toHaveLength(1);
  for (const [index, scores] of [[null, null], [null, null], [3, 1], [2, 2], [0, 1]].entries()) {
    const id = randomUUID();
    const result = await db.query("insert into onzio.matches(id,club_id,season_id,date,time,opponent,home,venue,rose_city_score,opponent_score,competition) values($1,$2,$3,$4,'10:00',$5,$6,'Synthetic local field',$7,$8,'Local league') returning to_jsonb(matches) as row", [id, ALPHA, season.rows[0].id, index === 1 ? "2099-04-01" : "2020-04-01", prefix + " opponent " + index, index % 2 === 0, scores[0], scores[1]]);
    ids.push(id);
    rows.push(result.rows[0].row);
  }
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost") ? route.continue() : route.abort();
  });
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, url: baseURL }]);
  await mkdir(evidence, { recursive: true });
});

test.afterEach(async () => {
  if (db) {
    try {
      if (ids.length) await db.query("delete from onzio.matches where club_id=$1 and (id=any($2::uuid[]) or opponent like $3)", [ALPHA, ids, prefix + "%"]);
      const remaining = await db.query("select id from onzio.matches where club_id=$1 and (id=any($2::uuid[]) or opponent like $3)", [ALPHA, ids, prefix + "%"]);
      expect(remaining.rows).toEqual([]);
    } finally { await db.end(); }
  }
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/schedule");
  await page.getByRole("searchbox", { name: "Search matches by opponent or venue" }).fill(prefix);
  await expect(page.locator("[data-match-id]")).toHaveCount(5);
  return errors;
}

test("month rows, counts, filters, inline results, focus and settled motion", async ({ page }, testInfo) => {
  const errors = await open(page);
  const missing = await db.query("select count(*)::int as count from onzio.matches where club_id=$1 and season_id=$2 and date < $3 and (rose_city_score is null or opponent_score is null)", [ALPHA, rows[0].season_id, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())]);
  await expect(page.getByRole("button", { name: "Result missing " + missing.rows[0].count, exact: true })).toBeVisible();
  await expect(page.locator('[data-outcome="W"]')).toHaveCount(1);
  await expect(page.locator('[data-outcome="D"]')).toHaveCount(1);
  await expect(page.locator('[data-outcome="L"]')).toHaveCount(1);
  await expect(page.getByText("Upcoming", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: /^Home [0-9]/ }).click();
  await expect(page.locator("[data-match-id]")).toHaveCount(3);
  await page.getByRole("button", { name: /^Away [0-9]/ }).click();
  await expect(page.locator("[data-match-id]")).toHaveCount(2);
  await page.getByRole("button", { name: /^All [0-9]/ }).click();
  await page.getByRole("button", { name: /^Result missing [0-9]/ }).click();
  const row = page.locator('[data-match-id="' + ids[0] + '"]');
  await row.getByRole("button", { name: "Add result", exact: true }).click();
  const home = row.getByRole("spinbutton", { name: "Alpha FC score against " + rows[0].opponent });
  await expect(home).toBeFocused();
  await home.press("Escape");
  await expect(row.getByRole("button", { name: "Add result", exact: true })).toBeFocused();
  await row.getByRole("button", { name: "Add result", exact: true }).click();
  await home.fill("4");
  await row.getByRole("spinbutton", { name: String(rows[0].opponent) + " score", exact: true }).fill("2");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.operation === "update");
  await home.press("Enter");
  expect((await response).ok()).toBe(true);
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Result missing [0-9]/ })).toBeFocused();
  await page.getByRole("button", { name: /^All [0-9]/ }).click();
  await expect(row.locator('[data-outcome="W"]')).toHaveText(/W4 – 2/);
  const stored = await db.query("select rose_city_score,opponent_score from onzio.matches where club_id=$1 and id=$2", [ALPHA, ids[0]]);
  expect(stored.rows[0]).toEqual({ rose_city_score: 4, opponent_score: 2 });
  await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-rows.png"), fullPage: true });
  await page.waitForTimeout(1500);
  expect(await checkCompositorAnimations(page, ".admin-portal", false)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("dialog fields, payload identity, dirty guard, media type error and confirmation deletion", async ({ page }, testInfo) => {
  const errors = await open(page);
  const opener = page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Edit match", exact: true });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  expect(await checkAdminDialog(page)).toEqual([]);
  expect(await checkAdminSaveButton(page)).toEqual([]);
  await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-dialog.png"), fullPage: true });
  await dialog.locator('input[type="file"]').first().setInputFiles({ name: "crest.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg></svg>") });
  await expect(dialog.locator("[data-admin-image-error]").first()).toContainText("not a supported image");
  await dialog.locator("#match-opponent").fill("");
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.getByRole("alert")).toHaveText("Opponent is required.");
  await dialog.locator("#match-opponent").fill(String(rows[0].opponent));
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean");
  await dialog.locator("#match-venue").fill("Changed synthetic venue");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Save your changes first?" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(dialog.locator("#match-venue")).toHaveValue("Changed synthetic venue");
  const mutation = page.waitForResponse((response) => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.operation === "update");
  await dialog.evaluate((element) => {
    const timing = { savedAt: 0, closedAt: 0 };
    Object.assign(window, { matchSavedTiming: timing });
    const observer = new MutationObserver(() => {
      if (!timing.savedAt && element.querySelector("[data-admin-save-button]")?.getAttribute("data-state") === "saved") timing.savedAt = performance.now();
      if (timing.savedAt && element.hasAttribute("inert")) { timing.closedAt = performance.now(); observer.disconnect(); }
    });
    observer.observe(element, { subtree: true, attributes: true });
  });
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saving");
  const result = await mutation;
  expect(result.ok()).toBe(true);
  const payload = result.request().postDataJSON().payload;
  const expected = Object.fromEntries(["date", "time", "opponent", "opponent_short_name", "opponent_logo_url", "competition", "sponsor_name", "sponsor_logo_url", "sponsor_link", "home", "venue", "address", "city", "state", "rose_city_score", "opponent_score", "season_id"].map((key) => [key, key === "venue" ? "Changed synthetic venue" : rows[0][key]]));
  expect(payload).toEqual({ ...expected, opponent_logo_asset_id: rows[0].opponent_logo_asset_id, sponsor_logo_asset_id: rows[0].sponsor_logo_asset_id });
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  await expect(dialog).not.toBeVisible();
  const timing = await page.evaluate(() => (window as typeof window & { matchSavedTiming: { savedAt: number; closedAt: number } }).matchSavedTiming);
  expect(timing.closedAt - timing.savedAt).toBeGreaterThanOrEqual(650);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("button", { name: "Delete match", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete this match?", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("This cannot be undone.");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete match", exact: true }).click();
  const deleted = page.waitForResponse((response) => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.operation === "delete");
  await confirmation.getByRole("button", { name: "Delete match", exact: true }).click();
  expect((await deleted).ok()).toBe(true);
  await expect(page.locator('[data-match-id="' + ids[0] + '"]')).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search matches by opponent or venue" })).toBeFocused();
  expect((await db.query("select id from onzio.matches where club_id=$1 and id=$2", [ALPHA, ids[0]])).rows).toEqual([]);
  await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-delete.png"), fullPage: true });
  expect(errors).toEqual([]);
});

for (const count of [0, 1, 51]) {
  test("loading geometry for " + count + " matches", async ({ page }, testInfo) => {
    const fixture = Array.from({ length: count }, (_, index) => ({ ...rows[0], id: randomUUID(), opponent: prefix + " very long opponent name " + index, date: "2020-04-01", rose_city_score: null, opponent_score: null }));
    await page.route("**/api/admin/data", async (route) => {
      const body = route.request().postDataJSON();
      if (body.table === "matches" && body.operation === "select") {
        await new Promise((resolve) => setTimeout(resolve, 450));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: fixture, count: null, error: null }) });
      } else await route.continue();
    });
    await page.addInitScript(() => {
      const observations: Array<{ phase: string; top: number; height: number; rowTop: number | null }> = [];
      const shifts: number[] = [];
      const sources: Array<unknown> = [];
      Object.assign(window, { scheduleGeometry: observations, scheduleShifts: shifts, scheduleShiftSources: sources });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number; sources: Array<{ node: Element; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> };
          if (shift.hadRecentInput) continue;
          shifts.push(shift.value);
          sources.push({ at: shift.startTime, value: shift.value, sources: shift.sources.map((source) => ({ withinMain: Boolean(document.querySelector("main")?.contains(source.node)), tag: source.node?.tagName, id: source.node?.id, className: source.node?.className, previous: source.previousRect.toJSON(), current: source.currentRect.toJSON() })) });
        }
      }).observe({ type: "layout-shift", buffered: true });
      const sample = () => {
        const region = document.querySelector("[data-admin-loading-region]");
        if (region) {
          const box = region.getBoundingClientRect();
          const row = region.querySelector("[data-match-id], [data-schedule-skeleton] > div > div > div");
          observations.push({ phase: region.getAttribute("data-phase") ?? "", top: box.top, height: box.height, rowTop: row?.getBoundingClientRect().top ?? null });
        }
        if (observations.length < 300) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto("/admin/schedule");
    await expect(page.locator('[data-admin-loading-region][data-phase="content"]')).toBeVisible();
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const state = window as typeof window & { scheduleGeometry: Array<{ phase: string; top: number; height: number; rowTop: number | null }>; scheduleShifts: number[]; scheduleShiftSources: Array<{ value: number; sources: Array<{ withinMain: boolean; previous: { left: number; top: number; right: number; bottom: number }; current: { left: number; top: number; right: number; bottom: number } }> }> };
      return {
        samples: state.scheduleGeometry,
        globalShifts: state.scheduleShifts,
        globalCLS: state.scheduleShifts.reduce((sum, value) => sum + value, 0),
        scheduleCLS: state.scheduleShiftSources.filter((entry) => !entry.sources.length || entry.sources.some((source) => source.withinMain)).reduce((sum, entry) => sum + entry.value, 0),
        sources: state.scheduleShiftSources,
        maxScheduleShiftPx: Math.max(0, ...state.scheduleShiftSources.flatMap((entry) => entry.sources.filter((source) => source.withinMain).flatMap((source) => (["left", "top", "right", "bottom"] as const).map((edge) => Math.abs(source.current[edge] - source.previous[edge]))))),
        unattributedShiftEntries: state.scheduleShiftSources.filter((entry) => !entry.sources.length).length,
      };
    });
    await writeFile(resolve(evidence, artifactPrefix(testInfo.project.name) + "-" + count + "-geometry.json"), JSON.stringify(result));
    await testInfo.attach("loading-geometry", { body: JSON.stringify(result), contentType: "application/json" });
    expect(result.samples.some((sample) => sample.phase === "skeleton")).toBe(true);
    const tops = result.samples.map((sample) => sample.top);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    const crossfade = result.samples.filter((sample) => sample.phase === "crossfade");
    const content = result.samples.filter((sample) => sample.phase === "content");
    if (crossfade.length && content.length) expect(Math.abs(crossfade[crossfade.length - 1].height - content[0].height)).toBeLessThanOrEqual(1);
    expect(result.maxScheduleShiftPx).toBeLessThanOrEqual(1);
    expect(result.unattributedShiftEntries).toBe(0);
    const filterBounds = await page.locator("[data-schedule-filter]").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
    expect(Math.max(...filterBounds) - Math.min(...filterBounds)).toBe(0);
    expect(await page.locator("[data-schedule-toolbar]").evaluate((element) => ({ padding: getComputedStyle(element).padding, shadow: getComputedStyle(element).boxShadow }))).toEqual({ padding: "0px", shadow: "none" });
    await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-" + count + "-matches.png"), fullPage: true });
  });
}

test("clean Add dialog Escape and backdrop restore the opener", async ({ page }) => {
  await open(page);
  const add = page.getByRole("button", { name: "Add match", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog", { name: "Add match", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
  await add.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(dialog).not.toBeVisible();
  await expect(add).toBeFocused();
});

async function chooseToday(page: Page, dialog: Locator) {
  await dialog.locator("#match-date").click();
  const today = await page.evaluate(() => new Date().toLocaleDateString());
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(evidence, "calendar-" + page.viewportSize()?.width + ".png") });
  await page.locator('button[data-day="' + today + '"]').click();
}

async function fillNewMatch(page: Page, dialog: Locator) {
  await chooseToday(page, dialog);
  await dialog.locator("#match-time").fill("18:05");
  await dialog.locator("#match-opponent").fill(prefix + " created opponent");
  await dialog.locator("#match-venue").fill("Created local field");
}

test("confirmed Add identity survives a second save and a failed update retry", async ({ page }) => {
  await open(page);
  const operations: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/api/admin/data")) return;
    const body = response.request().postDataJSON();
    if (body?.table !== "matches" || !["insert", "update"].includes(body.operation)) return;
    operations.push(body.operation);
    if (body.operation === "insert" && response.ok()) {
      const result = await response.json();
      for (const row of result.data ?? []) if (!ids.includes(row.id)) ids.push(row.id);
    }
  });
  await page.getByRole("button", { name: "Add match", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add match", exact: true });
  await fillNewMatch(page, dialog);
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  const created = (await db.query("select id from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, prefix + " created opponent"])).rows;
  expect(created).toHaveLength(1);
  await dialog.locator("#match-venue").fill("Second local field");
  await page.waitForTimeout(800);
  await expect(dialog).toBeVisible();
  let failed = false;
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON();
    if (body.table === "matches" && body.operation === "update" && !failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ data: null, error: { message: "Synthetic retryable update failure" }, count: null }) });
    } else await route.continue();
  });
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.getByRole("alert")).toContainText("Synthetic retryable update failure");
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await expect(dialog.locator("#match-venue")).toHaveValue("Second local field");
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  await dialog.locator("#match-venue").fill("Third local field");
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog).not.toBeVisible();
  const persisted = (await db.query("select id,venue from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, prefix + " created opponent"])).rows;
  expect(persisted).toEqual([{ id: created[0].id, venue: "Third local field" }]);
  expect(operations).toEqual(["insert", "update", "update", "update"]);
});

test("nested Calendar accepts real pointer and keyboard dates in Add and Edit", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add match", exact: true }).first().click();
  const add = page.getByRole("dialog", { name: "Add match", exact: true });
  await fillNewMatch(page, add);
  const pointerDate = await page.evaluate(() => {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  });
  await add.locator("#match-date").click();
  const selected = page.locator('button[data-selected-single="true"]');
  await selected.focus();
  await selected.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(add.locator("#match-date")).toBeFocused();
  const keyboardDate = await page.evaluate(() => {
    const date = new Date(); date.setDate(date.getDate() + 1);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  });
  const captured: Array<{ operation: string; date: string }> = [];
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON();
    if (body.table === "matches" && ["insert", "update"].includes(body.operation)) {
      captured.push({ operation: body.operation, date: body.operation === "insert" ? body.payload[0].date : body.payload.date });
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ data: null, count: null, error: { message: "Synthetic date payload capture" } }) });
    }
    return route.continue();
  });
  await add.locator("[data-admin-save-button]").click();
  await expect.poll(() => captured).toEqual([{ operation: "insert", date: keyboardDate }]);
  await expect(add.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await add.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Save your changes first?", exact: true }).getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit match", exact: true });
  await chooseToday(page, edit);
  await edit.locator("[data-admin-save-button]").click();
  await expect.poll(() => captured).toEqual([{ operation: "insert", date: keyboardDate }, { operation: "update", date: pointerDate }]);
  await edit.locator("#match-date").click();
  await page.locator('button[data-selected-single="true"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await edit.locator("[data-admin-save-button]").click();
  await expect.poll(() => captured.at(-1)).toEqual({ operation: "update", date: keyboardDate });
});

test("confirmed deletion of the last search result restores stable focus", async ({ page }) => {
  await open(page);
  const search = page.getByRole("searchbox", { name: "Search matches by opponent or venue" });
  await search.fill(String(rows[0].opponent));
  await expect(page.locator("[data-match-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
  await page.getByRole("dialog", { name: "Edit match", exact: true }).getByRole("button", { name: "Delete match", exact: true }).click();
  await page.getByRole("dialog", { name: "Delete this match?", exact: true }).getByRole("button", { name: "Delete match", exact: true }).click();
  await expect(page.locator("[data-match-id]")).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
});

test("media begun during Saved retains delayed real validation, upload, newer edits and failure", async ({ page }) => {
  if (!process.env.SUPABASE_TEST_URL || !["127.0.0.1", "localhost"].includes(new URL(process.env.SUPABASE_TEST_URL).hostname)) throw Error("Local media required");
  const service = createSupabaseClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const originalAssets = (await db.query("select to_jsonb(a) as row from onzio.media_assets a where club_id=$1 order by id", [ALPHA])).rows;
  const originalObjects = (await db.query("select id,bucket_id,name,metadata from storage.objects where bucket_id in ('onzio-media','onzio-upload-staging') and name like $1 order by id", [ALPHA + "/%"])).rows;
  const uploadIds = new Set<string>();
  const stagingPaths = new Set<string>();
  let inFlight = 0;
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...descriptor, set(value: string) {
      const delay = (window as typeof window & { delayLocalImageRead?: boolean }).delayLocalImageRead && value.startsWith("blob:");
      if (delay) setTimeout(() => descriptor.set!.call(this, value), 1100);
      else descriptor.set!.call(this, value);
    } });
  });
  try {
    await page.route("**/api/admin/media/authorize", async (route) => {
      const response = await route.fetch();
      if (response.ok()) {
        const result = await response.json();
        stagingPaths.add(result.path);
        uploadIds.add(result.path.split("/").pop().split(".")[0]);
      }
      await route.fulfill({ response });
    });
    await page.route("**/api/admin/media/finalize", async (route) => {
      inFlight += 1;
      try {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const response = await route.fetch();
        await route.fulfill({ response });
      } finally { inFlight -= 1; }
    });
    await open(page);
    await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit match", exact: true });
    await dialog.locator("#match-venue").fill("Saved before delayed media");
    await dialog.locator("[data-admin-save-button]").click();
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    await page.evaluate(() => { Object.assign(window, { delayLocalImageRead: true }); });
    const png = await sharp({ create: { width: 96, height: 48, channels: 4, background: { r: 20, g: 120, b: 200, alpha: 1 } } }).png().toBuffer();
    const finalized = page.waitForResponse((response) => response.url().endsWith("/api/admin/media/finalize") && response.ok());
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: "delayed-local-crest.png", mimeType: "image/png", buffer: png });
    await expect(dialog.locator("[data-admin-image-pending]").first()).toBeVisible();
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean");
    await dialog.locator("#match-venue").fill("Newer venue while real image validates");
    await page.waitForTimeout(800);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-admin-image-pending]").first()).toBeVisible();
    const asset = (await (await finalized).json()).data;
    await expect(dialog.locator("[data-admin-image-pending]")).toHaveCount(0);
    await expect(dialog.locator("#match-venue")).toHaveValue("Newer venue while real image validates");
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    await dialog.locator("[data-admin-save-button]").click();
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    expect((await db.query("select venue,opponent_logo_asset_id from onzio.matches where id=$1", [ids[0]])).rows).toEqual([{ venue: "Newer venue while real image validates", opponent_logo_asset_id: asset.assetId }]);
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: "invalid.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    await expect(dialog.locator("[data-admin-image-error]").first()).toContainText("not a supported image");
    await page.waitForTimeout(800);
    await expect(dialog).toBeVisible();
    await page.route("**/api/admin/media/authorize", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic local upload failure" }) }));
    await page.evaluate(() => { Object.assign(window, { delayLocalImageRead: false }); });
    await dialog.locator('input[type="file"]').first().setInputFiles({ name: "failing-local-crest.png", mimeType: "image/png", buffer: png });
    await expect(dialog.locator("[data-admin-image-error]").first()).toContainText("could not be uploaded");
    await expect(dialog.locator("[data-admin-image-preview] img").first()).toHaveAttribute("src", asset.publicUrl);
    await page.waitForTimeout(800);
    await expect(dialog).toBeVisible();
    await dialog.locator("#match-venue").fill("Saved before remove");
    await dialog.locator("[data-admin-save-button]").click();
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    await dialog.getByRole("button", { name: "Remove", exact: true }).first().click();
    await page.waitForTimeout(800);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-admin-image-preview]")).toHaveCount(0);
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  } finally {
    await expect.poll(() => inFlight).toBe(0);
    await db.query("update onzio.matches set opponent_logo_url=null,opponent_logo_asset_id=null where club_id=$1 and id=$2", [ALPHA, ids[0]]);
    for (const uploadId of uploadIds) {
      const asset = (await db.query("select storage_path from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, uploadId])).rows[0];
      if (asset) {
        const result = await service.storage.from("onzio-media").remove([asset.storage_path]);
        if (result.error) throw result.error;
        await db.query("delete from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, uploadId]);
      }
    }
    for (const path of stagingPaths) {
      const result = await service.storage.from("onzio-upload-staging").remove([path]);
      if (result.error) throw result.error;
    }
    expect((await db.query("select to_jsonb(a) as row from onzio.media_assets a where club_id=$1 order by id", [ALPHA])).rows).toEqual(originalAssets);
    expect((await db.query("select id,bucket_id,name,metadata from storage.objects where bucket_id in ('onzio-media','onzio-upload-staging') and name like $1 order by id", [ALPHA + "/%"])).rows).toEqual(originalObjects);
  }
});

test("Save and leave keeps a staged file that starts during an older save", async ({ page }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...descriptor, set(value: string) {
      if (value.startsWith("blob:")) setTimeout(() => descriptor.set!.call(this, value), 1100);
      else descriptor.set!.call(this, value);
    } });
  });
  let releaseSave: () => void = () => {};
  const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  let confirmWrite: () => void = () => {};
  const written = new Promise<void>((resolve) => { confirmWrite = resolve; });
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON();
    if (body.table === "matches" && body.operation === "update") {
      const response = await route.fetch();
      confirmWrite();
      await heldSave;
      return route.fulfill({ response });
    }
    return route.continue();
  });
  await page.route("**/api/admin/media/authorize", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic staged upload failure" }) }));
  try {
    await open(page);
    await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit match", exact: true });
    await dialog.locator("#match-venue").fill("Older confirmed snapshot");
    const chooserPromise = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Upload image", exact: true }).first().click();
    const chooser = await chooserPromise;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
    await guard.getByRole("button", { name: /^Save and/ }).click();
    await written;
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 100, g: 180, b: 40, alpha: 1 } } }).png().toBuffer();
    await chooser.setFiles({ name: "staged-during-save.png", mimeType: "image/png", buffer: png });
    const editor = page.locator('[data-slot="admin-dialog"]').filter({ has: page.locator("#match-venue") });
    await expect(editor.locator("[data-admin-image-pending]").first()).toBeVisible();
    releaseSave();
    await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
    await expect(guard).toBeVisible();
    await expect(editor.locator("[data-admin-image-error]").first()).toContainText("could not be uploaded");
    await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-admin-image-error]").first()).toContainText("could not be uploaded");
    await expect(dialog.locator("#match-venue")).toHaveValue("Older confirmed snapshot");
    expect((await db.query("select venue from onzio.matches where id=$1", [ids[0]])).rows[0].venue).toBe("Older confirmed snapshot");
  } finally { releaseSave(); }
});


for (const mode of ["confirmed Add", "failed Edit"] as const) {
  test("same open guard retries " + mode + " with a late real PNG from the held chooser", async ({ page }, testInfo) => {
    if (!process.env.SUPABASE_TEST_URL || !["127.0.0.1", "localhost"].includes(new URL(process.env.SUPABASE_TEST_URL).hostname)) throw Error("Loopback media required");
    const service = createSupabaseClient(process.env.SUPABASE_TEST_URL, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const originalAssets = (await db.query("select to_jsonb(a) as row from onzio.media_assets a where club_id=$1 order by id", [ALPHA])).rows;
    const originalObjects = (await db.query("select id,bucket_id,name,metadata from storage.objects where bucket_id in ('onzio-media','onzio-upload-staging') and name like $1 order by id", [ALPHA + "/%"])).rows;
    const stagingPaths = new Set<string>();
    const uploadIds = new Set<string>();
    const writes: Array<{ operation: string; payload: Record<string, unknown> }> = [];
    let releaseSave: () => void = () => {};
    const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
    let confirmOlderAttempt: () => void = () => {};
    const olderAttempt = new Promise<void>((resolve) => { confirmOlderAttempt = resolve; });
    let releaseFinalize: () => void = () => {};
    const heldFinalize = new Promise<void>((resolve) => { releaseFinalize = resolve; });
    let inFlight = 0;
    let targetId: string | undefined = mode === "failed Edit" ? ids[0] : undefined;
    await page.route("**/api/admin/data", async (route) => {
      const body = route.request().postDataJSON();
      if (body.table !== "matches" || !["insert", "update"].includes(body.operation)) return route.continue();
      writes.push({ operation: body.operation, payload: body.payload });
      if (writes.length !== 1) return route.continue();
      if (mode === "failed Edit") {
        confirmOlderAttempt();
        await heldSave;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ data: null, error: { message: "Synthetic older guard save failed" }, count: null }) });
      }
      const response = await route.fetch();
      const result = await response.json();
      for (const row of result.data ?? []) {
        targetId = row.id;
        if (!ids.includes(row.id)) ids.push(row.id);
      }
      confirmOlderAttempt();
      await heldSave;
      return route.fulfill({ response });
    });
    await page.route("**/api/admin/media/authorize", async (route) => {
      const response = await route.fetch();
      if (response.ok()) {
        const result = await response.json();
        stagingPaths.add(result.path);
        uploadIds.add(result.path.split("/").pop().split(".")[0]);
      }
      await route.fulfill({ response });
    });
    await page.route("**/api/admin/media/finalize", async (route) => {
      inFlight += 1;
      try {
        await heldFinalize;
        const response = await route.fetch();
        await route.fulfill({ response });
      } finally { inFlight -= 1; }
    });
    try {
      await open(page);
      if (mode === "confirmed Add") await page.getByRole("button", { name: "Add match", exact: true }).first().click();
      else await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: mode === "confirmed Add" ? "Add match" : "Edit match", exact: true });
      if (mode === "confirmed Add") await fillNewMatch(page, dialog);
      const venue = prefix + " guard retry field";
      await dialog.locator("#match-venue").fill(venue);
      const chooserPromise = page.waitForEvent("filechooser");
      await dialog.getByRole("button", { name: "Upload image", exact: true }).first().click();
      const chooser = await chooserPromise;
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
      await expect(guard).toBeVisible();
      const guardNode = await guard.elementHandle();
      await guard.getByRole("button", { name: /^Save and/ }).click();
      await olderAttempt;
      const png = await sharp({ create: { width: 96, height: 48, channels: 4, background: { r: 40, g: 130, b: 210, alpha: 1 } } }).png().toBuffer();
      await chooser.setFiles({ name: "late-valid-guard-crest.png", mimeType: "image/png", buffer: png });
      const editor = page.locator('[data-slot="admin-dialog"]').filter({ has: page.locator("#match-venue") });
      await expect(editor.locator("[data-admin-image-pending]").first()).toBeVisible();
      releaseSave();
      await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
      await expect(guard).toBeVisible();
      await guard.getByRole("button", { name: /^Save and/ }).click();
      await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
      expect(writes).toHaveLength(1);
      const finalized = page.waitForResponse((response) => response.url().endsWith("/api/admin/media/finalize") && response.ok());
      releaseFinalize();
      const asset = (await (await finalized).json()).data;
      await expect(editor.locator("[data-admin-image-pending]")).toHaveCount(0);
      await expect(editor.locator("[data-admin-image-preview] img").first()).toHaveAttribute("src", asset.publicUrl);
      expect(await guardNode!.evaluate((element) => element.isConnected)).toBe(true);
      await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-same-guard-" + mode.replaceAll(" ", "-") + ".png"), fullPage: true });
      await guard.getByRole("button", { name: /^Save and/ }).click();
      await expect(guard).not.toBeVisible();
      await expect(dialog).not.toBeVisible();
      expect(writes.map((write) => write.operation)).toEqual(mode === "confirmed Add" ? ["insert", "update"] : ["update", "update"]);
      const saved = (await db.query("select id,venue,opponent_logo_url,opponent_logo_asset_id from onzio.matches where club_id=$1 and id=$2", [ALPHA, targetId])).rows;
      expect(saved).toEqual([{ id: targetId, venue, opponent_logo_url: asset.publicUrl, opponent_logo_asset_id: asset.assetId }]);
      const count = (await db.query("select id from onzio.matches where club_id=$1 and opponent=$2", [ALPHA, mode === "confirmed Add" ? prefix + " created opponent" : rows[0].opponent])).rows;
      expect(count).toEqual([{ id: targetId }]);
      expect(writes[1].payload).toMatchObject({ venue, opponent_logo_url: asset.publicUrl, opponent_logo_asset_id: asset.assetId });
    } finally {
      releaseSave();
      releaseFinalize();
      await expect.poll(() => inFlight).toBe(0);
      await db.query("delete from onzio.matches where club_id=$1 and (id=any($2::uuid[]) or opponent like $3)", [ALPHA, ids, prefix + "%"]);
      for (const uploadId of uploadIds) {
        const asset = (await db.query("select storage_path from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, uploadId])).rows[0];
        if (asset) {
          const removed = await service.storage.from("onzio-media").remove([asset.storage_path]);
          if (removed.error) throw removed.error;
          await db.query("delete from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, uploadId]);
        }
      }
      for (const path of stagingPaths) {
        const removed = await service.storage.from("onzio-upload-staging").remove([path]);
        if (removed.error) throw removed.error;
      }
      expect((await db.query("select to_jsonb(a) as row from onzio.media_assets a where club_id=$1 order by id", [ALPHA])).rows).toEqual(originalAssets);
      expect((await db.query("select id,bucket_id,name,metadata from storage.objects where bucket_id in ('onzio-media','onzio-upload-staging') and name like $1 order by id", [ALPHA + "/%"])).rows).toEqual(originalObjects);
    }
  });
}


test("responsive toolbar aligns search and filters with stable reserved counts", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let count = 0;
  await page.route("**/api/admin/data", async (route) => {
    const body = route.request().postDataJSON();
    if (body.table === "matches" && body.operation === "select") {
      const fixture = Array.from({ length: count }, (_, index) => ({ ...rows[0], id: randomUUID(), opponent: prefix + " layout " + index }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: fixture, count: null, error: null }) });
    }
    return route.continue();
  });
  const widths = testInfo.project.use.viewport?.width === 390 ? [390] : [768, 1024, 1280];
  const measurements = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    let baseline: { search: DOMRect; filters: DOMRect; buttons: DOMRect[] } | undefined;
    for (count of [0, 1, 51]) {
      await page.goto("/admin/schedule");
      await expect(page.locator('[data-admin-loading-region][data-phase="content"]')).toBeVisible();
      await expect(page.locator("[data-match-id]")).toHaveCount(count);
      const geometry = await page.locator("[data-schedule-toolbar]").evaluate((toolbar) => {
        const box = (element: Element) => element.getBoundingClientRect().toJSON() as DOMRect;
        return {
          toolbar: box(toolbar), search: box(toolbar.querySelector('input[type="search"]')!),
          filters: box(toolbar.querySelector('[role="group"]')!),
          buttons: [...toolbar.querySelectorAll("[data-schedule-filter]")].map(box),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(geometry.buttons).toHaveLength(4);
      expect(Math.max(...geometry.buttons.map((button) => button.top)) - Math.min(...geometry.buttons.map((button) => button.top))).toBeLessThanOrEqual(1);
      expect(geometry.overflow).toBeLessThanOrEqual(0);
      expect(geometry.search.width).toBeGreaterThan(100);
      expect(Math.abs(geometry.search.left - geometry.toolbar.left)).toBeLessThanOrEqual(1);
      if (width === 390) expect(geometry.filters.top).toBeGreaterThan(geometry.search.bottom);
      else {
        expect(Math.abs(geometry.search.top + geometry.search.height / 2 - geometry.filters.top - geometry.filters.height / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.filters.right - geometry.toolbar.right)).toBeLessThanOrEqual(1);
        expect(geometry.search.right).toBeLessThan(geometry.filters.left);
      }
      if (baseline) {
        for (const key of ["search", "filters"] as const) {
          for (const edge of ["left", "top", "width", "height"] as const) expect(Math.abs(geometry[key][edge] - baseline[key][edge])).toBeLessThanOrEqual(1);
        }
        geometry.buttons.forEach((button, index) => expect(Math.abs(button.width - baseline!.buttons[index].width)).toBeLessThanOrEqual(1));
      }
      baseline = geometry;
      measurements.push({ width, count, ...geometry });
    }
    await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-toolbar-" + width + ".png"), fullPage: false });
  }
  await testInfo.attach("responsive-toolbar", { body: JSON.stringify(measurements), contentType: "application/json" });
  expect(errors).toEqual([]);
});

test("long Add and Edit keep header and footer pinned after deep scroll and failed save", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/admin/data", (route) => {
    const body = route.request().postDataJSON();
    if (body.table === "matches" && (body.operation === "insert" || body.operation === "update")) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ data: null, count: null, error: { message: "Synthetic pinned dialog save failure" } }) });
    }
    return route.continue();
  });
  const measurements = [];
  for (const mode of ["Add", "Edit"]) {
    await open(page);
    if (mode === "Add") await page.getByRole("button", { name: "Add match", exact: true }).first().click();
    else await page.getByRole("button", { name: "Edit match against " + rows[0].opponent, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: mode + " match", exact: true });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(350);
    if (mode === "Add") {
      await dialog.locator("#match-date").click();
      const today = await page.evaluate(() => new Date().toLocaleDateString());
      await page.locator('button[data-day="' + today + '"]').click();
      await dialog.locator("#match-time").fill("18:05");
      await dialog.locator("#match-opponent").fill(prefix + " pinned dialog");
    }
    await dialog.locator("#match-venue").fill("Synthetic pinned dialog field");
    await dialog.locator("#match-address").fill("10 Local Way");
    await dialog.locator("#match-city").fill("Synthetic City");
    await dialog.locator("#match-state").fill("CA");
    await dialog.locator("#match-club-score").fill("0");
    await dialog.locator("#match-opponent-score").fill("2");
    await dialog.locator('[data-slot="admin-dialog-body"]').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const measure = () => dialog.evaluate((element) => {
      const box = (target: Element) => {
        const bounds = target.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, scrollTop: target.scrollTop, scrollHeight: target.scrollHeight, clientHeight: target.clientHeight };
      };
      return {
        viewportHeight: innerHeight, popup: box(element),
        header: box(element.querySelector('[data-slot="admin-dialog-header"]')!),
        title: box(element.querySelector('[data-slot="admin-dialog-title"]')!),
        close: box(element.querySelector('[data-slot="admin-dialog-close"]')!),
        body: box(element.querySelector('[data-slot="admin-dialog-body"]')!),
        footer: box(element.querySelector('[data-slot="admin-dialog-footer"]')!),
        fileInputContainingBlock: element.querySelector<HTMLInputElement>('input[type="file"]')?.offsetParent === element.querySelector("fieldset > div"),
      };
    });
    const beforeSave = await measure();
    const response = page.waitForResponse((result) => result.url().endsWith("/api/admin/data") && ["insert", "update"].includes(result.request().postDataJSON()?.operation));
    await dialog.locator("[data-admin-save-button]").click();
    expect((await response).status()).toBe(503);
    await expect(dialog.getByRole("alert")).toHaveText("Synthetic pinned dialog save failure");
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    await page.waitForTimeout(750);
    const afterError = await measure();
    for (const geometry of [beforeSave, afterError]) {
      for (const key of ["header", "title", "close", "footer"] as const) {
        expect(geometry[key].top, mode + " " + key + " top").toBeGreaterThanOrEqual(0);
        expect(geometry[key].bottom, mode + " " + key + " bottom").toBeLessThanOrEqual(geometry.viewportHeight);
      }
      expect(geometry.fileInputContainingBlock, mode + " hidden input belongs to the scrolling form").toBe(true);
      expect(geometry.popup.scrollTop, mode + " popup must not scroll").toBe(0);
      expect(geometry.popup.scrollHeight - geometry.popup.clientHeight, mode + " popup must not overflow").toBeLessThanOrEqual(1);
      expect(geometry.body.scrollTop, mode + " body must scroll").toBeGreaterThan(0);
      expect(Math.abs(geometry.header.top - geometry.popup.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.footer.bottom - geometry.popup.bottom)).toBeLessThanOrEqual(1);
      expect(geometry.body.top).toBeGreaterThanOrEqual(geometry.header.bottom - 1);
      expect(geometry.body.bottom).toBeLessThanOrEqual(geometry.footer.top + 1);
    }
    measurements.push({ mode, beforeSave, afterError });
    await page.screenshot({ path: resolve(evidence, artifactPrefix(testInfo.project.name) + "-pinned-" + mode.toLowerCase() + ".png"), fullPage: false });
  }
  await testInfo.attach("pinned-dialog-geometry", { body: JSON.stringify(measurements), contentType: "application/json" });
  expect(errors).toEqual([]);
});
