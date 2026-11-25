import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import sharp from "sharp";
import { createClient as createStorageClient } from "@supabase/supabase-js";
import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { presentationDocumentForTemplate } from "../helpers/presentation-fixture";
import type { PresentationDocument } from "@/packages/presentation";
import { checkAdminDialog, checkAdminSaveButton } from "./helpers/admin-design-checks";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const PLAYER = "55555555-5555-4555-8555-555555555551";
const evidence = resolve(process.cwd(), ".codex-work/admin-cl-13/browser");
const theme = process.env.ADMIN_CLASSIC_COLOR_SCHEME === "dark" ? "dark" : "light";
test.use({ actionTimeout: 15_000 });

type RosterBounds = { top: number; left: number; width: number; height: number };
type RosterLoadingSample = {
  t: number; phase: string | null; height: number; top: number; skeleton: boolean; content: boolean;
  groups: Array<RosterBounds & { label: string; visible: boolean; opacity: number }>;
  filters: Array<RosterBounds & { label: string }>;
  counts: RosterBounds | null;
};
type RosterLoadingWindow = {
  rosterSamples: RosterLoadingSample[];
  rosterCLS: number;
  rosterShifts: Array<{ t: number; value: number; recentInput: boolean; sources: Array<{ node: string; previous: RosterBounds; current: RosterBounds }> }>;
};



async function open(page: Page) {
  const base = process.env.ADMIN_CLASSIC_BASE_URL ?? "http://alpha.localhost:3110";
  if (new URL(base).hostname !== "alpha.localhost") throw new Error("Roster checks require synthetic Alpha.");
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, url: base }]);
  await page.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost") ? route.fallback() : route.abort();
  });
  await page.goto("/admin/roster");
  await expect(page.getByRole("heading", { level: 1, name: "Roster", exact: true })).toBeVisible();
  await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase", "content", { timeout: 30000 });
}


async function holdMutation(page: Page, table: string, operation: string) {
  let release = () => {};
  const gate = new Promise<void>(resolveGate => { release = resolveGate; });
  let reached = false;
  const matches = (request: Request) => request.url().endsWith("/api/admin/data") && request.method() === "POST" && request.postDataJSON()?.table === table && request.postDataJSON()?.operation === operation;
  const started = page.waitForRequest(matches, { timeout: 15000 });
  const response = page.waitForResponse(item => matches(item.request()), { timeout: 15000 });
  void started.catch(() => {});
  void response.catch(() => {});
  const handler = async (route: Route) => {
    if (matches(route.request())) { reached = true; await gate; }
    return route.fallback();
  };
  await page.route("**/api/admin/data", handler);
  return {
    started,
    wasReached: () => reached,
    async finish() { release(); const result = await response; await result.finished(); return result; },
    async cleanup() {
      release();
      if (reached) { const result = await response.catch(() => undefined); await result?.finished(); }
      await page.unroute("**/api/admin/data", handler);
    },
  };
}

test("classic groups, filtering, keyboard collapse and guarded editor", async ({ page }, info) => {
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  const keeper = page.getByRole("button", { name: /^Goalkeepers/ });
  await expect(keeper).toHaveAttribute("aria-expanded", "true");
  await keeper.focus();
  await page.keyboard.press("Enter");
  await expect(keeper).toHaveAttribute("aria-expanded", "false");
  const group = page.locator(`#${await keeper.getAttribute("aria-controls")}`);
  await expect(group).toHaveAttribute("inert", "");
  await page.keyboard.press("Enter");
  await page.getByRole("searchbox").fill("Alpha Keeper");
  await expect(page.locator("[data-player-id]")).toHaveCount(1);
  const rowHeight = await page.locator("[data-player-id]").evaluate(element => element.getBoundingClientRect().height);
  expect(rowHeight).toBe(68);
  await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => checkAdminDialog(page)).toEqual([]);
  await page.screenshot({ path: resolve(evidence, info.project.name + "-" + theme + "-player-dialog.png") });
  await expect(dialog.getByRole("switch", { name: "Show on the public roster" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.locator("[data-admin-image-field]")).toContainText("15 MB");
  await dialog.locator("#player-hometown").fill("Unsaved local change");
  await expect.poll(() => checkAdminSaveButton(page)).toEqual([]);
  await page.keyboard.press("Escape");
  const guard = page.getByRole("dialog", { name: "Save your changes first?" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog.locator("#player-hometown")).toHaveValue("Unsaved local change");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await guard.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Alpha Keeper", exact: true })).toBeFocused();
  await page.getByRole("searchbox").fill("no roster match 7248");
  await expect(page.getByText("No players match your search")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.screenshot({ path: resolve(evidence, `${info.project.name}-${theme}-groups.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test("player save preserves payload and persists visibility with Undo", async ({ page, baseURL }) => {
  if (new URL(baseURL!).hostname !== "alpha.localhost") throw new Error("Synthetic tenant required.");
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const read = async () => (await db.query("select to_jsonb(p) as row from onzio.players p where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].row;
  const original = await read();
  const marker = `CL13 local ${randomUUID().slice(0, 8)}`;
  try {
    await open(page);
    await page.getByRole("group", { name: "Filter players by status" }).getByRole("button", { name: "Active", exact: true }).click();
    await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true });
    await dialog.locator("#player-hometown").fill(marker);
    await dialog.getByRole("switch", { name: "Show on the public roster" }).click();
    const saved = page.waitForResponse(response => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.table === "players" && response.request().postDataJSON()?.operation === "update");
    await dialog.locator("[data-admin-save-button]").click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect((await response.json()).error).toBeNull();
    const request = response.request().postDataJSON();
    const payload = request.values ?? request.payload;
    expect(payload.hometown).toBe(marker);
    expect(payload.active).toBe(false);
    for (const key of ["number", "name", "caption", "nationality", "position", "height", "weight", "age", "school", "previous_club", "photo_url", "bio", "pronunciation", "foot"]) {
      expect(payload[key] ?? null, key).toEqual(original[key] ?? null);
    }
    expect(payload.club_id).toBeUndefined();
    await expect.poll(async () => (await read()).active).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "is hidden from the public roster" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.getByRole("button", { name: /^Undo: Alpha Keeper is hidden/ }).click();
    await expect.poll(async () => (await read()).active).toBe(true);
    await page.reload();
    await page.getByRole("group", { name: "Filter players by position" }).getByRole("button", { name: /^GK/ }).click();
    await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
    await expect(page.locator("#player-hometown")).toHaveValue(marker);
    await page.locator("#player-number").fill("99");
    await page.getByRole("group", { name: "Player position" }).getByRole("button", { name: "DF", exact: true }).click();
    await page.locator("[data-admin-save-button]").click();
    await expect(page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true })).not.toBeVisible();
    await expect.poll(async () => (await read()).position).toBe("Defender");
    expect((await read()).number).toBe(99);
    await expect(page.getByRole("searchbox")).toBeFocused();
  } finally {
    const columns = Object.keys(original).filter(key => !["id", "club_id"].includes(key));
    if (!columns.every(key => /^[a-z_]+$/.test(key))) throw new Error("Unexpected fixture columns.");
    const names = columns.map(key => `"${key}"`).join(",");
    await db.query("begin");
    try {
      await db.query("set local session_replication_role=replica");
      await db.query(`update onzio.players set (${names})=(select ${names} from jsonb_populate_record(null::onzio.players,$1::jsonb)) where club_id=$2 and id=$3`, [JSON.stringify(original), ALPHA, PLAYER]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    expect(await read()).toEqual(original);
    await db.end();
  }
});

test("add player validation, image errors and Staff dialog", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add player", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add player", exact: true });
  await dialog.locator("#player-name").fill("Local validation");
  await dialog.locator("#player-number").fill("100");
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.getByRole("alert")).toHaveText("Use 0 to 99.");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "no-svg.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg></svg>") });
  await expect(dialog.locator("[data-admin-image-error]")).toContainText("PNG");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("button", { name: "Add player", exact: true }).first()).toBeFocused();
  await page.getByRole("tab", { name: "Staff", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  const staff = page.getByRole("dialog", { name: "Add staff member" });
  await expect(staff).toBeVisible();
  await expect(staff.locator("#staff-role")).toBeVisible();
  await expect.poll(() => checkAdminDialog(page)).toEqual([]);
  await staff.getByRole("button", { name: "Cancel", exact: true }).click();
});

for (const count of [0, 1, 51]) {
  for (const delay of [100, 400]) {
    test(`loading ${count} players at ${delay}ms keeps the visible layout and final swap stable`, async ({ page }, info) => {
      const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
      const rows = Array.from({ length: count }, (_, index) => ({
        id: randomUUID(), number: index, name: index === 50 ? "Long player name ".repeat(12) : `Local player ${index}`,
        caption: null, nationality: "United States", position: positions[index % 4], height: "6ft", weight: "170lb",
        hometown: "Local", age: 20, school: null, previous_club: null, photo_url: "", active: index % 3 !== 0,
        bio: null, pronunciation: null, foot: null,
      }));
      await page.route("**/api/admin/data", async route => {
        const body = route.request().postDataJSON();
        if (body.table !== "players" || body.operation !== "select") return route.fallback();
        await new Promise(resolveDelay => setTimeout(resolveDelay, delay));
        return route.fulfill({ json: { data: rows, error: null, count } });
      });
      await page.addInitScript(() => {
        const target = window as unknown as RosterLoadingWindow;
        target.rosterSamples = [];
        target.rosterCLS = 0;
        target.rosterShifts = [];
        const bounds = (rect: DOMRectReadOnly): RosterBounds => ({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        new PerformanceObserver(list => {
          for (const item of list.getEntries()) {
            const shift = item as PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> };
            if (!shift.hadRecentInput) target.rosterCLS += shift.value;
            target.rosterShifts.push({
              t: shift.startTime, value: shift.value, recentInput: shift.hadRecentInput,
              sources: (shift.sources ?? []).map(source => ({ node: source.node instanceof Element ? source.node.tagName : "", previous: bounds(source.previousRect), current: bounds(source.currentRect) })),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
        function sample() {
          const region = document.querySelector("[data-admin-loading-region]");
          if (region) {
            const rect = region.getBoundingClientRect();
            const layer = region.querySelector("[data-admin-skeleton-layer]");
            const opacity = layer ? Number(getComputedStyle(layer).opacity) : 0;
            const summary = document.querySelector("input[type=search]")?.parentElement?.nextElementSibling;
            target.rosterSamples.push({
              t: performance.now(), phase: region.getAttribute("data-phase"), height: rect.height, top: rect.top,
              skeleton: Boolean(layer), content: Boolean(region.querySelector("[data-admin-content-layer]")),
              groups: [...(layer?.querySelectorAll("button[aria-expanded]") ?? [])].map(group => {
                const rect = group.getBoundingClientRect();
                return { ...bounds(rect), label: group.textContent?.replace(/\d+/g, "").trim() ?? "", visible: rect.top < innerHeight && rect.bottom > 0, opacity };
              }),
              filters: [...document.querySelectorAll('[role="group"][aria-label="Filter players by position"] button')].map(button => ({
                ...bounds(button.getBoundingClientRect()), label: button.textContent?.replace(/\d+/g, "").trim() ?? "",
              })),
              counts: summary ? bounds(summary.getBoundingClientRect()) : null,
            });
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
      await open(page);
      await page.waitForTimeout(180);
      const measurements = await page.evaluate(() => {
        const target = window as unknown as RosterLoadingWindow;
        return { samples: target.rosterSamples, cls: target.rosterCLS, shifts: target.rosterShifts };
      });
      const crossfade = measurements.samples.find(sample => sample.phase === "crossfade");
      const settled = measurements.samples.filter(sample => sample.phase === "content").at(-1);
      expect(settled).toBeDefined();
      const opaque = measurements.samples.filter(sample => sample.phase === "skeleton");
      const visible = measurements.samples.filter(sample => sample.groups.some(group => group.opacity > 0.01));
      if (delay === 100) expect(opaque).toHaveLength(0);
      else expect(opaque.length).toBeGreaterThan(0);
      for (const initial of visible[0]?.groups.filter(group => group.visible) ?? []) {
        for (const frame of visible) {
          const current = frame.groups.find(group => group.label === initial.label);
          expect(current, initial.label + " remains present until faded").toBeDefined();
          for (const key of ["top", "left", "width", "height"] as const) {
            expect(Math.abs(current![key] - initial[key]), initial.label + " " + key).toBeLessThanOrEqual(1);
          }
        }
      }
      const first = measurements.samples[0];
      expect(first.filters).toHaveLength(5);
      for (const frame of measurements.samples) {
        for (const initial of first.filters) {
          const current = frame.filters.find(filter => filter.label === initial.label);
          expect(current).toBeDefined();
          for (const key of ["top", "left", "width", "height"] as const) {
            expect(Math.abs(current![key] - initial[key]), initial.label + " filter " + key).toBeLessThanOrEqual(1);
          }
        }
        expect(frame.counts).not.toBeNull();
        for (const key of ["top", "left", "width", "height"] as const) {
          expect(Math.abs(frame.counts![key] - first.counts![key]), "Roster counts " + key).toBeLessThanOrEqual(1);
        }
      }
      if (crossfade) expect(Math.abs(crossfade.height - settled!.height)).toBeLessThanOrEqual(1);
      expect(await page.locator("[data-player-id]").count()).toBe(count);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.effect?.getTiming().iterations === Infinity).length)).toBe(0);
      await mkdir(evidence, { recursive: true });
      const measurementPath = resolve(evidence, info.project.name + "-" + theme + "-" + (process.env.ADMIN_CLASSIC_REDUCED_MOTION ?? "0") + "-loading-" + count + "-" + delay + ".json");
      await writeFile(measurementPath, JSON.stringify(measurements, null, 2));
      await info.attach(`loading-${count}-${delay}`, { body: JSON.stringify(measurements, null, 2), contentType: "application/json" });
      if (count === 0) await expect(page.getByText("No players yet", { exact: true })).toBeVisible();
      if (count === 51) await page.screenshot({ path: resolve(evidence, `${info.project.name}-${theme}-51-players.png`), fullPage: true });
    });
  }
}

test("Staff footer stays aligned after deep scrolling, a save error and a smaller viewport", async ({ page }, info) => {
  const staff = { id: "dededede-dede-4ede-8ede-dededededede", name: "Local footer staff", initials: "FS", role: "Coach", hometown: "Local", nationality: "American", bio: "", photo_url: "", active: true };
  await page.route("**/api/admin/data", route => {
    const body = route.request().postDataJSON();
    if (body.table === "staff" && body.operation === "select") return route.fulfill({ json: { data: [staff], error: null, count: 1 } });
    if (body.table === "staff" && body.operation !== "select") return route.fulfill({ status: 500, json: { data: null, error: { message: "Local footer save error" } } });
    return route.fallback();
  });
  await open(page);
  await page.getByRole("tab", { name: "Staff", exact: true }).click();
  await page.getByRole("main").getByRole("button").filter({ hasText: staff.name }).click();
  const dialog = page.getByRole("dialog", { name: "Edit " + staff.name, exact: true });
  await dialog.locator("#staff-role").fill("Updated coach");
  await dialog.locator("#staff-bio").fill("Long local staff background ".repeat(200));
  const body = dialog.locator('[data-slot="admin-dialog-body"]');
  await body.hover();
  await page.mouse.wheel(0, 1800);
  async function verifyFooter(label: string) {
    await expect.poll(() => dialog.evaluate(element => element.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
    await expect.poll(() => checkAdminDialog(page)).toEqual([]);
    const geometry = await dialog.evaluate(element => {
      const footer = element.querySelector('[data-slot="admin-dialog-footer"]')!;
      const header = element.querySelector('[data-slot="admin-dialog-header"]')!;
      return {
        popupScroll: element.scrollTop, popupOverflow: element.scrollHeight - element.clientHeight,
        headerTop: header.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom, viewport: innerHeight,
        buttons: [...footer.querySelectorAll("button")].map(button => button.getBoundingClientRect().height),
      };
    });
    expect(geometry.popupScroll).toBe(0);
    expect(geometry.popupOverflow).toBeLessThanOrEqual(1);
    expect(geometry.headerTop).toBeGreaterThanOrEqual(-1);
    expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.buttons).toEqual([44, 44, 44]);
    await mkdir(evidence, { recursive: true });
    await writeFile(resolve(evidence, info.project.name + "-" + theme + "-" + (process.env.ADMIN_CLASSIC_REDUCED_MOTION ?? "0") + "-staff-footer-" + label + ".json"), JSON.stringify(geometry, null, 2));
    await page.screenshot({ path: resolve(evidence, info.project.name + "-" + theme + "-" + (process.env.ADMIN_CLASSIC_REDUCED_MOTION ?? "0") + "-staff-footer-" + label + ".png") });
  }
  await verifyFooter("before-save");
  await dialog.locator("[data-admin-save-button]").click();
  await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await expect(dialog.getByRole("alert")).toContainText("Local footer save error");
  await verifyFooter("after-error");
  await page.setViewportSize({ ...page.viewportSize()!, height: 520 });
  await verifyFooter("small-viewport");
});

test("new player sends complete add payload and Staff edits persist", async ({ page, baseURL }) => {
  test.setTimeout(90000);
  if (new URL(baseURL!).hostname !== "alpha.localhost") throw new Error("Synthetic tenant required.");
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const name = `CL13 add ${randomUUID().slice(0, 8)}`;
  let added: string | undefined;
  const staffName = "CL13 Staff " + randomUUID().slice(0, 8);
  let staffId: string | undefined;
  expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rowCount).toBe(0);
  expect((await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rowCount).toBe(0);
  try {
    await open(page);
    await page.getByRole("button", { name: "Add player", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add player", exact: true });
    await dialog.locator("#player-name").fill(name);
    await dialog.locator("#player-number").fill("0");
    await dialog.locator("#player-height").fill("6ft");
    await dialog.locator("#player-weight").fill("170lb");
    await dialog.locator("#player-age").fill("20");
    await dialog.locator("#player-hometown").fill("Local fixture");
    await dialog.locator("#player-nationality").click();
    await dialog.getByRole("textbox", { name: "Search nationalities" }).fill("American");
    await dialog.getByRole("option", { name: /American/ }).click();
    const mutation = page.waitForResponse(response => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.table === "players" && response.request().postDataJSON()?.operation === "insert");
    await dialog.locator("[data-admin-save-button]").click();
    const response = await mutation;
    expect((await response.json()).error).toBeNull();
    const payload = response.request().postDataJSON().payload[0];
    expect(payload).toEqual({ number: 0, name, caption: null, nationality: "American", position: "Midfielder", height: "6ft", weight: "170lb", hometown: "Local fixture", age: 20, school: null, previous_club: null, photo_url: "", bio: null, pronunciation: null, foot: null, active: true, photo_asset_id: null });
    await expect.poll(async () => {
      const rows = await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name]);
      added = rows.rows[0]?.id;
      return rows.rowCount;
    }).toBe(1);
    const createdPlayer = page.getByRole("dialog", { name: "Edit " + name, exact: true });
    const createdPlayerSave = createdPlayer.locator('[data-slot="admin-dialog-footer"] [data-admin-save-button]');
    await expect(createdPlayerSave).toHaveAttribute("data-state", "saved");
    await createdPlayer.locator("#player-hometown").fill("CL13 player after Saved");
    await page.waitForTimeout(800);
    await expect(createdPlayer).toBeVisible();
    await page.route("**/api/admin/data", route => {
      const request = route.request().postDataJSON();
      return request.table === "players" && request.operation === "update"
        ? route.fulfill({ status: 500, json: { data: null, error: { message: "Synthetic player update failure" } } })
        : route.fallback();
    });
    await createdPlayerSave.click();
    await expect(createdPlayer.getByText("Synthetic player update failure", { exact: true })).toBeVisible();
    await expect(createdPlayerSave).toHaveAttribute("data-state", "dirty");
    expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows.map(row => row.id)).toEqual([added]);
    await page.unroute("**/api/admin/data");
    await createdPlayerSave.click();
    await expect(createdPlayerSave).toHaveAttribute("data-state", "saved");
    await page.evaluate(() => {
      const NativeImage = window.Image;
      window.Image = new Proxy(NativeImage, { construct(Target, args) {
        const image = Reflect.construct(Target, args) as HTMLImageElement;
        return new Proxy(image, {
          get(target, property) { return Reflect.get(target, property, target); },
          set(target, property, value) {
            if (property === "onload" && typeof value === "function") {
              target.onload = event => { setTimeout(() => value.call(target, event), 1200); };
              return true;
            }
            return Reflect.set(target, property, value, target);
          },
        });
      } });
    });
    const image = { name: "cl13-local.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l5QAAAAASUVORK5CYII=", "base64") };
    await createdPlayer.locator('input[aria-label="Choose player photo"]').setInputFiles(image);
    await expect(createdPlayer.locator("[data-admin-image-pending-ring]")).toBeVisible();
    await page.waitForTimeout(850);
    await expect(createdPlayer).toBeVisible();
    await expect(createdPlayerSave).toHaveAttribute("data-state", "dirty");
    await expect(createdPlayer.locator("[data-admin-image-preview]")).toBeVisible();
    await createdPlayer.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Discard changes" }).click();
    expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows.map(row => row.id)).toEqual([added]);

    await page.getByRole("button", { name: "Edit " + name, exact: true }).click();
    await createdPlayer.locator("#player-hometown").fill("CL13 guard older player save");
    const heldPlayer = await holdMutation(page, "players", "update");
    try {
      await createdPlayer.locator('input[aria-label="Choose player photo"]').setInputFiles(image);
      await expect(createdPlayer.locator("[data-admin-image-pending-ring]")).toBeVisible();
      await createdPlayer.getByRole("button", { name: "Cancel", exact: true }).click();
      const playerGuard = page.getByRole("dialog", { name: "Save your changes first?" });
      await playerGuard.getByRole("button", { name: "Save and switch", exact: true }).click();
      await page.waitForTimeout(850);
      expect(heldPlayer.wasReached()).toBe(false);
      await expect(playerGuard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
      await expect(playerGuard).toBeVisible();
      await playerGuard.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(createdPlayer).toBeVisible();
      await expect(createdPlayer.locator("[data-admin-image-preview]")).toBeVisible();
      await expect(createdPlayerSave).toHaveAttribute("data-state", "dirty");
      expect((await db.query("select hometown from onzio.players where club_id=$1 and id=$2", [ALPHA, added])).rows[0].hometown).toBe("CL13 player after Saved");
    } finally { await heldPlayer.cleanup(); }
    await createdPlayer.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Discard changes" }).click();
    expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows.map(row => row.id)).toEqual([added]);
    await page.getByRole("tab", { name: "Staff", exact: true }).click();
    await page.getByRole("button", { name: "Add staff", exact: true }).click();
    const addStaff = page.getByRole("dialog", { name: "Add staff member" });
    await addStaff.locator("#staff-initials").fill("CT");
    await addStaff.locator("#staff-name").fill(staffName);
    await addStaff.locator("#staff-role").fill("Local coach");
    await addStaff.locator("#staff-hometown").fill("Local fixture");
    const addStaffButton = addStaff.locator("[data-admin-save-button]");
    await addStaffButton.click();
    await expect(addStaffButton).toHaveAttribute("data-state", "saving");
    const savedStaff = page.getByRole("dialog", { name: "Edit " + staffName });
    await expect(savedStaff.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    await expect(savedStaff).toBeVisible();
    await savedStaff.locator("#staff-role").fill("Local coach after Saved");
    await page.waitForTimeout(800);
    await expect(savedStaff).toBeVisible();
    await page.route("**/api/admin/data", route => {
      const request = route.request().postDataJSON();
      return request.table === "staff" && request.operation === "update"
        ? route.fulfill({ status: 500, json: { data: null, error: { message: "Synthetic staff update failure" } } })
        : route.fallback();
    });
    await savedStaff.locator("[data-admin-save-button]").click();
    await expect(savedStaff.getByText("Synthetic staff update failure", { exact: true })).toBeVisible();
    await expect(savedStaff.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    expect((await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rowCount).toBe(1);
    await page.unroute("**/api/admin/data");
    await savedStaff.locator("[data-admin-save-button]").click();
    await expect(savedStaff.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      savedStaff.locator('[data-slot="file-upload-dropzone"]').click(),
    ]);
    await page.waitForTimeout(850);
    await expect(savedStaff).toBeVisible();
    await chooser.setFiles(image);
    await expect(savedStaff.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    await savedStaff.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Discard changes" }).click();
    staffId = (await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rows[0]?.id;
    expect(staffId).toBeTruthy();
    await page.getByRole("searchbox", { name: "Search staff by name or role" }).fill(staffName);
    await page.getByRole("main").getByRole("button").filter({ hasText: staffName }).first().click();
    const staffDialog = page.getByRole("dialog", { name: "Edit " + staffName });
    await staffDialog.locator("#staff-role").fill("Local CL13 staff role");
    const staffButton = staffDialog.locator("[data-admin-save-button]");
    await staffButton.click();
    await expect(staffButton).toHaveAttribute("data-state", "saving");
    await expect(staffButton).toHaveAttribute("data-state", "saved");
    await expect(staffDialog).toBeVisible();
    await staffDialog.locator("#staff-role").fill("Local CL13 edited after Saved");
    await expect(staffButton).toHaveAttribute("data-state", "dirty");
    await page.waitForTimeout(800);
    await expect(staffDialog).toBeVisible();
    await staffButton.click();
    await expect(staffButton).toHaveAttribute("data-state", "saved");
    await staffDialog.locator("#staff-role").fill("CL13 guard older staff save");
    await staffDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    const staffGuard = page.getByRole("dialog", { name: "Save your changes first?" });
    const heldStaff = await holdMutation(page, "staff", "update");
    try {
      await staffGuard.getByRole("button", { name: "Save and switch", exact: true }).click();
      await heldStaff.started;
      await page.locator('[data-slot="admin-dialog"][data-size="md"] [data-slot="file-upload-input"]').setInputFiles(image);
      expect((await heldStaff.finish()).ok()).toBe(true);
      await expect(staffGuard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
      await expect(staffGuard).toBeVisible();
      await staffGuard.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(staffDialog).toBeVisible();
      await expect(staffDialog.locator('[data-slot="file-upload-preview"]')).toBeVisible();
      await expect(staffButton).toHaveAttribute("data-state", "dirty");
    } finally { await heldStaff.cleanup(); }
    await staffDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Discard changes" }).click();
    expect((await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rows.map(row => row.id)).toEqual([staffId]);
    expect((await db.query("select role from onzio.staff where club_id=$1 and id=$2", [ALPHA, staffId])).rows[0].role).toBe("CL13 guard older staff save");
  } finally {
    const addedPlayers = (await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows.map(row => row.id);
    for (const id of addedPlayers) {
      for (const table of ["player_season_stats", "goalkeeper_season_stats", "player_season_adjustments", "goalkeeper_season_adjustments"]) {
        await db.query("delete from onzio." + table + " where club_id=$1 and player_id=$2", [ALPHA, id]);
      }
      await db.query("delete from onzio.players where club_id=$1 and id=$2", [ALPHA, id]);
    }
    const addedStaff = (await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rows.map(row => row.id);
    for (const id of addedStaff) await db.query("delete from onzio.staff where club_id=$1 and id=$2", [ALPHA, id]);
    expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rowCount).toBe(0);
    expect((await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, staffName])).rowCount).toBe(0);
    await db.end();
  }
});

test("inline stats and player drafts save together, retain partial failures, and Undo uses current position", async ({ page, baseURL }) => {
  test.setTimeout(90000);
  if (new URL(baseURL!).hostname !== "alpha.localhost") throw new Error("Synthetic tenant required.");
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const originalPlayer = (await db.query("select to_jsonb(p) as row from onzio.players p where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].row;
  const originalState = (await db.query("select to_jsonb(s) as row from onzio.presentation_state s where club_id=$1", [ALPHA])).rows[0].row;
  const originalDocument = (await db.query("select to_jsonb(d) as row from onzio.presentation_documents d where club_id=$1 and id=$2", [ALPHA, originalState.published_document_id])).rows[0].row;
  const fixtureDocumentId = randomUUID();
  const statTables = ["player_season_stats", "goalkeeper_season_stats", "player_season_adjustments", "goalkeeper_season_adjustments"];
  const originalStats = new Map<string, unknown[]>();
  for (const table of statTables) originalStats.set(table, (await db.query(`select to_jsonb(s) as row from onzio.${table} s where club_id=$1 and player_id=$2 order by season_id`, [ALPHA, PLAYER])).rows.map(row => row.row));
  const marker = "CL13 combined " + randomUUID().slice(0, 8);
  try {
    const configuration = presentationDocumentForTemplate(originalDocument.configuration as PresentationDocument, "clubhouse");
    const version = (await db.query("select coalesce(max(version),0)+1 as next from onzio.presentation_documents where club_id=$1", [ALPHA])).rows[0].next;
    const fixtureDocument = { ...originalDocument, id: fixtureDocumentId, version, template_id: "clubhouse", configuration, configuration_digest: createHash("sha256").update(JSON.stringify(configuration)).digest("hex") };
    await db.query("insert into onzio.presentation_documents select * from jsonb_populate_record(null::onzio.presentation_documents,$1::jsonb)", [JSON.stringify(fixtureDocument)]);
    await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [ALPHA, fixtureDocumentId]);
    await page.route("**/api/admin/data", async route => {
      const request = route.request().postDataJSON();
      if (["seasons", "goalkeeper_season_totals"].includes(request.table) && request.operation === "select") await new Promise(resolveDelay => setTimeout(resolveDelay, 400));
      return route.fallback();
    });
    await open(page);
    await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
    let editor = page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true });
    const statsRegion = editor.locator("[data-field-count] [data-admin-loading-region]");
    await expect(statsRegion).toHaveAttribute("data-phase", "skeleton");
    const skeletonHeight = (await statsRegion.boundingBox())!.height;
    await expect(statsRegion).toHaveAttribute("data-phase", "content");
    const contentHeight = (await statsRegion.boundingBox())!.height;
    expect(Math.abs(skeletonHeight - contentHeight)).toBeLessThanOrEqual(1);
    const saves = editor.locator("#roster-stat-saves");
    await expect(saves).toBeVisible();
    await mkdir(evidence, { recursive: true });
    await writeFile(resolve(evidence, "inline-stats-" + test.info().project.name + "-" + theme + "-" + (process.env.ADMIN_CLASSIC_REDUCED_MOTION ?? "0") + ".json"), JSON.stringify({ skeletonHeight, contentHeight }));
    await page.unroute("**/api/admin/data");
    const nextSaves = Number(await saves.inputValue()) + 2;
    const heldStats = await holdMutation(page, "goalkeeper_season_adjustments", "upsert");
    try {
      await saves.fill(String(nextSaves));
      await editor.locator("[data-field-count] [data-admin-save-button]").click();
      await heldStats.started;
      await saves.fill(String(nextSaves + 1));
      expect((await heldStats.finish()).ok()).toBe(true);
      await expect(saves).toHaveValue(String(nextSaves + 1));
      await expect(editor.locator("[data-field-count] [data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
      await editor.getByRole("button", { name: "Cancel", exact: true }).click();
      const newerStatsGuard = page.getByRole("dialog", { name: "Save your changes first?" });
      await expect(newerStatsGuard).toBeVisible();
      await newerStatsGuard.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(saves).toHaveValue(String(nextSaves + 1));
    } finally { await heldStats.cleanup(); }
    const season = (await db.query("select id from onzio.seasons where club_id=$1 and active=true", [ALPHA])).rows[0].id;
    await editor.locator("[data-field-count] [data-admin-save-button]").click();
    await expect(editor.locator("[data-field-count] [data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    expect((await db.query("select saves from onzio.goalkeeper_season_totals where club_id=$1 and player_id=$2 and season_id=$3", [ALPHA, PLAYER, season])).rows[0].saves).toBe(nextSaves + 1);
    await editor.locator("#player-hometown").fill(marker);
    await saves.fill(String(nextSaves));
    await expect.poll(() => checkAdminDialog(page)).toEqual([]);
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    let guard = page.getByRole("dialog", { name: "Save your changes first?" });
    await guard.getByRole("button", { name: "Save and switch", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect((await db.query("select hometown from onzio.players where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].hometown).toBe(marker);
    expect((await db.query("select saves from onzio.goalkeeper_season_totals where club_id=$1 and player_id=$2 and season_id=$3", [ALPHA, PLAYER, season])).rows[0].saves).toBe(nextSaves);

    await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
    editor = page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true });
    await editor.locator("#player-hometown").fill(marker + " retry");
    await editor.locator("#roster-stat-saves").fill(String(nextSaves + 1));
    await page.route("**/api/admin/data", async route => {
      const request = route.request().postDataJSON();
      if (request.table === "goalkeeper_season_adjustments" && request.operation === "upsert") {
        return route.fulfill({ status: 500, json: { data: null, count: null, error: { message: "Synthetic scoped stats failure" } } });
      }
      return route.fallback();
    });
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    guard = page.getByRole("dialog", { name: "Save your changes first?" });
    await guard.getByRole("button", { name: "Save and switch", exact: true }).click();
    await expect(guard).toBeVisible();
    await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
    await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(editor).toBeVisible();
    await expect(editor.locator("#player-hometown")).toHaveValue(marker + " retry");
    await expect(editor.locator("#roster-stat-saves")).toHaveValue(String(nextSaves + 1));
    await expect(editor.getByText("Synthetic scoped stats failure", { exact: true })).toBeVisible();
    await page.unroute("**/api/admin/data");
    await expect(editor.locator('[data-slot="admin-dialog-footer"] [data-admin-save-button]')).toHaveAttribute("data-state", "dirty");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes first?" }).getByRole("button", { name: "Save and switch", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect((await db.query("select saves from onzio.goalkeeper_season_totals where club_id=$1 and player_id=$2 and season_id=$3", [ALPHA, PLAYER, season])).rows[0].saves).toBe(nextSaves + 1);

    await page.getByRole("button", { name: "Edit Alpha Keeper", exact: true }).click();
    editor = page.getByRole("dialog", { name: "Edit Alpha Keeper", exact: true });
    await editor.getByRole("switch", { name: "Show on the public roster" }).click();
    await editor.locator('[data-slot="admin-dialog-footer"] [data-admin-save-button]').click();
    await expect(editor).not.toBeVisible();
    await db.query("update onzio.players set position='Defender' where club_id=$1 and id=$2", [ALPHA, PLAYER]);
    const undoRefresh = page.waitForRequest(request => {
      if (!request.url().endsWith("/api/admin/data") || request.method() !== "POST") return false;
      const payload = request.postDataJSON();
      return payload.table === "players" && payload.operation === "select" && payload.columns === "*"
        && Array.isArray(payload.filters) && payload.filters.length === 0
        && payload.order?.column === "number" && payload.order.ascending === true;
    }, { timeout: 15000 });
    void undoRefresh.catch(() => {});
    await page.getByRole("button", { name: /^Undo: Alpha Keeper is hidden/ }).click();
    const undoRefreshResponse = await (await undoRefresh).response();
    expect(undoRefreshResponse).not.toBeNull();
    expect(undoRefreshResponse!.status()).toBe(200);
    await undoRefreshResponse!.finished();
    const restoredPlayer = page.locator('[data-player-id="' + PLAYER + '"]');
    await expect(restoredPlayer).toBeVisible();
    await expect(restoredPlayer).toContainText("DF ·");
    await expect(restoredPlayer.getByText("Hidden", { exact: true })).toHaveCount(0);
    await expect.poll(async () => (await db.query("select active from onzio.players where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].active).toBe(true);
    expect((await db.query("select position from onzio.players where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].position).toBe("Defender");
    expect((await db.query("select player_id from onzio.player_season_stats where club_id=$1 and player_id=$2 and season_id=$3", [ALPHA, PLAYER, season])).rowCount).toBe(1);
  } finally {
    await db.query("begin");
    try {
      await db.query("set local session_replication_role=replica");
      for (const table of statTables) {
        await db.query(`delete from onzio.${table} where club_id=$1 and player_id=$2`, [ALPHA, PLAYER]);
        await db.query(`insert into onzio.${table} select * from jsonb_populate_recordset(null::onzio.${table},$1::jsonb)`, [JSON.stringify(originalStats.get(table))]);
      }
      const playerNames = Object.keys(originalPlayer).filter(key => !["id", "club_id"].includes(key)).map(key => `"${key}"`).join(",");
      await db.query(`update onzio.players set (${playerNames})=(select ${playerNames} from jsonb_populate_record(null::onzio.players,$1::jsonb)) where club_id=$2 and id=$3`, [JSON.stringify(originalPlayer), ALPHA, PLAYER]);
      const stateNames = Object.keys(originalState).filter(key => key !== "club_id").map(key => `"${key}"`).join(",");
      await db.query(`update onzio.presentation_state set (${stateNames})=(select ${stateNames} from jsonb_populate_record(null::onzio.presentation_state,$1::jsonb)) where club_id=$2`, [JSON.stringify(originalState), ALPHA]);
      await db.query("delete from onzio.presentation_documents where club_id=$1 and id=$2", [ALPHA, fixtureDocumentId]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    expect((await db.query("select to_jsonb(p) as row from onzio.players p where club_id=$1 and id=$2", [ALPHA, PLAYER])).rows[0].row).toEqual(originalPlayer);
    expect((await db.query("select to_jsonb(s) as row from onzio.presentation_state s where club_id=$1", [ALPHA])).rows[0].row).toEqual(originalState);
    expect((await db.query("select to_jsonb(d) as row from onzio.presentation_documents d where club_id=$1 and id=$2", [ALPHA, originalState.published_document_id])).rows[0].row).toEqual(originalDocument);
    expect((await db.query("select id from onzio.presentation_documents where club_id=$1 and id=$2", [ALPHA, fixtureDocumentId])).rowCount).toBe(0);
    for (const table of statTables) expect((await db.query(`select to_jsonb(s) as row from onzio.${table} s where club_id=$1 and player_id=$2 order by season_id`, [ALPHA, PLAYER])).rows.map(row => row.row)).toEqual(originalStats.get(table));
    await db.end();
  }
});

test("failed player photo falls back to initials", async ({ page }) => {
  await page.route("**/api/admin/data", route => {
    const request = route.request().postDataJSON();
    if (request.table === "players" && request.operation === "select") return route.fulfill({ json: { data: [{ id: randomUUID(), name: "Failed Photo", number: 20, position: "Forward", active: true, age: 20, nationality: "US", photo_url: "/cl13-no-such-photo.png" }], error: null, count: 1 } });
    return route.fallback();
  });
  await open(page);
  await expect(page.locator("[data-player-id]")).toContainText("FP");
  await expect(page.getByRole("img", { name: "Failed Photo player photo" })).toHaveCount(0);
});


async function guardRetryImage(name: string, background: string) {
  return { name, mimeType: "image/png", buffer: await sharp({ create: { width: 32, height: 32, channels: 4, background } }).png().toBuffer() };
}

function captureGuardRetryAssets(page: Page) {
  const assets: { assetId: string; storagePath: string }[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", response => {
    if (response.url().endsWith("/api/admin/media/finalize") && response.ok()) {
      pending.push(response.json().then(result => { if (result.data) assets.push(result.data); }));
    }
  });
  return async (db: Client) => {
    await Promise.all(pending);
    if (!assets.length) return;
    if (new URL(process.env.SUPABASE_TEST_URL!).hostname !== "127.0.0.1") throw new Error("Local media cleanup required.");
    const storage = createStorageClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    for (const asset of assets) {
      await db.query("delete from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, asset.assetId]);
      const removed = await storage.storage.from("onzio-media").remove([asset.storagePath]);
      expect(removed.error).toBeNull();
      expect((await db.query("select id from onzio.media_assets where club_id=$1 and id=$2", [ALPHA, asset.assetId])).rowCount).toBe(0);
      expect((await db.query("select id from storage.objects where bucket_id='onzio-media' and name=$1", [asset.storagePath])).rowCount).toBe(0);
    }
  };
}

test("same-open guard Player retry persists the current photo exactly once", async ({ page }) => {
  test.setTimeout(90000);
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const name = "CL13 guard player " + randomUUID().slice(0, 8);
  const cleanupAssets = captureGuardRetryAssets(page);
  const inserts: Request[] = [];
  const updates: Request[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/admin/data") && request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.table === "players" && body.operation === "insert") inserts.push(request);
      if (body.table === "players" && body.operation === "update") updates.push(request);
    }
  });
  try {
    await open(page);
    await page.getByRole("button", { name: "Add player", exact: true }).first().click();
    const editor = page.locator('[data-slot="admin-dialog"][data-size="lg"]');
    await editor.locator("#player-name").fill(name);
    await editor.locator("#player-number").fill("0");
    await editor.locator("#player-height").fill("6ft");
    await editor.locator("#player-weight").fill("170lb");
    await editor.locator("#player-age").fill("20");
    await editor.locator("#player-hometown").fill("Guard retry fixture");
    await editor.locator("#player-nationality").click();
    await editor.getByRole("textbox", { name: "Search nationalities" }).fill("American");
    await editor.getByRole("option", { name: /American/ }).click();
    await page.evaluate(() => {
      const callbacks: (() => void)[] = [];
      let released = false;
      const NativeImage = window.Image;
      (window as Window & { releaseGuardPhotoDecode?: () => void }).releaseGuardPhotoDecode = () => { released = true; callbacks.splice(0).forEach(callback => callback()); };
      window.Image = new Proxy(NativeImage, { construct(Target, args) {
        const image = Reflect.construct(Target, args) as HTMLImageElement;
        return new Proxy(image, {
          get(target, property) { return Reflect.get(target, property, target); },
          set(target, property, value) {
            if (property === "onload" && typeof value === "function") {
              target.onload = event => {
                const complete = () => value.call(target, event);
                if (released) complete(); else callbacks.push(complete);
              };
              return true;
            }
            return Reflect.set(target, property, value, target);
          },
        });
      } });
    });
    await editor.locator('input[aria-label="Choose player photo"]').setInputFiles(await guardRetryImage("guard-player-first.png", "#b32539"));
    await expect(editor.locator("[data-admin-image-pending-ring]")).toBeVisible();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
    const save = guard.getByRole("button", { name: "Save and switch", exact: true });
    await save.click();
    await expect(save).toBeEnabled();
    await expect(guard).toBeVisible();
    expect(inserts).toHaveLength(0);
    await page.evaluate(() => (window as Window & { releaseGuardPhotoDecode?: () => void }).releaseGuardPhotoDecode?.());
    await expect(editor.locator("[data-admin-image-pending-ring]")).toBeHidden();
    await expect(editor.locator("[data-admin-image-preview]")).toBeVisible();
    await save.click();
    await expect(guard).toBeHidden();
    await expect(editor).toBeHidden();
    const rows = (await db.query("select id,photo_url,photo_asset_id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].photo_url).toContain("/onzio-media/");
    expect(rows[0].photo_asset_id).toBeTruthy();
    expect(inserts).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect(inserts[0].postDataJSON().payload[0].photo_url).toBe(rows[0].photo_url);
    const image = await page.request.get(rows[0].photo_url);
    expect(image.ok()).toBe(true);
    const metadata = await sharp(await image.body()).metadata();
    expect(metadata.width).toBeGreaterThan(0);
  } finally {
    const rows = (await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rows;
    for (const row of rows) {
      for (const table of ["player_season_stats", "goalkeeper_season_stats", "player_season_adjustments", "goalkeeper_season_adjustments"]) {
        await db.query("delete from onzio." + table + " where club_id=$1 and player_id=$2", [ALPHA, row.id]);
      }
      await db.query("delete from onzio.players where club_id=$1 and id=$2", [ALPHA, row.id]);
    }
    await cleanupAssets(db);
    expect((await db.query("select id from onzio.players where club_id=$1 and name=$2", [ALPHA, name])).rowCount).toBe(0);
    await db.end();
  }
});

test("same-open guard Staff retry persists a File arriving during the first update", async ({ page }) => {
  test.setTimeout(90000);
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const name = "CL13 guard staff " + randomUUID().slice(0, 8);
  const id = randomUUID();
  const cleanupAssets = captureGuardRetryAssets(page);
  let held: Awaited<ReturnType<typeof holdMutation>> | undefined;
  const writes: Request[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/api/admin/data") && request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.table === "staff" && body.operation === "update") writes.push(request);
    }
  });
  try {
    await db.query("insert into onzio.staff(id,club_id,name,initials,role,hometown,active,photo_url) values($1,$2,$3,'GT','Initial coach','Local fixture',true,'')", [id, ALPHA, name]);
    await open(page);
    await page.getByRole("tab", { name: "Staff", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search staff by name or role" }).fill(name);
    await page.getByRole("main").getByRole("button").filter({ hasText: name }).first().click();
    const editor = page.locator('[data-slot="admin-dialog"][data-size="md"]').first();
    await editor.locator("#staff-role").fill("Current guard coach");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
    const save = guard.getByRole("button", { name: "Save and switch", exact: true });
    held = await holdMutation(page, "staff", "update");
    await save.click();
    await held.started;
    await editor.locator('[data-slot="file-upload-input"]').setInputFiles(await guardRetryImage("guard-staff-newer.png", "#395c25"));
    expect((await held.finish()).ok()).toBe(true);
    await expect(save).toBeEnabled();
    await expect(guard).toBeVisible();
    await expect(editor.locator('[data-slot="file-upload-preview"]')).toBeVisible();
    expect((await db.query("select role,photo_url from onzio.staff where club_id=$1 and id=$2", [ALPHA, id])).rows).toEqual([{ role: "Current guard coach", photo_url: "" }]);
    await held.cleanup();
    held = undefined;
    await save.click();
    await expect(guard).toBeHidden();
    await expect(editor).toBeHidden();
    const rows = (await db.query("select id,role,photo_url,photo_asset_id from onzio.staff where club_id=$1 and name=$2", [ALPHA, name])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].role).toBe("Current guard coach");
    expect(rows[0].photo_url).toContain("/onzio-media/");
    expect(rows[0].photo_asset_id).toBeTruthy();
    expect(writes).toHaveLength(2);
    expect(writes[1].postDataJSON().payload.photo_url).toBe(rows[0].photo_url);
    const image = await page.request.get(rows[0].photo_url);
    expect(image.ok()).toBe(true);
    expect((await sharp(await image.body()).metadata()).width).toBeGreaterThan(0);
  } finally {
    await held?.cleanup();
    await db.query("delete from onzio.staff where club_id=$1 and id=$2", [ALPHA, id]);
    await cleanupAssets(db);
    expect((await db.query("select id from onzio.staff where club_id=$1 and name=$2", [ALPHA, name])).rowCount).toBe(0);
    await db.end();
  }
});

for (const kind of ["player", "staff"] as const) {
  test(`${kind} Cancel readiness follows Saving after immediate validation failure`, async ({ page }, info) => {
    await open(page);
    if (kind === "staff") await page.getByRole("tab", { name: "Staff", exact: true }).click();
    const opener = page.getByRole("button", { name: kind === "player" ? "Add player" : "Add staff", exact: true }).first();
    await opener.click();
    const dialog = page.getByRole("dialog", { name: kind === "player" ? "Add player" : "Add staff member", exact: true });
    if (kind === "player") {
      await dialog.locator("#player-name").fill("Cancel validation");
      await dialog.locator("#player-number").fill("100");
    } else {
      await dialog.locator("#staff-role").fill("Cancel validation");
    }
    const expectedError = kind === "player" ? "Use 0 to 99." : "Name is required.";
    await dialog.evaluate(element => {
      type Sample = { state: string | null; disabled: boolean; error: string; t: number };
      const samples: Sample[] = [];
      const sample = () => {
        const save = element.querySelector("[data-admin-save-button]");
        const cancel = Array.from(element.querySelectorAll("button")).find(button => button.textContent === "Cancel");
        if (save && cancel) samples.push({
          state: save.getAttribute("data-state"), disabled: cancel.disabled,
          error: element.querySelector('[role="alert"]')?.textContent ?? "", t: performance.now(),
        });
      };
      const observer = new MutationObserver(sample);
      observer.observe(element, { attributes: true, childList: true, characterData: true, subtree: true });
      sample();
      Object.assign(window, { rosterCancelReadiness: { samples, stop: () => observer.disconnect() } });
    });
    await dialog.locator("[data-admin-save-button]").click();
    await expect(dialog.getByRole("alert")).toHaveText(expectedError);
    await expect(dialog.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    const samples = await page.evaluate(() => {
      const recording = (window as Window & { rosterCancelReadiness?: {
        samples: Array<{ state: string | null; disabled: boolean; error: string; t: number }>;
        stop: () => void;
      } }).rosterCancelReadiness;
      if (!recording) throw new Error("Cancel readiness observer was not installed.");
      recording.stop();
      return recording.samples;
    });
    await writeFile(info.outputPath("cancel-readiness.json"), JSON.stringify(samples, null, 2));
    const rejectedWhileSaving = samples.filter(sample => sample.state === "saving" && sample.error === expectedError);
    expect(rejectedWhileSaving.length).toBeGreaterThan(0);
    expect(rejectedWhileSaving.every(sample => sample.disabled)).toBe(true);
    expect(samples.filter(sample => sample.state === "saving").every(sample => sample.disabled)).toBe(true);
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeEnabled();
    await page.screenshot({ path: info.outputPath("validation-recovered.png") });
    await cancel.click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
}


for (const flow of ["ordinary-cancel", "ordinary-save", "nested-save", "guard-discard", "filtered-save", "add-cancel"] as const) {
  test("Staff native focus returns after " + flow, async ({ page }, info) => {
    const id = randomUUID();
    const name = "Staff focus " + id.slice(0, 8);
    const originalRole = "Original focus role " + id.slice(0, 8);
    let staff = { id, name, initials: "SF", role: originalRole, hometown: "Local", nationality: "American", bio: "", photo_url: "", active: true };
    const writes: Array<{ failed: boolean; payload: Record<string, unknown> }> = [];
    let fail = flow === "nested-save";
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/_vercel/insights/script.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    await page.route("**/api/admin/data", route => {
      const body = route.request().postDataJSON();
      if (body.table !== "staff") return route.fallback();
      if (body.operation === "select") return route.fulfill({ json: { data: [staff], error: null } });
      if (body.operation !== "update") return route.fallback();
      const payload = body.payload ?? body.values;
      writes.push({ failed: fail, payload });
      if (fail) return route.fulfill({ status: 500, json: { data: null, error: { message: "Expected focus control save failure" } } });
      staff = { ...staff, ...payload };
      return route.fulfill({ json: { data: null, error: null } });
    });
    await open(page);
    await page.getByRole("tab", { name: "Staff", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Search staff by name or role", exact: true });
    await search.fill(flow === "filtered-save" ? originalRole : name);
    const row = page.getByRole("main").getByRole("button").filter({ hasText: name }).first();
    const add = page.getByRole("button", { name: "Add staff", exact: true });
    const opener = flow === "add-cancel" ? add : row;
    await expect(opener).toBeVisible();
    if (flow === "ordinary-save") {
      await search.press("Tab");
      await page.getByLabel("Filter staff by status").press("Tab");
      await expect(row).toBeFocused();
      await page.keyboard.press("Enter");
    } else {
      await opener.click();
    }
    const editor = page.getByRole("dialog", { name: flow === "add-cancel" ? "Add staff member" : "Edit " + name, exact: true });
    await expect(editor).toBeVisible();
    const cancel = editor.getByRole("button", { name: "Cancel", exact: true });
    const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
    if (flow === "ordinary-cancel" || flow === "add-cancel") {
      await cancel.click();
    } else {
      await editor.locator("#staff-role").fill("First focus draft");
      if (flow === "nested-save" || flow === "guard-discard") {
        await cancel.click();
        await expect(guard).toBeVisible();
        if (flow === "nested-save") {
          await guard.getByRole("button", { name: "Save and switch", exact: true }).click();
          await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
          await expect(guard.getByRole("alert")).toBeVisible();
          expect(staff.role).toBe(originalRole);
          await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
          await expect(editor).toBeVisible();
          await expect(editor.locator("#staff-role")).toHaveValue("First focus draft");
          await editor.locator("#staff-role").fill("Current successful focus role");
          fail = false;
          await cancel.click();
          await expect(guard).toBeVisible();
          await guard.getByRole("button", { name: "Save and switch", exact: true }).click();
        } else {
          await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
        }
      } else {
        await editor.locator("[data-admin-save-button]").click();
      }
    }
    await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
    const expectedFocus = flow === "filtered-save" ? search : opener;
    await expect(expectedFocus).toBeFocused();
    if (flow === "filtered-save") {
      await expect(row).toHaveCount(0);
      await expect(page.getByText("No staff match your search", { exact: true })).toBeVisible();
    } else {
      await expect(opener).toBeVisible();
    }
    const expectedRole = flow === "nested-save" ? "Current successful focus role" : flow === "ordinary-save" || flow === "filtered-save" ? "First focus draft" : originalRole;
    expect(staff.id).toBe(id);
    expect(staff.role).toBe(expectedRole);
    expect(writes.length).toBe(flow === "nested-save" ? 2 : flow === "ordinary-save" || flow === "filtered-save" ? 1 : 0);
    if (writes.length) expect(writes.at(-1)!.payload.role).toBe(expectedRole);
    await page.keyboard.press("Tab");
    const next = await page.evaluateHandle(() => document.activeElement);
    let nextNativeControl = null;
    if (flow === "add-cancel") {
      const staffTab = page.getByRole("tab", { name: "Staff", exact: true });
      await expect(staffTab).toBeVisible();
      await expect(staffTab).toBeFocused();
      nextNativeControl = await staffTab.evaluate(element => ({
        tag: element.tagName, connected: element.isConnected, tabIndex: (element as HTMLElement).tabIndex,
        inert: Boolean(element.closest("[inert]")), disabled: (element as HTMLButtonElement).disabled,
        hasVisibleBox: element.getClientRects().length > 0, ariaHidden: Boolean(element.closest('[aria-hidden="true"]')),
      }));
      expect(nextNativeControl).toEqual({
        tag: "BUTTON", connected: true, tabIndex: 0, inert: false, disabled: false, hasVisibleBox: true, ariaHidden: false,
      });
    }
    await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(await page.evaluate(element => element === document.activeElement, next)).toBe(true);
    await page.screenshot({ path: info.outputPath("staff-" + flow + "-settled.png") });
    await writeFile(info.outputPath("staff-focus.json"), JSON.stringify({
      flow, id, writes, expectedRole, source: "actual Staff caller and guard with controlled data transport",
      actualFinalFocus: await expectedFocus.evaluate(element => ({ connected: element.isConnected, tabIndex: (element as HTMLElement).tabIndex })),
      nextNativeTabFocusRetained: true, nextNativeControl, errors,
    }, null, 2));
    expect(errors).toEqual([]);
  });
}
