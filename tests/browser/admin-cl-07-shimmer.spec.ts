import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-07/browser");
const fixture = "/tests/browser/fixtures/admin-cl-07/";
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
const themes = ["light", "dark"] as const;
let server: ViteDevServer | undefined;
let origin: string;

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo,
    configFile: false,
    envDir: false,
    publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: { "@": repo } },
    oxc: { jsx: { runtime: "automatic" } },
    server: { host: "127.0.0.1", port: 0, ws: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await server?.close();
});

function rows(title: string) {
  return Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    title: index === 0 ? title : `Team update ${index + 1}`,
    detail: `Updated by the club · ${index + 1}`,
  }));
}

async function openFixture(page: Page, theme: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Classic admin shimmer" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return errors;
}

async function delayData(page: Page, mode: string, duration: number, title: string) {
  await page.route("**/cl07-data?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== mode) {
      await route.fallback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, duration));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows(title)) });
  });
}

async function phaseEvents(page: Page) {
  await page.evaluate(() => {
    const region = document.querySelector("[data-admin-loading-region]")!;
    const events: { phase: string | null; time: number; duration: string | null; skeletonDuration: string | null }[] = [];
    (window as Window & { __cl07Events?: typeof events }).__cl07Events = events;
    const clicks: { label: string; time: number }[] = [];
    (window as Window & { __cl07Clicks?: typeof clicks }).__cl07Clicks = clicks;
    document.addEventListener("click", (event) => {
      const button = (event.target as Element).closest("button");
      if (button) clicks.push({ label: button.textContent?.trim() ?? "", time: performance.now() });
    }, true);
    new MutationObserver(() => {
      const phase = region.getAttribute("data-phase");
      const animated = phase === "refresh-reveal"
        ? region.querySelector("[data-admin-refresh-text]")
        : region.querySelector("[data-admin-content-layer]");
      const skeleton = region.querySelector("[data-admin-skeleton-layer]");
      events.push({
        phase,
        time: performance.now(),
        duration: animated ? getComputedStyle(animated).animationDuration : null,
        skeletonDuration: skeleton ? getComputedStyle(skeleton).transitionDuration : null,
      });
    }).observe(region, { attributes: true, attributeFilter: ["data-phase"] });
  });
}

async function recordedPhases(page: Page) {
  return page.evaluate(() =>
    (window as Window & { __cl07Events?: { phase: string | null; time: number; duration: string | null; skeletonDuration: string | null }[] }).__cl07Events ?? [],
  );
}

async function recordedClicks(page: Page) {
  return page.evaluate(() =>
    (window as Window & { __cl07Clicks?: { label: string; time: number }[] }).__cl07Clicks ?? [],
  );
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("hides a 100 ms request without showing a skeleton", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await delayData(page, "fast", 100, "Fast season standings");
        await phaseEvents(page);
        const region = page.locator("[data-admin-loading-region]");
        const footerBefore = await page.locator("[data-footer]").boundingBox();
        await page.getByRole("button", { name: "Load in 100 ms" }).click();
        await expect(region).toHaveAttribute("data-phase", "waiting");
        await expect(region.locator("[data-admin-skeleton-layer]")).toHaveCount(0);
        await expect(page.getByText("Fast season standings")).toBeVisible();
        await expect(region).toHaveAttribute("data-phase", "content");
        const events = await recordedPhases(page);
        expect(events.map((event) => event.phase)).not.toContain("skeleton");
        const footerAfter = await page.locator("[data-footer]").boundingBox();
        expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      });

      test("holds the 400 ms skeleton, crossfades, and leaves no shimmer running", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await delayData(page, "slow", 400, "Slow season standings");
        await phaseEvents(page);
        const region = page.locator("[data-admin-loading-region]");
        const footer = page.locator("[data-footer]");
        const footerBefore = await footer.boundingBox();
        await page.getByRole("button", { name: "Load in 400 ms" }).click();
        await expect(page.getByRole("heading", { name: "Classic admin shimmer" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Quiet refresh" })).toBeVisible();
        await expect(region).toHaveAttribute("aria-busy", "true");
        await expect(region).toHaveAttribute("data-phase", "skeleton");
        await expect(region.locator("[data-skeleton-row]")).toHaveCount(6);
        const skeletonRow = await region.locator("[data-skeleton-row]").first().boundingBox();
        expect(skeletonRow?.height).toBeCloseTo(64, 0);
        await expect(region.locator("[data-admin-shimmer]").first()).toHaveCSS("height", "36px");
        await page.screenshot({ path: resolve(evidence, `shimmer-${viewport.width}-${theme}-loading.png`) });
        const shimmer = region.locator("[data-admin-shimmer]").first();
        expect(await shimmer.evaluate((element) => getComputedStyle(element, "::after").animationDuration)).toBe("1.6s");
        const footerDuring = await footer.boundingBox();
        expect(Math.abs(footerDuring!.y - footerBefore!.y)).toBeLessThanOrEqual(1);
        await expect(page.getByText("Slow season standings")).toBeVisible();
        await expect(region).toHaveAttribute("data-phase", "content");
        const realRow = await region.locator("[data-real-row]").first().boundingBox();
        expect(realRow?.height).toBeCloseTo(skeletonRow!.height, 0);
        const events = await recordedPhases(page);
        const shown = events.find((event) => event.phase === "skeleton")?.time;
        const crossfade = events.find((event) => event.phase === "crossfade")?.time;
        const content = events.find((event) => event.phase === "content")?.time;
        expect(shown).toBeDefined();
        const started = (await recordedClicks(page)).find((click) => click.label === "Load in 400 ms")?.time;
        expect(started).toBeDefined();
        expect(shown! - started!).toBeGreaterThanOrEqual(140);
        expect(crossfade! - shown!).toBeGreaterThanOrEqual(340);
        expect(content! - crossfade!).toBeGreaterThanOrEqual(145);
        expect(events.find((event) => event.phase === "crossfade")?.duration).toBe("0.16s");
        const footerAfter = await footer.boundingBox();
        expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.getAnimations().some((animation) =>
          animation.playState === "running" &&
          (animation.effect as KeyframeEffect | null)?.getTiming().iterations === Infinity,
        ))).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          await page.evaluate(() => document.documentElement.clientWidth),
        );
        await page.screenshot({ path: resolve(evidence, `shimmer-${viewport.width}-${theme}.png`) });
        expect(errors).toEqual([]);
      });

      test("keeps the skeleton visible when another request starts during its hold", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await delayData(page, "medium", 200, "First response");
        await delayData(page, "slow", 400, "Latest response");
        await phaseEvents(page);
        const region = page.locator("[data-admin-loading-region]");
        const firstResponse = page.waitForResponse((response) =>
          new URL(response.url()).searchParams.get("mode") === "medium",
        );
        await page.getByRole("button", { name: "Load in 200 ms" }).click();
        await expect(region).toHaveAttribute("data-phase", "skeleton");
        await firstResponse;
        await page.waitForTimeout(30);
        await expect(region).toHaveAttribute("data-phase", "skeleton");
        await expect(region).toHaveAttribute("aria-busy", "true");

        await page.getByRole("button", { name: "Load in 400 ms" }).click();
        const secondClick = (await recordedClicks(page)).findLast((click) => click.label === "Load in 400 ms")!.time;
        await expect(region).toHaveAttribute("data-phase", "skeleton");
        await expect(region.locator("[data-admin-skeleton-layer]")).toHaveCount(1);
        await page.waitForTimeout(170);
        const phasesAfterSecondClick = (await recordedPhases(page))
          .filter((event) => event.time >= secondClick)
          .map((event) => event.phase);
        expect(phasesAfterSecondClick).not.toContain("waiting");
        await expect(page.getByText("Latest response")).toBeVisible();
        await expect(region).toHaveAttribute("data-phase", "content");
        await expect(region).toHaveAttribute("aria-busy", "false");
        expect(errors).toEqual([]);
      });

      test("restores the visible skeleton when another request starts during crossfade", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await delayData(page, "medium", 200, "First response");
        await delayData(page, "slow", 400, "Latest response");
        await phaseEvents(page);
        const region = page.locator("[data-admin-loading-region]");
        await page.evaluate(() => {
          const region = document.querySelector("[data-admin-loading-region]")!;
          const button = [...document.querySelectorAll("button")]
            .find((item) => item.textContent?.trim() === "Load in 400 ms")!;
          const observer = new MutationObserver(() => {
            if (region.getAttribute("data-phase") !== "crossfade") return;
            observer.disconnect();
            button.click();
          });
          observer.observe(region, { attributes: true, attributeFilter: ["data-phase"] });
        });
        await page.getByRole("button", { name: "Load in 200 ms" }).click();
        await expect.poll(async () =>
          (await recordedClicks(page)).filter((click) => click.label === "Load in 400 ms").length,
        ).toBe(1);
        const secondClick = (await recordedClicks(page)).findLast((click) => click.label === "Load in 400 ms")!.time;
        await expect(region).toHaveAttribute("data-phase", "skeleton");
        await expect(region.locator("[data-admin-skeleton-layer]")).toHaveCount(1);
        await expect(region.locator("[data-admin-skeleton-layer]")).toHaveCSS("opacity", "1");
        await expect(region).toHaveAttribute("aria-busy", "true");
        const phasesAfterSecondClick = (await recordedPhases(page))
          .filter((event) => event.time >= secondClick)
          .map((event) => event.phase);
        expect(phasesAfterSecondClick).not.toContain("waiting");
        await expect(page.getByText("Latest response")).toBeVisible();
        await expect(region).toHaveAttribute("data-phase", "content");
        expect(errors).toEqual([]);
      });

      test("keeps old rows during a quiet refresh and fades changed text", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await delayData(page, "refresh", 400, "Refreshed season standings");
        await phaseEvents(page);
        const region = page.locator("[data-admin-loading-region]");
        await page.getByRole("button", { name: "Quiet refresh" }).click();
        await expect(region).toHaveAttribute("data-phase", "refreshing");
        await expect(region).toHaveAttribute("aria-busy", "true");
        await expect(page.getByText("Season standings", { exact: true })).toBeVisible();
        await expect(region.locator("[data-admin-skeleton-layer]")).toHaveCount(0);
        await expect(page.getByText("Refreshed season standings")).toBeVisible();
        await expect(region).toHaveAttribute("data-phase", "content");
        const events = await recordedPhases(page);
        expect(events.map((event) => event.phase)).toContain("refresh-reveal");
        expect(events.find((event) => event.phase === "refresh-reveal")?.duration).toBe("0.2s");
        await expect(region.locator("[data-real-row]")).toHaveCount(6);
        expect(errors).toEqual([]);
      });
    });
  }
}

test("reduced motion uses static shimmer blocks and a 120 ms fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await openFixture(page, "light");
  await delayData(page, "slow", 400, "Reduced motion standings");
  await phaseEvents(page);
  const region = page.locator("[data-admin-loading-region]");
  await page.getByRole("button", { name: "Load in 400 ms" }).click();
  await expect(region).toHaveAttribute("data-phase", "skeleton");
  const shimmer = region.locator("[data-admin-shimmer]").first();
  expect(await shimmer.evaluate((element) => getComputedStyle(element, "::after").animationName)).toBe("none");
  await expect(page.getByText("Reduced motion standings")).toBeVisible();
  await expect(region).toHaveAttribute("data-phase", "content");
  const events = await recordedPhases(page);
  expect(events.find((event) => event.phase === "crossfade")?.duration).toBe("0.12s");
  expect(events.find((event) => event.phase === "crossfade")?.skeletonDuration).toBe("0.12s");
  expect(errors).toEqual([]);
});

