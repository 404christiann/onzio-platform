import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-03/browser");
const fixture = "/tests/browser/fixtures/admin-cl-03/";
const themes = [
  { name: "light", green: "rgb(52, 199, 89)" },
  { name: "dark", green: "rgb(48, 209, 88)" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
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

async function openFixture(page: Page, theme: string, options = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}${options}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Classic admin save" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return {
    errors,
    button: page.locator("[data-admin-save-button]"),
    input: page.getByRole("textbox", { name: "Club short name" }),
    status: page.locator("[data-admin-save-status]"),
    attempts: page.getByLabel("Save attempts"),
    announcement: page.locator("[data-admin-save-announcement]"),
  };
}

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

function layoutWidth(button: Locator) {
  return button.evaluate((element) => {
    if (!(element instanceof HTMLButtonElement)) throw new Error("Expected a native save button");
    return element.offsetWidth;
  });
}

async function assertWhiteAndBackground(button: Locator, background: string) {
  await expect(button).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(button).toHaveCSS("background-color", background);
}

async function themeColor(button: Locator, property: string) {
  return button.evaluate((element, token) => {
    const sample = document.createElement("span");
    sample.style.color = `hsl(var(${token}))`;
    element.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  }, property);
}

for (const viewport of viewports) {
  for (const { name, green } of themes) {
    test.describe(`${viewport.width}px ${name}`, () => {
      test.use({ viewport });

      test("shows every save state with stable width and aligned status", async ({ page }) => {
        const { button, input, status, attempts, announcement, errors } = await openFixture(page, name);
        const prefix = resolve(evidence, `save-${viewport.width}-${name}`);
        const idleLabel = button.locator('[data-admin-save-label="idle"]');
        const check = button.locator("[data-admin-save-check]");
        const blue = await themeColor(button, "--primary");
        const gray = await themeColor(button, "--secondary");
        const width = await layoutWidth(button);
        expect(width).toBeGreaterThanOrEqual(150);
        await expect(button).toHaveAccessibleName("Save changes");
        await expect(button).toHaveCSS("background-color", gray);
        await expect(status).toBeEmpty();
        await expect(announcement).toBeEmpty();
        await button.focus();
        await expect(button).toBeFocused();
        await expect(button).toBeDisabled();
        await button.press("Enter");
        await expect(attempts).toHaveText("0");
        await page.screenshot({ path: `${prefix}-clean.png` });

        await input.fill("Diverse City");
        await expect(button).toBeEnabled();
        await expect(status).toHaveText("Unsaved changes");
        await expect(announcement).toBeEmpty();
        await assertWhiteAndBackground(button, blue);
        await expect(idleLabel).toHaveCSS("transition-duration", "0.14s");
        const transition = await button.evaluate((element) => {
          const { transitionProperty, transitionDuration } = getComputedStyle(element);
          const properties = transitionProperty.split(", ");
          const durations = transitionDuration.split(", ");
          return Object.fromEntries(properties.map((property, index) => [property, durations[index % durations.length]]));
        });
        for (const property of ["background-color", "color", "border-color"]) {
          expect(transition[property]).toBe("0.22s");
        }
        const statusBounds = await box(status);
        const buttonBounds = await box(button);
        expect(Math.abs(statusBounds.y + statusBounds.height / 2 - buttonBounds.y - buttonBounds.height / 2)).toBeLessThanOrEqual(1.5);
        expect(statusBounds.x + statusBounds.width).toBeLessThanOrEqual(buttonBounds.x);
        expect(await layoutWidth(button)).toBe(width);
        await page.screenshot({ path: `${prefix}-dirty.png` });

        await button.press("Enter");
        await expect(button).toHaveAccessibleName("Saving…");
        await expect(announcement).toHaveAttribute("role", "status");
        await expect(announcement).toHaveText("Saving…");
        await expect(button).toHaveAttribute("aria-busy", "true");
        await expect(button).toHaveAttribute("aria-disabled", "true");
        await expect(button).not.toHaveAttribute("disabled");
        await expect(button).toBeFocused();
        await button.press("Space");
        await expect(attempts).toHaveText("1");
        expect(await layoutWidth(button)).toBe(width);
        await expect(button.locator('[data-admin-save-label="saving"]')).toHaveCSS("opacity", "1");
        await page.screenshot({ path: `${prefix}-saving.png` });

        await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
        await expect(button).toHaveAccessibleName("Saved");
        await expect(announcement).toHaveText("Saved");
        await expect(button).toBeFocused();
        await expect(button).toHaveAttribute("aria-disabled", "true");
        await expect(button).not.toHaveAttribute("disabled");
        await expect(button).toHaveCSS("animation-duration", "0.32s");
        await expect(check).toHaveCSS("animation-duration", "0.28s");
        await expect(check).toHaveCSS("animation-delay", "0.08s");
        await assertWhiteAndBackground(button, green);
        expect(await layoutWidth(button)).toBe(width);
        await page.screenshot({ path: `${prefix}-saved.png`, animations: "disabled" });
        expect(errors).toEqual([]);
      });
    });
  }
}

for (const { name, green } of themes) {
  test.describe(`390px ${name} reduced motion`, () => {
    test.use({ viewport: viewports[0] });

    test("centers the stacked footer and shows a static check", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const { button, input, status, errors } = await openFixture(page, name, "&stack");
      await input.fill("Diverse City");
      await expect(status).toHaveText("Unsaved changes");
      const statusBounds = await box(status);
      const buttonBounds = await box(button);
      const cancelBounds = await box(page.getByRole("button", { name: "Cancel" }));
      expect(Math.abs(statusBounds.x + statusBounds.width / 2 - buttonBounds.x - buttonBounds.width / 2)).toBeLessThanOrEqual(1.5);
      expect(statusBounds.y + statusBounds.height).toBeLessThanOrEqual(buttonBounds.y);
      expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(cancelBounds.y);
      await page.screenshot({ path: resolve(evidence, `save-390-${name}-stacked.png`) });
      await button.press("Enter");
      await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
      await expect(button).toHaveAccessibleName("Saved");
      await assertWhiteAndBackground(button, green);
      await expect(button).toHaveCSS("animation-name", "none");
      const check = button.locator("[data-admin-save-check]");
      await expect(check).toHaveCSS("animation-name", "none");
      await expect(check).toHaveCSS("clip-path", "none");
      await expect(button.locator('[data-admin-save-label="saved"]')).toHaveCSS("transition-duration", "0.12s");
      expect(errors).toEqual([]);
    });
  });
}

test("returns to clean after confirmation, restarts immediately on edit, and supports retry", async ({ page }) => {
  await page.clock.install();
  const { button, input, attempts, errors } = await openFixture(page, "light");
  await input.fill("Diverse City");
  await button.press("Enter");
  await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
  await page.clock.runFor(400);
  await expect(button).toHaveAccessibleName("Saved");
  await page.clock.runFor(1900);
  await expect(button).toHaveAccessibleName("Save changes");
  await expect(button).toHaveAttribute("data-state", "clean");

  await input.fill("Diverse City United");
  await button.press("Enter");
  await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
  await page.clock.runFor(400);
  await expect(button).toHaveAccessibleName("Saved");
  await input.fill("Diverse City Academy");
  await expect(button).toBeEnabled();
  await page.clock.runFor(1900);
  await expect(button).toBeEnabled();
  await button.press("Enter");
  await page.getByRole("button", { name: "Reject save" }).dispatchEvent("click");
  await expect(page.getByRole("alert")).toHaveText("Could not save.");
  await page.clock.runFor(400);
  await expect(button).toBeEnabled();
  await expect(attempts).toHaveText("3");

  await button.press("Enter");
  await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
  await page.clock.runFor(400);
  await expect(button).toHaveAccessibleName("Saved");
  await expect(page.getByLabel("Persisted short name")).toHaveText("Diverse City Academy");
  await expect(attempts).toHaveText("4");
  expect(errors).toEqual([]);
});

test("retains edits made during an in-flight save", async ({ page }) => {
  await page.clock.install();
  const { button, input, status, errors } = await openFixture(page, "light");
  await input.fill("Diverse City");
  await button.press("Enter");
  await expect(button).toHaveAccessibleName("Saving…");
  await input.fill("Diverse City Academy");
  await page.clock.runFor(500);
  await expect(button).toHaveAccessibleName("Saving…");
  await page.getByRole("button", { name: "Resolve save" }).dispatchEvent("click");
  await expect(page.getByLabel("Persisted short name")).toHaveText("Diverse City");
  await expect(input).toHaveValue("Diverse City Academy");
  await expect(button).toBeEnabled();
  await expect(status).toHaveText("Unsaved changes");
  expect(errors).toEqual([]);
});

test("fits unstacked save actions with an optional button on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const { button, input, status, errors } = await openFixture(page, "light", "&cancel");
  await input.fill("Diverse City");
  await expect(status).toHaveText("Unsaved changes");
  const cancel = page.getByRole("button", { name: "Cancel" });
  const section = await box(page.getByRole("region", { name: "Club details" }));
  for (const action of [status, button, cancel]) {
    const bounds = await box(action);
    expect(bounds.x).toBeGreaterThanOrEqual(section.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(section.x + section.width);
  }
  expect(errors).toEqual([]);
});
