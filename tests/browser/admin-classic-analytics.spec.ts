import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, process.env.CL20_EVIDENCE_DIR ?? ".codex-work/admin-cl-20/browser");
let server: ViteDevServer | undefined;
let origin: string;
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: [{ find: "@/lib/queries", replacement: resolve(repo, "tests/browser/fixtures/admin-cl-20/queries.ts") }, { find: "@", replacement: repo }] },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{
      name: "cl20-local-fixture",
      configureServer(vite) {
        vite.middlewares.use((request, _response, next) => {
          const url = new URL(request.url ?? "/", "http://127.0.0.1");
          if (url.pathname === "/admin/cl20-fixture") request.url = `/tests/browser/fixtures/admin-cl-20/index.html${url.search}`;
          next();
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await server?.close(); });

type BrowserError = { kind: string; message: string; url?: string };
const pageErrors = new WeakMap<Page, BrowserError[]>();

async function open(page: Page, theme: string, params: Record<string, string> = {}) {
  let errors = pageErrors.get(page);
  if (!errors) {
    errors = [];
    pageErrors.set(page, errors);
    const captured = errors;
    page.on("pageerror", (error) => captured.push({ kind: "page", message: error.message }));
    page.on("console", (message) => { if (message.type() === "error") captured.push({ kind: "console", message: message.text(), url: message.location().url }); });
    await page.routeWebSocket("**/*", (socket) => {
      const url = new URL(socket.url());
      const local = new URL(origin);
      if (url.protocol === "ws:" && url.host === local.host && url.pathname === "/" && url.searchParams.has("token")) {
        socket.connectToServer();
      } else {
        captured.push({ kind: "websocket", message: "Unexpected WebSocket", url: `${url.origin}${url.pathname}` });
        socket.close();
      }
    });
    await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  } else errors.length = 0;
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, domain: "127.0.0.1", path: "/admin", sameSite: "Lax" }]);
  const response = await page.goto(`${origin}/admin/cl20-fixture?${new URLSearchParams(params)}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  return errors;
}


type ChartSnapshot = { id: number; labels: string[]; values: number[]; color: string; animation: boolean };
async function chart(page: Page) { return page.evaluate(() => window.__cl20Chart()) as Promise<ChartSnapshot | null>; }
async function values(page: Page, expected: number[]) {
  await expect.poll(async () => (await chart(page))?.values).toEqual(expected);
}
async function settled(page: Page) {
  await expect(page.locator("[data-admin-loading-region]").first()).toHaveAttribute("data-phase", "content");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function settleBars(page: Page) {
  await expect(page.locator('[data-admin-bar-fill][data-first-reveal="true"]')).toHaveCount(0);
  await page.locator("[data-admin-bar-fill]").evaluateAll(async (nodes) => {
    await Promise.all(nodes.flatMap((node) => node.getAnimations()).filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}
async function layout(page: Page, selector: string) {
  return page.locator(selector).evaluate((node) => [...node.querySelectorAll("[data-analytics-part]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { part: el.getAttribute("data-analytics-part"), x: r.x, y: r.y, width: r.width, height: r.height };
  }));
}
for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    for (const motion of ["no-preference", "reduce"] as const) {
      test.describe(`${width}px ${theme} ${motion}`, () => {
        test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
        test("player, filter, revisit and theme update one actual Chart instance and owned cleanup", async ({ page }) => {
          const errors = await open(page, theme);
          await settled(page);
          await values(page, [3, 4, 5]);
          const initial = (await chart(page))!;
          expect(initial.animation).toBe(false);
          await expect(page.locator('[data-admin-bar-fill][data-first-reveal="true"]')).toHaveCount(0);
          const barSlots = await page.locator("[data-admin-bar-fill]").elementHandles();
          expect(barSlots).toHaveLength(9);
          const assertSameBarSlots = async () => {
            for (let i = 0; i < barSlots.length; i++) {
              expect(await barSlots[i].evaluate((node, index) => node.isConnected && node === document.querySelectorAll("[data-admin-bar-fill]")[index], i)).toBe(true);
            }
            await expect(page.locator('[data-admin-bar-fill][data-first-reveal="true"]')).toHaveCount(0);
            expect(await page.locator("[data-admin-bar-fill]").evaluateAll((nodes) => nodes.every((node) => (node as HTMLElement).style.transitionDelay === "0ms"))).toBe(true);
          };
          await page.getByRole("button", { name: "Forward", exact: true }).click();
          await values(page, [1, 2, 3]);
          await assertSameBarSlots();
          expect((await chart(page))!.id).toBe(initial.id);
          await expect(page.getByRole("heading", { name: "Maya Chen", exact: true })).toBeVisible();
          await expect(page.getByRole("img", { name: /Radar chart/ })).toHaveAttribute("aria-label", /Scoring: player 100, position average 77/);
          await expect(page.getByRole("progressbar", { name: "Goals: player 11", exact: true })).toHaveAttribute("aria-valuenow", "100");
          const firstFill = page.locator("[data-admin-bar-fill]").first();
          await expect(firstFill).toHaveAttribute("data-first-reveal", "false");
          await page.getByRole("button", { name: /Sam Okafor/ }).click();
          await values(page, [0, 1, 2]);
          await assertSameBarSlots();
          expect((await chart(page))!.id).toBe(initial.id);
          await expect(firstFill).toHaveAttribute("data-first-reveal", "false");
          await expect(page.getByRole("progressbar", { name: "Goals: player 6", exact: true })).toHaveAttribute("aria-valuenow", "55");
          await page.getByRole("button", { name: /Maya Chen/ }).click();
          await values(page, [1, 2, 3]);
          const beforeTheme = (await chart(page))!;
          await page.getByRole("button", { name: "Toggle theme" }).click();
          await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme === "light" ? "dark" : "light");
          await expect.poll(async () => (await chart(page))!.color).not.toBe(beforeTheme.color);
          expect((await chart(page))!.id).toBe(initial.id);
          await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
          await values(page, [3, 4, 5]);
          await assertSameBarSlots();
          expect((await chart(page))!.id).toBe(initial.id);
          await page.getByRole("button", { name: "All", exact: true }).click();
          await assertSameBarSlots();
          await page.getByRole("button", { name: "Forward", exact: true }).click();
          await values(page, [1, 2, 3]);
          await assertSameBarSlots();
          await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
          await values(page, [3, 4, 5]);
          await assertSameBarSlots();
          expect((await chart(page))!.id).toBe(initial.id);
          await expect(page.getByRole("img", { name: /Radar chart/ })).toHaveAttribute("aria-label", /Reflexes: player 100/);
          const dimensions = await page.locator("[data-analytics-dashboard]").evaluate((node) => {
            const svg = node.querySelector("svg")!;
            const canvas = node.querySelector("canvas")!;
            return { radar: svg.getBoundingClientRect().height, trend: canvas.parentElement!.getBoundingClientRect().height };
          });
          expect(dimensions).toEqual({ radar: 268, trend: 190 });
          await settleBars(page);
          await page.screenshot({ path: resolve(evidence, `lifecycle-${width}-${theme}-${motion}.png`), fullPage: true });
          await page.getByRole("button", { name: "Close fixture" }).click();
          await expect.poll(() => chart(page)).toBeNull();
          await page.getByRole("button", { name: "Open fixture" }).click();
          await values(page, [3, 4, 5]);
          expect((await chart(page))!.id).not.toBe(initial.id);
          expect(errors).toEqual([]);
        });

        test("empty, one match, long names, many players, retry and stable painted loading", async ({ page }) => {
          const records = [];
          for (const params of ([{ mode: "empty" }, { trend: "none" }, { trend: "one" }, { mode: "long" }, { mode: "many" }, { error: "1" }] as Record<string, string>[])) {
            const errors = await open(page, theme, params);
            if (params.error) {
              await expect(page.getByRole("heading", { name: "Analytics unavailable" })).toBeVisible();
              await page.getByRole("button", { name: "Try again" }).click();
            }
            await settled(page);
            if (params.mode === "empty") await expect(page.getByRole("heading", { name: "No players found" })).toBeVisible();
            else if (params.trend === "none") await expect(page.getByText("No match data yet", { exact: true })).toBeVisible();
            else if (params.trend === "one") await expect(page.getByText("Two matches are needed to show a trend.", { exact: true })).toBeVisible();
            else await values(page, [3, 4, 5]);
            if (params.mode === "long") {
              await page.getByRole("button", { name: "Forward", exact: true }).click();
              await expect(page.getByRole("heading", { name: /Alexandre Montgomery/ })).toBeVisible();
            }
            if (params.mode === "many") await expect(page.getByRole("complementary", { name: "Players" }).getByRole("button")).toHaveCount(52);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            expect(errors).toEqual([]);
            records.push(params);
          }
          const errors = await open(page, theme, { hold: "1" });
          const loading = page.locator("[data-admin-loading-region]").first();
          await expect.poll(() => loading.getAttribute("data-phase"), { intervals: [16], timeout: 5000 }).toBe("skeleton");
          const before = await page.locator("[data-analytics-skeleton]").evaluate((node) => {
            const blocks = [...node.querySelectorAll("[data-admin-shimmer]")];
            return { blocks: blocks.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, background: getComputedStyle(el).backgroundColor }; }), at: performance.now() };
          });
          const placeholderLayout = await layout(page, "[data-analytics-skeleton]");
          await settleBars(page);
          await page.screenshot({ path: resolve(evidence, `loading-${width}-${theme}-${motion}.png`) });
          await page.evaluate(() => window.__cl20ReleaseRoster?.());
          await expect.poll(() => loading.getAttribute("data-phase"), { intervals: [16], timeout: 5000 }).toBe("crossfade");
          const during = await page.locator("[data-analytics-skeleton]").evaluate((node) => [...node.querySelectorAll("[data-admin-shimmer]")].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, background: getComputedStyle(el).backgroundColor }; }));
          expect(during).toEqual(before.blocks);
          expect(before.blocks.every((block) => block.background !== "rgba(0, 0, 0, 0)")).toBe(true);
          const revealLayout = await layout(page, "[data-admin-content-layer]");
          await writeFile(resolve(evidence, `loading-geometry-${width}-${theme}-${motion}.json`), JSON.stringify({ before, during, placeholderLayout, revealLayout }, null, 2));
          for (const beforePart of placeholderLayout) {
            const afterPart = revealLayout.find((part) => part.part === beforePart.part)!;
            expect(afterPart, beforePart.part ?? "part").toBeTruthy();
            for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(beforePart[key] - afterPart[key]), `${beforePart.part} ${key}`).toBeLessThanOrEqual(1);
          }
          await settled(page);
          await settleBars(page);
          await page.screenshot({ path: resolve(evidence, `states-${width}-${theme}-${motion}.png`), fullPage: true });
          await writeFile(resolve(evidence, `states-${width}-${theme}-${motion}.json`), JSON.stringify({ records, before, during, placeholderLayout, revealLayout }, null, 2));
          expect(errors).toEqual([]);
        });
      });
    }
  }
}
test("slow A, fast B, revisit A preserves active player results after late response", async ({ page }) => {
  const errors = await open(page, "light", { race: "1" });
  await settled(page);
  await expect.poll(() => page.evaluate(() => window.__cl20Requests.length)).toBe(1);
  const first = page.getByRole("button", { name: "Forward", exact: true });
  await first.click();
  await expect.poll(() => page.evaluate(() => window.__cl20Requests.includes("maya"))).toBe(true);
  await page.evaluate(() => window.__cl20ReleaseTrend?.("maya-1"));
  await values(page, [1, 2, 3]);
  const initial = (await chart(page))!;
  await page.getByRole("button", { name: "Goalkeeper", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__cl20Requests.filter((id) => id === "keeper").length)).toBe(2);
  await page.evaluate(() => window.__cl20ReleaseTrend?.("keeper-2"));
  await values(page, [20, 21, 22]);
  await page.evaluate(() => window.__cl20ReleaseTrend?.("keeper-1"));
  await page.waitForTimeout(100);
  await values(page, [20, 21, 22]);
  expect((await chart(page))!.id).toBe(initial.id);
  expect(errors).toEqual([]);
});

test("320px and medium widths keep complete identities and the 1100px rail boundary", async ({ page }) => {
  for (const width of [320, 820, 1100, 1101]) {
    await page.setViewportSize({ width, height: 900 });
    const errors = await open(page, "light", { mode: "long" });
    await settled(page);
    await page.getByRole("button", { name: "Forward", exact: true }).click();
    await values(page, [1, 2, 3]);
    const rail = page.getByRole("complementary", { name: "Players" });
    const actual = await rail.evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      position: getComputedStyle(node).position,
      direction: getComputedStyle(node.querySelector("button")!.parentElement!).flexDirection,
    }));
    if (width > 1100) expect(actual).toEqual({ width: 240, position: "sticky", direction: "column" });
    else { expect(actual.position).toBe("static"); expect(actual.direction).toBe("row"); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: /Alexandre Montgomery/ })).toBeVisible();
    await settleBars(page);
    await page.screenshot({ path: resolve(evidence, `edge-${width}-light.png`), fullPage: true });
    expect(errors).toEqual([]);
  }
});
