import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-06/browser");
const fixture = "/tests/browser/fixtures/admin-cl-06/";
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
  await expect(page.getByRole("heading", { name: "Classic admin animated list" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return errors;
}

function toast(page: Page, message: string) {
  return page.locator("[data-admin-toast-region] [role=status]").filter({ hasText: message });
}

async function height(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected element bounds");
  return box.height;
}

async function animationDetails(locator: Locator) {
  return locator.evaluate((element) => element.getAnimations().map((animation) => {
    const effect = animation.effect as KeyframeEffect;
    return { duration: effect.getTiming().duration, keyframes: effect.getKeyframes() };
  }));
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("removes from flow while the row drifts and following rows move", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const list = page.locator("[data-admin-animated-list]");
        const priorHeight = await height(list);
        const priorSam = await page.locator('[data-player="sam"]').boundingBox();
        await page.getByRole("button", { name: "Remove Jordan Lee" }).click();
        const ghost = page.locator('[data-admin-list-leaving="jordan"]');
        await expect(ghost).toHaveCSS("position", "absolute");
        await expect(ghost).toHaveCSS("pointer-events", "none");
        await expect(ghost).toHaveAttribute("aria-hidden", "true");
        await expect(ghost).toHaveAttribute("inert", "");
        await expect(page.getByLabel("Player count")).toHaveText("3");
        expect(priorHeight - await height(list)).toBeCloseTo(76, 0);

        const sam = page.locator('[data-player="sam"]');
        const moving = await animationDetails(sam);
        expect(moving.some((animation) => animation.duration === 240 &&
          animation.keyframes.some((frame) => String(frame.transform).startsWith("translateY(")))).toBe(true);
        const leaving = await animationDetails(ghost);
        expect(leaving.some((animation) => animation.duration === 160 &&
          animation.keyframes.some((frame) => frame.transform === "translateX(-24px)"))).toBe(true);
        const currentSam = await sam.boundingBox();
        expect(currentSam!.y).toBeGreaterThan(priorSam!.y - 76);
        expect(currentSam!.y).toBeLessThanOrEqual(priorSam!.y + 0.5);
        await expect(ghost).toHaveCount(0);
        await expect.poll(async () => (await sam.boundingBox())?.y).toBeCloseTo(priorSam!.y - 76, 0);

        const notice = toast(page, "Removed Jordan Lee");
        await expect(notice).toBeVisible();
        await expect(notice).toHaveCSS("transition-duration", "0.2s, 0.2s");
        const listBox = await list.boundingBox();
        const toastBox = await notice.boundingBox();
        expect(toastBox!.y).toBeGreaterThanOrEqual(listBox!.y + listBox!.height);
        await page.screenshot({ path: resolve(evidence, `list-${viewport.width}-${theme}.png`) });
        expect(errors).toEqual([]);
      });

      test("Undo restores the row in place and moves following rows down", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("button", { name: "Remove Jordan Lee" }).click();
        await page.locator('[data-admin-list-leaving="jordan"]').waitFor({ state: "detached" });
        const sam = page.locator('[data-player="sam"]');
        const priorSam = await sam.boundingBox();
        await toast(page, "Removed Jordan Lee").getByRole("button", { name: "Undo: Removed Jordan Lee" }).click();
        const jordan = page.locator('[data-player="jordan"]');
        await expect(jordan).toBeVisible();
        await expect(page.getByLabel("Player count")).toHaveText("4");
        const adding = await animationDetails(jordan);
        expect(adding.some((animation) => animation.duration === 180 &&
          animation.keyframes.some((frame) => Number(frame.opacity) === 0))).toBe(true);
        const moving = await animationDetails(sam);
        expect(moving.some((animation) => animation.duration === 240)).toBe(true);
        await expect.poll(async () => (await sam.boundingBox())?.y).toBeCloseTo(priorSam!.y + 76, 0);
        await expect(toast(page, "Removed Jordan Lee")).toHaveCount(0);
        expect(await page.locator("[data-admin-animated-list] > [data-admin-animated-key]")
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-admin-animated-key"))))
          .toEqual(["maya", "jordan", "sam", "ava"]);
        expect(errors).toEqual([]);
      });

      test("adds a row with a fade and reorders with FLIP", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const maya = page.locator('[data-player="maya"]');
        await page.getByRole("button", { name: "Add player" }).click();
        const added = page.locator('[data-player="new-1"]');
        await expect(added).toBeVisible();
        await expect(page.getByLabel("Player count")).toHaveText("5");
        expect((await animationDetails(added)).some((animation) =>
          animation.duration === 180 &&
          animation.keyframes.some((frame) => Number(frame.opacity) === 0),
        )).toBe(true);
        expect((await animationDetails(maya)).some((animation) => animation.duration === 240)).toBe(true);
        await page.getByRole("button", { name: "Reverse order" }).click();
        await expect(page.locator("[data-admin-animated-list] > [data-admin-animated-key]").first())
          .toHaveAttribute("data-admin-animated-key", "ava");
        expect((await animationDetails(maya)).some((animation) => animation.duration === 240)).toBe(true);
        expect(errors).toEqual([]);
      });

      test("handles two removals independently and ignores a leaving row", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const overlappingGhosts = await page.evaluate(() => {
          document.querySelector<HTMLButtonElement>('[aria-label="Remove Jordan Lee"]')?.click();
          document.querySelector<HTMLButtonElement>('[aria-label="Remove Sam Okafor"]')?.click();
          return [...document.querySelectorAll("[data-admin-list-leaving]")]
            .map((row) => row.getAttribute("data-admin-list-leaving"));
        });
        expect(overlappingGhosts).toEqual(["jordan", "sam"]);
        const ghost = page.locator('[data-admin-list-leaving="jordan"]');
        await ghost.getByRole("button", { name: "Remove Jordan Lee", includeHidden: true }).dispatchEvent("click");
        await expect(page.getByLabel("Player count")).toHaveText("2");
        await expect(toast(page, "Removed Jordan Lee")).toBeVisible();
        await expect(toast(page, "Removed Sam Okafor")).toBeVisible();
        await toast(page, "Removed Sam Okafor").getByRole("button", { name: "Undo: Removed Sam Okafor" }).click();
        await toast(page, "Removed Jordan Lee").getByRole("button", { name: "Undo: Removed Jordan Lee" }).click();
        await expect(page.getByLabel("Player count")).toHaveText("4");
        expect(await page.locator("[data-admin-animated-list] > [data-admin-animated-key]")
          .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-admin-animated-key"))))
          .toEqual(["maya", "jordan", "sam", "ava"]);
        expect(errors).toEqual([]);
      });
    });
  }
}

test("positions a leaving row after the list element is replaced", async ({ page }) => {
  const errors = await openFixture(page, "light");
  const list = page.locator("[data-admin-animated-list]");
  await expect(list).toHaveCSS("position", "static");
  await page.getByRole("button", { name: "Remove Jordan Lee" }).click();
  await expect(list).toHaveCSS("position", "relative");
  await page.locator('[data-admin-list-leaving="jordan"]').waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Replace list element" }).click();
  await expect(list).toHaveCSS("position", "static");

  const result = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('[data-player="sam"]');
    if (!row) throw new Error("Sam row is missing");
    const before = row.getBoundingClientRect();
    row.querySelector<HTMLButtonElement>("button")?.click();
    const ghost = document.querySelector<HTMLElement>('[data-admin-list-leaving="sam"]');
    const list = document.querySelector<HTMLElement>("[data-admin-animated-list]");
    if (!ghost || !list) throw new Error("Leaving row or list is missing");
    const after = ghost.getBoundingClientRect();
    return {
      beforeY: before.y,
      afterY: after.y,
      beforeX: before.x,
      afterX: after.x,
      position: getComputedStyle(list).position,
    };
  });
  expect(result.position).toBe("relative");
  expect(Math.abs(result.afterY - result.beforeY)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.afterX - result.beforeX)).toBeLessThanOrEqual(24);
  expect(errors).toEqual([]);
});

test.describe("toast lifetime and reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, contextOptions: { reducedMotion: "reduce" } });

  test("keeps a long name and its Undo toast inside the phone viewport", async ({ page }) => {
    const errors = await openFixture(page, "dark");
    await page.getByRole("button", { name: "Add long name" }).click();
    await page.locator('[data-player="long-1"] button').click();
    await expect(page.locator('[data-admin-toast-region] [role=status]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    expect(errors).toEqual([]);
  });

  test("expires after five seconds and uses fade-only motion", async ({ page }) => {
    const errors = await openFixture(page, "dark");
    await page.clock.install();
    await page.clock.pauseAt(await page.evaluate(() => Date.now()));
    await page.getByRole("button", { name: "Remove Jordan Lee" }).click();
    const ghost = page.locator('[data-admin-list-leaving="jordan"]');
    const leaving = await animationDetails(ghost);
    expect(leaving.some((animation) => animation.duration === 120 &&
      animation.keyframes.every((frame) => frame.transform === "translateX(0px)"))).toBe(true);
    expect(await animationDetails(page.locator('[data-player="sam"]'))).toEqual([]);
    const notice = toast(page, "Removed Jordan Lee");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCSS("transform", "none");
    await expect(notice).toHaveCSS("transition-duration", "0.12s");
    await page.clock.runFor(4999);
    await expect(notice).toBeVisible();
    await expect(page.getByLabel("Expired toast count")).toHaveText("0");
    await page.clock.runFor(1);
    await expect(page.getByLabel("Expired toast count")).toHaveText("1");
    await page.clock.fastForward(120);
    await expect(notice).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("finalizes pending actions once when the provider unmounts", async ({ page }) => {
    const errors = await openFixture(page, "dark");
    await page.clock.install();
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Remove Jordan Lee"]')?.click();
      document.querySelector<HTMLButtonElement>('[aria-label="Remove Sam Okafor"]')?.click();
    });
    await toast(page, "Removed Sam Okafor").getByRole("button", { name: "Undo: Removed Sam Okafor" }).click();
    await expect(page.getByLabel("Expired toast count")).toHaveText("0");
    await page.getByRole("button", { name: "Unmount toast provider" }).click();
    await expect(page.getByLabel("Expired toast count")).toHaveText("1");
    await page.clock.fastForward(6000);
    await expect(page.getByLabel("Expired toast count")).toHaveText("1");
    await page.getByRole("button", { name: "Remount toast provider" }).click();
    await expect(page.getByLabel("Expired toast count")).toHaveText("1");
    expect(errors).toEqual([]);
  });

  test("excludes leaving fields from FormData and keeps keyboard focus", async ({ page }) => {
    const errors = await openFixture(page, "dark");
    const remove = page.getByRole("button", { name: "Remove Jordan Lee" });
    await remove.focus();
    await remove.press("Enter");
    await expect(page.getByRole("button", { name: "Remove Sam Okafor" })).toBeFocused();
    const descriptions = await page.getByRole("form", { name: "Player editor" }).evaluate((form) =>
      new FormData(form as HTMLFormElement).getAll("description"),
    );
    expect(descriptions).toEqual(["maya", "sam", "ava"]);
    await expect(page.locator('[data-admin-list-leaving="jordan"] input[name="description"]')).toBeDisabled();
    expect(errors).toEqual([]);
  });
});



test("removal respects focus deliberately moved by its caller", async ({ page }) => {
  const errors = await openFixture(page, "light");
  await page.getByRole("checkbox", { name: "Preserve search focus", exact: true }).check();
  await page.getByRole("button", { name: "Remove Jordan Lee", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "List search", exact: true })).toBeFocused();
  await expect(page.getByLabel("Player count")).toHaveText("3");
  expect(errors).toEqual([]);
});

test("last-row removal retains the existing list fallback", async ({ page }) => {
  const errors = await openFixture(page, "light");
  for (const name of ["Maya Torres", "Jordan Lee", "Sam Okafor", "Ava Chen"]) {
    await page.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  }
  await expect(page.getByLabel("Player count")).toHaveText("0");
  await expect(page.locator("[data-admin-animated-list]")).toBeFocused();
  expect(errors).toEqual([]);
});
