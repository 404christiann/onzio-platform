import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Locator } from "@playwright/test";
import type { ViteDevServer } from "vite";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

const repo = process.cwd();
const evidence = resolve(repo, process.env.CL23_EVIDENCE_DIR ?? ".codex-work/admin-cl-23/browser");
let server: ViteDevServer | undefined;
let origin: string;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlElEQVRogeXOMQEAIAzAsMqeFrTgjcnIwZE/zbnvZ+mAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgLb69Z3wSh87CQAAAABJRU5ErkJggg==", "base64");
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: [
      { find: "@/lib/queries", replacement: resolve(repo, "tests/browser/fixtures/admin-cl-23/queries.ts") },
      { find: "@/lib/admin-client", replacement: resolve(repo, "tests/browser/fixtures/admin-cl-23/admin-client.ts") },
      { find: "@/components/admin/reimagined/Sponsors", replacement: resolve(repo, "tests/browser/fixtures/admin-cl-23/reimagined.tsx") },
      { find: "next/image", replacement: resolve(repo, "tests/browser/fixtures/admin-cl-23/next-image.tsx") },
      { find: "@", replacement: repo },
    ] },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    oxc: { jsx: { runtime: "automatic" } },
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

type Write = { table: string; operation: string; payload?: Record<string, unknown> | Array<Record<string, unknown>>; filters: Array<{ kind: string; column: string; value: unknown }>; head?: boolean };
function gate() { let release = () => {}; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }
function row(id: string, order: number, footer = false): DBSiteSponsorLogo {
  return { id, placement: "carousel", name: `Partner ${id}`, logo_url: `${origin}/__cl23__/asset/${id}.png`, sort_order: order, show_on_homepage: true, show_in_footer: footer, website_url: "https://partner.example", created_at: "2026-11-01T00:00:00Z" };
}
async function backend(page: Page) {
  const state = {
    rows: [row("a", 0, true), row("b", 1), row("c", 2)], writes: [] as Write[], retired: [] as string[][],
    reads: 0, uploads: 0, failUpdate: false, failRead: false, loseInsert: false, commitLostInsert: true,
    readGate: null as ReturnType<typeof gate> | null, writeGate: null as ReturnType<typeof gate> | null,
    uploadGate: null as ReturnType<typeof gate> | null, errors: [] as string[],
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") state.errors.push(message.text()); });
  page.on("requestfailed", (request) => state.errors.push(`Failed ${request.method()} ${new URL(request.url()).pathname}`));
  await page.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url());
    if (url.protocol === "ws:" && url.host === new URL(origin).host && url.pathname === "/" && url.searchParams.has("token")) socket.connectToServer();
    else { state.errors.push(`Unexpected WebSocket ${url.protocol}//${url.host}${url.pathname}`); socket.close(); }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/favicon.ico" || url.pathname.startsWith("/__cl23__/asset/") || url.pathname.startsWith("/storage/v1/object/public/sponsors/")) return route.fulfill({ contentType: "image/png", body: png });
    if (url.pathname === "/__cl23__/read") {
      state.reads += 1;
      await state.readGate?.promise;
      if (state.failRead) { state.failRead = false; return route.fulfill({ json: { error: { message: "Read failed" } } }); }
      return route.fulfill({ json: { data: state.rows } });
    }
    if (url.pathname === "/__cl23__/upload") {
      state.uploads += 1;
      await state.uploadGate?.promise;
      return route.fulfill({ json: { error: (route.request().postDataBuffer()?.length ?? 0) > 5 * 1024 * 1024 ? { message: "The limit is 5 MB." } : null } });
    }
    if (url.pathname === "/__cl23__/retire") { state.retired.push(route.request().postDataJSON()); return route.fulfill({ json: { error: null } }); }
    if (url.pathname !== "/__cl23__/data") return route.continue();
    const request = route.request().postDataJSON() as Write;
    const selected = () => state.rows.filter((row) => request.filters.every((filter) => filter.kind === "in" ? (filter.value as unknown[]).includes((row as unknown as Record<string, unknown>)[filter.column]) : (row as unknown as Record<string, unknown>)[filter.column] === filter.value));
    if (request.operation === "select") return route.fulfill({ json: { error: null, count: request.table === "matches" ? 0 : selected().length, data: [] } });
    state.writes.push(request);
    await state.writeGate?.promise;
    if (request.operation === "update" && state.failUpdate) { state.failUpdate = false; return route.fulfill({ json: { error: { message: "Please retry this save." }, data: null } }); }
    let data: DBSiteSponsorLogo[] = [];
    if (request.operation === "delete") { const ids = new Set(selected().map((row) => row.id)); state.rows = state.rows.filter((row) => !ids.has(row.id)); }
    if (request.operation === "update") { const ids = new Set(selected().map((row) => row.id)); state.rows = state.rows.map((row) => ids.has(row.id) ? { ...row, ...request.payload } as DBSiteSponsorLogo : row); }
    if (request.operation === "insert") {
      data = (request.payload as Array<Record<string, unknown>>).map((payload, index) => ({ ...row(`created-${state.rows.length + index}`, state.rows.length + index), ...payload } as DBSiteSponsorLogo));
      if (!state.loseInsert || state.commitLostInsert) state.rows.push(...data);
      if (state.loseInsert) { state.loseInsert = false; return route.fulfill({ contentType: "application/json", body: "not-json" }); }
    }
    return route.fulfill({ json: { error: null, data } });
  });
  return state;
}
async function open(page: Page, theme: string, academy = false, wait = true) {
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, url: origin }]);
  const response = await page.goto(`${origin}/tests/browser/fixtures/admin-cl-23/?${academy ? "academy=1" : ""}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
  await expect(page.getByRole("heading", { level: 1, name: "Sponsors", exact: true })).toBeVisible();
  if (wait) await settled(page);
}
async function settled(page: Page) {
  await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase", "content");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const logoRows = (page: Page) => page.locator("[data-admin-animated-key]");
const save = (page: Page) => page.locator("[data-admin-save-button]").first();
async function stableSaveBox(page: Page) {
  await save(page).evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  return save(page).boundingBox();
}
async function upload(page: Page, name = "new-partner.png") { await page.locator('[data-slot="file-upload-input"]').setInputFiles({ name, mimeType: "image/png", buffer: png }); }
async function nativeActivate(page: Page, target: Locator) {
  for (let index = 0; index < 80; index += 1) {
    if (await target.evaluate((node) => document.activeElement === node)) { await page.keyboard.press("Enter"); return; }
    await page.keyboard.press("Tab");
  }
  throw new Error("Native Tab navigation did not reach the intended control");
}
async function snapshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(evidence, name + ".png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [390, 1280]) for (const theme of ["light", "dark"] as const) for (const motion of ["no-preference", "reduce"] as const) {
  test.describe(`${width}px ${theme} ${motion}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
    test("Save lifecycle preserves newer text and confirms created IDs after a refresh failure", async ({ page }, info) => {
      const state = await backend(page); await open(page, theme);
      await expect(save(page)).toHaveAttribute("data-state", "clean");
      const initial = await stableSaveBox(page);
      expect(initial?.width).toBeGreaterThanOrEqual(150);
      expect(initial?.height).toBeGreaterThanOrEqual(width === 390 ? 44 : 38);
      if (width === 390) expect(Math.abs(initial!.width - (await page.locator("[data-admin-page-actions]").boundingBox())!.width)).toBeLessThanOrEqual(1);
      await upload(page);
      await expect(logoRows(page)).toHaveCount(4);
      await page.getByRole("textbox", { name: "Sponsor 4 name", exact: true }).fill("Submitted partner");
      state.writeGate = gate();
      await save(page).click();
      await expect(save(page)).toHaveAttribute("data-state", "saving");
      expect((await stableSaveBox(page))?.width).toBe(initial!.width);
      await expect.poll(() => state.writes.filter((write) => write.operation === "insert").length).toBe(1);
      await page.getByRole("textbox", { name: "Sponsor 4 name", exact: true }).fill("Newer partner");
      state.failRead = true;
      state.writeGate.release(); state.writeGate = null;
      await expect(page.getByRole("alert")).toContainText("Read failed");
      await expect(save(page)).toHaveAttribute("data-state", "dirty");
      await expect(page.getByRole("textbox", { name: "Sponsor 4 name", exact: true })).toHaveValue("Newer partner");
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?" });
      await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
      await expect(guard.getByRole("alert")).toContainText("could not be saved");
      await expect(guard).toBeVisible();
      expect(state.writes.filter((write) => write.operation === "insert")).toHaveLength(1);
      expect(state.rows.filter((row) => row.name === "Submitted partner")).toHaveLength(1);
      await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
      await expect(page.getByLabel("Current page")).toHaveText("/admin/roster");
      expect(state.rows.filter((row) => row.name === "Newer partner")).toHaveLength(1);
      expect(state.writes.filter((write) => write.operation === "insert")).toHaveLength(1);
      await expect(save(page)).toHaveAttribute("data-state", "saved");
      expect((await stableSaveBox(page))?.width).toBe(initial!.width);
      await expect(save(page)).toHaveAttribute("data-state", "clean");
      await snapshot(page, info.titlePath.join("-").replace(/[^a-z0-9-]/gi, "_"));
      expect(state.errors).toEqual([]);
    });
    test("placement guard keeps, discards, retries and saves the current placement", async ({ page }, info) => {
      const state = await backend(page); await open(page, theme);
      const name = page.getByRole("textbox", { name: "Sponsor 1 name", exact: true });
      await name.fill("Carousel changed");
      const footer = page.getByRole("button", { name: "Footer — up to 6", exact: true });
      await footer.click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?" });
      await expect(guard).toContainText("Switching to Footer");
      await guard.getByRole("button", { name: "Keep editing" }).click();
      await expect(footer).toBeFocused(); await expect(name).toHaveValue("Carousel changed");
      await footer.click(); state.failUpdate = true;
      await guard.getByRole("button", { name: "Save and switch" }).click();
      await expect(guard.locator("[data-admin-pending-ring]")).toHaveCSS(motion === "reduce" ? "animation-name" : "animation-duration", motion === "reduce" ? "none" : "0.45s");
      await expect(guard.getByRole("alert")).toContainText("could not be saved");
      expect(state.rows[0].name).toBe("Partner a");
      await guard.getByRole("button", { name: "Save and switch" }).click();
      await expect(guard).not.toBeVisible(); await settled(page);
      await expect(footer).toHaveAttribute("aria-current", "page");
      await expect(logoRows(page)).toHaveCount(1);
      expect(state.rows[0].name).toBe("Carousel changed"); expect(state.rows[0].website_url).toBe("https://partner.example");
      await name.fill("Discard me");
      await page.getByRole("button", { name: "Carousel — up to 10", exact: true }).click();
      await guard.getByRole("button", { name: "Discard changes" }).click();
      await expect(guard).not.toBeVisible(); await settled(page);
      await expect(name).toHaveValue("Carousel changed");
      expect(state.rows[0].name).toBe("Carousel changed");
      await snapshot(page, info.titlePath.join("-").replace(/[^a-z0-9-]/gi, "_")); expect(state.errors).toEqual([]);
    });
    test("upload readiness retries the same open guard and removal preserves the other placement", async ({ page }) => {
      const state = await backend(page); await open(page, theme);
      state.uploadGate = gate(); await upload(page);
      await expect.poll(() => state.uploads).toBe(1);
      await expect(save(page)).toHaveAttribute("aria-disabled", "true");
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?" });
      await guard.getByRole("button", { name: "Save and leave" }).click();
      await expect(guard.getByRole("alert")).toContainText("could not be saved");
      expect(state.writes).toHaveLength(0);
      state.uploadGate.release(); state.uploadGate = null;
      await expect(logoRows(page)).toHaveCount(4);
      await guard.getByRole("button", { name: "Save and leave" }).click();
      await expect(page.getByLabel("Current page")).toHaveText("/admin/roster");
      expect(state.rows.filter((row) => row.name === "new partner")).toHaveLength(1);
      await page.getByRole("button", { name: "Remove sponsor logo 1", exact: true }).click();
      await expect(logoRows(page)).toHaveCount(3);
      await expect(page.getByRole("button", { name: "Remove sponsor logo 1", exact: true })).toBeFocused();
      await expect(save(page)).toHaveAttribute("data-state", "dirty"); await save(page).click();
      await expect(save(page)).toHaveAttribute("data-state", "saved");
      expect(state.rows.find((row) => row.id === "a")?.show_on_homepage).toBe(false);
      expect(state.rows.find((row) => row.id === "a")?.show_in_footer).toBe(true);
      expect(state.writes.some((write) => write.operation === "delete")).toBe(false);
      expect(state.errors).toEqual([]);
    });
    test("lost insert responses distinguish confirmed rows from unconfirmed outcomes", async ({ page }) => {
      const state = await backend(page); await open(page, theme); await upload(page);
      await expect(logoRows(page)).toHaveCount(4);
      state.loseInsert = true; await save(page).click();
      await expect(page.getByRole("alert")).toBeVisible(); await expect(save(page)).toHaveAttribute("data-state", "dirty");
      await save(page).click(); await expect(save(page)).toHaveAttribute("data-state", "saved");
      expect(state.writes.filter((write) => write.operation === "insert")).toHaveLength(1);
      await upload(page, "uncertain.png"); await expect(logoRows(page)).toHaveCount(5);
      state.loseInsert = true; state.commitLostInsert = false;
      await save(page).click(); await expect(save(page)).toHaveAttribute("data-state", "dirty");
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?" });
      await guard.getByRole("button", { name: "Save and leave" }).click();
      await expect(guard.getByRole("alert")).toContainText("could not be saved");
      await expect(guard).toBeVisible(); expect(state.writes.filter((write) => write.operation === "insert")).toHaveLength(2);
      await guard.getByRole("button", { name: "Keep editing" }).click();
      await expect(page.getByRole("alert")).toContainText("Reload this page to review saved sponsor logos");
      await expect(save(page)).toHaveAttribute("data-state", "dirty"); expect(state.errors).toEqual([]);
    });
    test("keyboard reorder and late replacement retain current names and discard only owned uploads", async ({ page }) => {
      const state = await backend(page); await open(page, theme);
      await nativeActivate(page, page.getByRole("button", { name: "Move sponsor logo 2 right", exact: true }));
      expect(await page.getByRole("textbox").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toEqual(["Partner a", "Partner c", "Partner b"]);
      state.uploadGate = gate();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Replace sponsor logo 3", exact: true }).click();
      await (await chooser).setFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
      await expect.poll(() => state.uploads).toBe(1);
      await page.getByRole("textbox", { name: "Sponsor 3 name", exact: true }).fill("Renamed during upload");
      await nativeActivate(page, page.getByRole("button", { name: "Move sponsor logo 3 left", exact: true }));
      state.uploadGate.release(); state.uploadGate = null;
      await expect(save(page)).toHaveAttribute("data-state", "dirty");
      await expect(page.getByRole("textbox", { name: "Sponsor 2 name", exact: true })).toHaveValue("Renamed during upload");
      await expect(logoRows(page).nth(1).locator("img")).toHaveAttribute("src", /site-sponsors\/carousel/);
      await page.getByRole("button", { name: "Remove sponsor logo 2", exact: true }).click();
      await expect(logoRows(page)).toHaveCount(2);
      await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
      await page.getByRole("button", { name: "Footer — up to 6", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?" });
      await guard.getByRole("button", { name: "Discard changes" }).click();
      await expect(guard).not.toBeVisible();
      await settled(page);
      expect(state.rows.map((row) => row.name)).toEqual(["Partner a", "Partner b", "Partner c"]);
      expect(state.writes).toHaveLength(0);
      expect(state.retired.flat().some((path) => path.startsWith("site-sponsors/carousel/"))).toBe(true);
      const before = state.uploads;
      await page.locator('[data-slot="file-upload-input"]').setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
      await expect(page.locator('[data-slot="file-upload-error"]')).toContainText("isn't supported");
      expect(state.uploads).toBe(before);
      expect(state.errors).toEqual([]);
    });
    test("opaque loading keeps known three-card geometry until the fade", async ({ page }, info) => {
      const state = await backend(page); state.readGate = gate(); await open(page, theme, false, false);
      const region = page.locator("[data-admin-loading-region]");
      await expect(region).toHaveAttribute("data-phase", "skeleton");
      const measure = () => region.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const layer = element.querySelector("[data-admin-skeleton-layer]");
        const shimmer = element.querySelector("[data-admin-shimmer]");
        return { top: r.top, height: r.height, phase: element.getAttribute("data-phase"), opacity: layer ? getComputedStyle(layer).opacity : null, background: shimmer ? getComputedStyle(shimmer).backgroundColor : null };
      });
      const before = await measure();
      expect(before.opacity).toBe("1"); expect(before.background).not.toBe("rgba(0, 0, 0, 0)");
      await page.screenshot({ path: resolve(evidence, info.titlePath.join("-").replace(/[^a-z0-9-]/gi, "_") + "-opaque.png"), fullPage: true });
      await region.evaluate((element) => {
        const samples: Array<{ height: number; phase: string | null }> = [];
        (window as Window & { cl23LoadingSamples?: typeof samples }).cl23LoadingSamples = samples;
        function sample() {
          samples.push({ height: element.getBoundingClientRect().height, phase: element.getAttribute("data-phase") });
          if (element.isConnected && element.getAttribute("data-phase") !== "content") requestAnimationFrame(sample);
        }
        sample();
      });
      state.readGate.release(); state.readGate = null;
      await settled(page); const after = await measure();
      const samples = await page.evaluate(() => (window as Window & { cl23LoadingSamples?: Array<{ height: number; phase: string | null }> }).cl23LoadingSamples ?? []);
      const fades = samples.filter((sample) => sample.phase === "crossfade");
      expect(fades.length).toBeGreaterThan(0);
      const fade = fades[0];
      expect(Math.abs(fade.height - before.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
      await expect(region.locator("[data-admin-shimmer]")).toHaveCount(0);
      await writeFile(resolve(evidence, info.titlePath.join("-").replace(/[^a-z0-9-]/gi, "_") + "-geometry.json"), JSON.stringify({ before, fades, after, samples }, null, 2));
      expect(state.errors).toEqual([]);
    });
  });
}
test("320px long names, empty data and Academy placement policy retain layout and field limits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const state = await backend(page); state.rows = []; await open(page, "dark", true);
  await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
  await expect(logoRows(page)).toHaveCount(0); expect(await save(page).evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await upload(page, "a-very-long-local-sponsor-with-a-full-name-and-logo.png"); await expect(logoRows(page)).toHaveCount(1);
  const name = page.getByRole("textbox", { name: "Sponsor 1 name", exact: true });
  await name.fill("x".repeat(60)); await expect(name).toHaveAttribute("maxlength", "60"); await save(page).click(); await expect(save(page)).toHaveAttribute("data-state", "saved");
  await snapshot(page, "320-dark-empty-long"); expect(state.errors).toEqual([]);
});
