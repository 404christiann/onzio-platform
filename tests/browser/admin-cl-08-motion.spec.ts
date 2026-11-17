import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-08/browser");
const fixture = "/tests/browser/fixtures/admin-cl-08/";
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

async function openFixture(page: Page, theme: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Classic admin motion primitives" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return errors;
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("bars reveal with capped stagger, then update in place", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const bars = page.locator("[data-admin-bar]");
        const fills = page.locator("[data-admin-bar-fill]");
        await expect(bars).toHaveCount(8);
        await page.getByRole("button", { name: "Replay bars" }).click();
        const delays = await fills.evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).transitionDelay),
        );
        expect(delays).toEqual(["0s", "0.04s", "0.08s", "0.12s", "0.16s", "0.2s", "0.2s", "0.2s"]);
        await expect.poll(() => fills.first().getAttribute("data-first-reveal")).toBe("false");
        const widths = await bars.evaluateAll((elements) => elements.map((element) => element.clientWidth));
        const before = await fills.first().evaluate((element) => getComputedStyle(element).transform);
        await page.getByRole("button", { name: "Update values" }).click();
        await expect.poll(() =>
          fills.first().evaluate((element) => getComputedStyle(element).transform),
        ).not.toBe(before);
        const runningProperties = await fills.first().evaluate((element) =>
          element.getAnimations().flatMap((animation) =>
            animation.effect instanceof KeyframeEffect
              ? animation.effect.getKeyframes().flatMap((frame) =>
                Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key))
              )
              : [],
          ),
        );
        expect(runningProperties).toContain("transform");
        expect(runningProperties.every((property) => ["transform", "opacity"].includes(property))).toBe(true);
        const properties = await fills.first().evaluate((element) => {
          const style = getComputedStyle(element);
          return { property: style.transitionProperty, duration: style.transitionDuration, delay: style.transitionDelay };
        });
        expect(properties.property.split(", ")).toEqual(["transform", "opacity"]);
        expect(properties.duration).toBe("0.3s, 0.3s");
        expect(properties.delay).toBe("0s");
        expect(await bars.evaluateAll((elements) => elements.map((element) => element.clientWidth))).toEqual(widths);
        await expect(bars.first()).toHaveAttribute("aria-valuenow", "9");
        await page.waitForTimeout(350);
        await page.screenshot({ path: resolve(evidence, `bars-${viewport.width}-${theme}.png`) });
        expect(errors).toEqual([]);
      });

      test("tab underline slides while keyboard selection and panels stay exact", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const players = page.getByRole("tab", { name: "Players 12" });
        const staff = page.getByRole("tab", { name: "Staff 3" });
        const unavailable = page.getByRole("tab", { name: "Unavailable" });
        const indicator = page.locator("[data-admin-tab-indicator]");
        await expect(indicator).toHaveAttribute("data-ready", "true");
        await expect(players).toHaveAttribute("aria-controls", "fixture-roster-panel-players");
        await expect(unavailable).toBeDisabled();
        await players.focus();
        await players.press("ArrowRight");
        await expect(staff).toBeFocused();
        await expect(staff).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel", { name: "Staff 3" })).toHaveText("Staff panel");
        await expect(page.getByRole("tabpanel", { name: "Players 12" })).toBeHidden();
        const transition = await indicator.evaluate((element) => {
          const style = getComputedStyle(element);
          const animated = element.getAnimations().flatMap((animation) =>
            animation.effect instanceof KeyframeEffect
              ? animation.effect.getKeyframes().flatMap((frame) =>
                Object.keys(frame).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key))
              )
              : [],
          );
          return { property: style.transitionProperty, duration: style.transitionDuration, animated };
        });
        expect(transition.property).toBe("transform");
        expect(transition.duration).toBe("0.22s");
        expect(transition.animated).toContain("transform");
        expect(transition.animated.every((property) => property === "transform")).toBe(true);
        await page.waitForTimeout(260);
        const aligned = await indicator.evaluate((element) => {
          const tab = document.getElementById("fixture-roster-tab-staff")!;
          const line = element.getBoundingClientRect();
          const target = tab.getBoundingClientRect();
          return { left: Math.abs(line.left - target.left), width: Math.abs(line.width - target.width) };
        });
        expect(aligned.left).toBeLessThanOrEqual(1.5);
        expect(aligned.width).toBeLessThanOrEqual(1.5);
        await staff.press("Home");
        await expect(players).toBeFocused();
        await players.press("End");
        await expect(staff).toBeFocused();
        await page.screenshot({ path: resolve(evidence, `tabs-${viewport.width}-${theme}.png`) });
        expect(errors).toEqual([]);
      });

      test("accordion collapses with inert body and returns focus to trigger", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const trigger = page.getByRole("button", { name: "Forwards" });
        const body = page.locator("[data-admin-accordion-body]");
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        await expect(body).not.toHaveAttribute("inert");
        const duration = await body.evaluate((element) => getComputedStyle(element).transitionDuration);
        expect(duration).toBe("0.2s");
        await trigger.click();
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
        await expect(body).toHaveAttribute("inert");
        await expect(page.getByRole("button", { name: "Edit a forward" })).toHaveCount(0);
        await expect.poll(() => body.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
        const collapsedArrow = await trigger.locator("svg").evaluate((element) => getComputedStyle(element).transform);
        expect(collapsedArrow).not.toBe("none");
        await trigger.click();
        await expect(body).not.toHaveAttribute("inert");
        await page.getByRole("button", { name: "Edit a forward" }).focus();
        await trigger.evaluate((element) => {
          if (element instanceof HTMLButtonElement) element.click();
        });
        await expect(trigger).toBeFocused();
        expect(errors).toEqual([]);
      });
    });
  }
}

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, contextOptions: { reducedMotion: "reduce" } });

  test("bars fade, tab underline snaps, and accordion snaps", async ({ page }) => {
    const errors = await openFixture(page, "dark");
    const fill = page.locator("[data-admin-bar-fill]").first();
    const indicator = page.locator("[data-admin-tab-indicator]");
    const body = page.locator("[data-admin-accordion-body]");
    await expect(indicator).toHaveAttribute("data-ready", "true");
    const barTransition = await fill.evaluate((element) => {
      const style = getComputedStyle(element);
      return { property: style.transitionProperty, duration: style.transitionDuration };
    });
    expect(barTransition).toEqual({ property: "opacity", duration: "0.12s" });
    await page.getByRole("tab", { name: "Staff 3" }).click();
    await expect(indicator).toHaveCSS("transition-duration", "0s");
    await page.getByRole("button", { name: "Forwards" }).click();
    await expect(body).toHaveCSS("transition-duration", "0s");
    expect(errors).toEqual([]);
  });
});


const longTabLabel = "PlayersWithAnExtremelyLongUnbreakableLabelThatMustRemainAccessible";
const longTabBadge = "12345678901234567890";

for (const theme of themes) {
  test(`long tab labels stay within the page and keep their accessible names in ${theme}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto(`${origin}${fixture}?theme=${theme}&longTabs=1`);
    expect(response?.status()).toBe(200);

    const players = page.getByRole("tab", { name: `${longTabLabel} ${longTabBadge}` });
    const staff = page.getByRole("tab", { name: "Staff 3" });
    const indicator = page.locator("[data-admin-tab-indicator]");
    await expect(players).toBeVisible();
    await expect(players).toHaveAccessibleName(`${longTabLabel} ${longTabBadge}`);
    await expect(indicator).toHaveAttribute("data-ready", "true");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
        const bounds = tabs.map((tab) => tab.getBoundingClientRect());
        const labels = tabs.map((tab) => tab.querySelector<HTMLElement>("span")!.getBoundingClientRect());
        const list = document.querySelector<HTMLElement>('[role="tablist"]')!.getBoundingClientRect();
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          listRight: list.right,
          tabs: bounds.map((box) => ({ left: box.left, right: box.right })),
          labels: labels.map((box) => ({ left: box.left, right: box.right })),
        };
      });
      expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.listRight).toBeLessThanOrEqual(layout.viewportWidth);
      for (let index = 0; index < layout.tabs.length; index += 1) {
        expect(layout.labels[index].left).toBeGreaterThanOrEqual(layout.tabs[index].left);
        expect(layout.labels[index].right).toBeLessThanOrEqual(layout.tabs[index].right + 1);
        if (index > 0) expect(layout.tabs[index - 1].right).toBeLessThanOrEqual(layout.tabs[index].left + 1);
      }

      await players.focus();
      await players.press("ArrowRight");
      await expect(staff).toBeFocused();
      await expect(staff).toHaveAttribute("aria-selected", "true");
      await page.waitForTimeout(260);
      const alignment = await indicator.evaluate((element) => {
        const selected = document.getElementById("fixture-roster-tab-staff")!;
        const line = element.getBoundingClientRect();
        const tab = selected.getBoundingClientRect();
        return { left: Math.abs(line.left - tab.left), width: Math.abs(line.width - tab.width) };
      });
      expect(alignment.left).toBeLessThanOrEqual(1.5);
      expect(alignment.width).toBeLessThanOrEqual(1.5);
      await staff.press("Home");
      await expect(players).toBeFocused();
      await page.waitForTimeout(260);
    }

    await page.screenshot({ path: resolve(evidence, `tabs-long-320-${theme}.png`) });
    expect(errors).toEqual([]);
  });
}
