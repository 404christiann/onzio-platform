import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, process.env.CL19_EVIDENCE_DIR ?? ".codex-work/admin-cl-19/browser");
let server: ViteDevServer | undefined;
let origin: string;
const scenarios = [
  { state: "no_subscription", pill: "Private preview", action: "Start subscription", steps: 2 },
  { state: "active", pill: "Active", action: "Manage billing", steps: 3 },
  { state: "active_canceling", pill: "Ending", action: "Manage billing", steps: 3 },
  { state: "payment_failed", pill: "Payment failed", action: "Resolve payment", steps: 3 },
  { state: "grace", pill: "Payment overdue", action: "Update payment method", steps: 4 },
  { state: "terminal", pill: "Ended", action: "Manage billing", steps: 3 },
];

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: { "@": repo } },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{
      name: "cl19-local-fixture",
      configureServer(vite) {
        vite.middlewares.use((request, _response, next) => {
          const url = new URL(request.url ?? "/", "http://127.0.0.1");
          if (url.pathname === "/admin/cl19-fixture") request.url = `/tests/browser/fixtures/admin-cl-19/index.html${url.search}`;
          next();
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0 },
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
  const response = await page.goto(`${origin}/admin/cl19-fixture?${new URLSearchParams(params)}`);
  expect(response?.status()).toBe(200);
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
  await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
  return errors;
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const measured = { title: rect("h1"), summary: rect("[data-payments-summary]"), timeline: rect("[data-payments-timeline]"), region: rect("[data-classic-payments]"), timeOrigin: performance.timeOrigin };
    const summary = document.querySelector<HTMLElement>("[data-payments-summary]");
    const previous = summary?.style.minHeight ?? "";
    if (summary) summary.style.minHeight = "0px";
    const intrinsicSummaryControlledHeight = summary?.getBoundingClientRect().height ?? null;
    if (summary) summary.style.minHeight = previous;
    return { ...measured, intrinsicSummaryControlledHeight };
  });
}

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    for (const motion of ["no-preference", "reduce"] as const) {
      test.describe(`${width}px ${theme} ${motion}`, () => {
        test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });

        test("six real states retain copy, actions and responsive timeline across three data modes", async ({ page }, info) => {
          const records = [];
          for (const scenario of scenarios) {
            for (const mode of ["normal", "long", "none"]) {
              const errors = await open(page, theme, { state: scenario.state, mode });
              const summary = page.getByRole("region", { name: "Onzio subscription", exact: true });
              const timeline = page.getByRole("region", { name: "What happens next", exact: true });
              await expect(summary.getByText(scenario.pill, { exact: true })).toBeVisible();
              await expect(summary.getByRole("button", { name: scenario.action, exact: true })).toBeVisible();
              await expect(summary.getByRole("button")).toHaveCount(1);
              await expect(timeline.locator("li")).toHaveCount(scenario.steps);
              await expect(timeline.locator('[aria-current="step"]')).toHaveCount(1);
              if (mode === "none") await expect(page.locator("[data-payments-price]")).toHaveCount(0);
              else await expect(page.locator("[data-payments-price]")).toContainText(mode === "long" ? "$12,500.00" : "$85.00");
              expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
              const typography = await page.locator("[data-classic-payments]").evaluate((element) => {
                const root = getComputedStyle(element).fontFamily;
                const headings = [...element.querySelectorAll("h2,h3")].map((heading) => ({ family: getComputedStyle(heading).fontFamily, transform: getComputedStyle(heading).textTransform }));
                const price = element.querySelector("[data-payments-price]");
                return { root, headings, priceFamily: price ? getComputedStyle(price).fontFamily : null };
              });
              expect(typography.headings.every((heading) => heading.family === typography.root && heading.transform === "none")).toBe(true);
              if (mode !== "none") expect(typography.priceFamily).toBe(typography.root);
              const contrast = await summary.getByText(scenario.pill, { exact: true }).evaluate((element) => {
                const style = getComputedStyle(element);
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = 1;
                const context = canvas.getContext("2d")!;
                const channels = (color: string) => {
                  context.clearRect(0, 0, 1, 1);
                  context.fillStyle = color;
                  context.fillRect(0, 0, 1, 1);
                  return [...context.getImageData(0, 0, 1, 1).data];
                };
                const foreground = channels(style.color);
                const background = channels(style.backgroundColor);
                const luminance = (rgb: number[]) => rgb.slice(0, 3).map((channel) => {
                  const value = channel / 255;
                  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
                const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
                return { foreground, background, ratio: (values[1] + 0.05) / (values[0] + 0.05), fontSize: style.fontSize };
              });
              const boxes = await geometry(page);
              expect(boxes.summary).not.toBeNull(); expect(boxes.timeline).not.toBeNull();
              expect(Math.abs(boxes.title!.x - boxes.summary!.x)).toBeLessThanOrEqual(1);
              if (width === 390) {
                expect(Math.abs(boxes.summary!.x - boxes.timeline!.x)).toBeLessThanOrEqual(1);
                expect(boxes.timeline!.y).toBeGreaterThanOrEqual(boxes.summary!.y + boxes.summary!.height);
                const button = await summary.getByRole("button").boundingBox();
                expect(button!.height).toBeGreaterThanOrEqual(44);
                expect(Math.abs(button!.width - (boxes.summary!.width - 38))).toBeLessThanOrEqual(1);
              } else expect(Math.abs(boxes.summary!.y - boxes.timeline!.y)).toBeLessThanOrEqual(1);
              if (scenario.state === "grace") {
                await expect(page.getByRole("progressbar")).toHaveAccessibleName("4 of 20 grace days left");
                await expect(timeline).toContainText("4 of 20 days left");
              }
              if (scenario.state === "payment_failed") {
                await expect(timeline).toContainText("pay the outstanding invoice");
                await expect(timeline.getByRole("link", { name: "onziofutbol@gmail.com" })).toHaveAttribute("href", "mailto:onziofutbol@gmail.com");
              }
              if ((scenario.state === "active" && mode === "normal") || (scenario.state === "grace" && mode === "long")) {
                await page.screenshot({ path: info.outputPath(`${scenario.state}-${mode}.png`), fullPage: true });
              }
              records.push({ ...scenario, mode, boxes, typography, contrast, errors: [...errors] });
              expect(errors).toEqual([]);
            }
          }
          for (const kind of ["demo", "test"]) {
            const errors = await open(page, theme, { state: "no_subscription", kind });
            await expect(page.getByText(`This ${kind} club does not require a paid subscription.`)).toBeVisible();
            await expect(page.getByRole("button")).toHaveCount(0);
            await expect(page.getByRole("region", { name: "What happens next" })).toHaveCount(0);
            expect(errors).toEqual([]);
          }
          await writeFile(info.outputPath("states.json"), JSON.stringify(records, null, 2));
          expect(Math.min(...records.map((record) => record.contrast.ratio))).toBeGreaterThanOrEqual(4.5);
        });

        test("mocked local billing retains a fixed pending action, friendly error and native keyboard success", async ({ page }, info) => {
          const receipts = [];
          for (const scenario of [
            { state: "payment_failed", label: "Resolve payment", kind: "portal", pending: "Opening billing…" },
            { state: "no_subscription", label: "Start subscription", kind: "checkout", pending: "Opening checkout…" },
          ]) {
            const errors = await open(page, theme, { state: scenario.state });
            const endpoint = `${origin}/api/stripe/${scenario.kind}`;
            const destination = `${origin}/opened-${scenario.kind}`;
            const posts: { url: string; method: string; body: string | null }[] = [];
            let release!: () => void;
            const held = new Promise<void>((resolve) => { release = resolve; });
            await page.route(endpoint, async (route) => {
              posts.push({ url: route.request().url(), method: route.request().method(), body: route.request().postData() });
              await held;
              await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "STRIPE_CONFIGURATION_MISSING" }) });
            });
            const action = page.getByRole("button", { name: scenario.label, exact: true });
            const before = await action.boundingBox();
            await action.click();
            const busy = page.getByRole("button", { name: scenario.pending, exact: true });
            await expect(busy).toHaveAttribute("aria-busy", "true");
            const during = await busy.boundingBox();
            expect(Math.abs(before!.width - during!.width)).toBeLessThanOrEqual(1);
            expect(Math.abs(before!.height - during!.height)).toBeLessThanOrEqual(1);
            const ring = await busy.locator("[data-admin-pending-ring]").evaluate((element) => ({ duration: getComputedStyle(element).animationDuration, name: getComputedStyle(element).animationName }));
            expect(ring.duration).toBe(motion === "reduce" ? "0s" : "0.45s");
            await page.keyboard.press("Enter");
            expect(posts).toHaveLength(1);
            release();
            await expect(page.getByRole("alert")).toContainText("Billing isn't fully set up on our side right now.");
            await expect(page.getByRole("alert")).not.toContainText("STRIPE_CONFIGURATION_MISSING");
            await expect(page.getByRole("button", { name: scenario.label, exact: true })).toBeEnabled();
            await page.route(endpoint, async (route) => {
              posts.push({ url: route.request().url(), method: route.request().method(), body: route.request().postData() });
              await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: destination }) });
            });
            await page.route(destination, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Local mocked billing destination</h1>" }));
            await page.keyboard.press("Tab");
            for (let index = 0; index < 12 && !(await action.evaluate((element) => document.activeElement === element)); index += 1) await page.keyboard.press("Tab");
            await expect(action).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(page).toHaveURL(destination);
            expect(posts).toHaveLength(2);
            expect(posts.every((request) => request.method === "POST" && request.body === null && request.url === endpoint)).toBe(true);
            expect(errors).toHaveLength(1);
            expect(errors[0]).toMatchObject({ kind: "console", url: endpoint });
            expect(errors[0].message).toContain("503");
            receipts.push({ scenario, before, during, ring, posts, errors: [...errors] });
          }
          await writeFile(info.outputPath("mocked-billing.json"), JSON.stringify(receipts, null, 2));
        });

        test("same-panel unknown fallback paints before its fixture data swap without claiming server dwell", async ({ page }, info) => {
          const records = [];
          for (const scenario of scenarios) {
            for (const mode of ["normal", "long", "none"]) {
              const errors = await open(page, theme, { state: scenario.state, mode, hold: "1" });
              await expect(page.getByRole("status", { name: "Loading subscription details" })).toBeVisible();
              const before = await geometry(page);
              const paint = await page.locator("[data-payments-skeleton] [data-admin-shimmer]").first().evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, animation: getComputedStyle(element, "::after").animationDuration, animationName: getComputedStyle(element, "::after").animationName }));
              expect(paint.background).toBe(theme === "light" ? "rgb(238, 238, 241)" : "rgb(42, 42, 45)");
              expect(paint.animation).toBe(motion === "reduce" ? "0s" : "1.6s");
              if (scenario.state === "active" && mode === "normal") await page.screenshot({ path: info.outputPath("unknown-fallback.png"), fullPage: true });
              await page.evaluate(() => window.__cl19Release?.());
              await expect(page.locator('[data-view-model-state="ready"]')).toBeVisible();
              await expect(page.getByRole("button", { name: scenario.action, exact: true })).toBeVisible();
              const after = await geometry(page);
              const stable = await geometry(page);
              expect(stable).toMatchObject(after);
              expect(Math.abs(after.title!.x - before.title!.x)).toBeLessThanOrEqual(1);
              expect(Math.abs(after.title!.y - before.title!.y)).toBeLessThanOrEqual(1);
              expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
              records.push({ ...scenario, mode, paint, before, after, unknownInitialExtentDelta: after.region!.height - before.region!.height, unknownHeaderDelta: after.summary!.y - before.summary!.y, errors });
              expect(errors).toEqual([]);
            }
          }
          await writeFile(info.outputPath("unknown-fallback.json"), JSON.stringify({ fixtureOnly: true, streamedServerSuspense: false, acceptedDwellMeasured: false, records }, null, 2));
        });
      });
    }
  }
}
