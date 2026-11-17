import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-05/browser");
const fixture = "/tests/browser/fixtures/admin-cl-05/";
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
  await expect(page.getByRole("heading", { name: "Classic admin unsaved guard" })).toBeVisible();
  return errors;
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("clean navigation bypasses the guard", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("link", { name: "Roster" }).click();
        await expect(page.getByLabel("Current page")).toHaveText("Roster");
        await expect(page.getByRole("dialog", { name: "Save your changes first?" })).toHaveCount(0);
        expect(errors).toEqual([]);
      });

      test("saving holds the ring, then navigates with clean content", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("textbox", { name: "Sponsor name" }).fill("Edited sponsor");
        const opener = page.getByRole("link", { name: "Roster" });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
        const primary = dialog.getByRole("button", { name: "Save and leave" });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("homepage carousel sponsor logos");
        await expect(dialog).toContainText("Leaving for Roster");
        await expect(primary).toBeFocused();
        await expect.poll(() => dialog.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
        expect((await dialog.boundingBox())?.width).toBeCloseTo(viewport.width === 390 ? 390 : 540, 0);
        await page.screenshot({ path: resolve(evidence, `guard-${viewport.width}-${theme}.png`) });
        const started = Date.now();
        await primary.click();
        await expect(dialog.getByRole("button", { name: "Saving…" })).toHaveAttribute("aria-busy", "true");
        const ring = dialog.locator("[data-admin-pending-ring]");
        await expect(ring).toHaveCSS("width", "15px");
        await expect(ring).toHaveCSS("animation-duration", "0.45s");
        await expect(page.getByLabel("Current page")).toHaveText("Roster");
        expect(Date.now() - started).toBeGreaterThanOrEqual(650);
        await expect(page.getByLabel("Dirty")).toHaveText("false");
        await expect(page.getByLabel("Save count")).toHaveText("1");
        expect(errors).toEqual([]);
      });

      test("discard navigates and keep editing, Escape, and backdrop return focus", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const input = page.getByRole("textbox", { name: "Sponsor name" });
        const opener = page.getByRole("link", { name: "Schedule" });
        await input.fill("Changed");
        for (const dismiss of ["Keep editing", "Escape", "Backdrop"]) {
          await opener.click();
          const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
          await expect(dialog).toBeVisible();
          if (dismiss === "Keep editing") await dialog.getByRole("button", { name: "Keep editing" }).click();
          else if (dismiss === "Escape") await page.keyboard.press("Escape");
          else await page.locator('[data-slot="admin-dialog-backdrop"]').click({ position: { x: 2, y: 2 } });
          await expect(dialog).not.toBeVisible();
          await expect(opener).toBeFocused();
          await expect(page.getByLabel("Current page")).toHaveText("Sponsors");
          await expect(page.getByLabel("Dirty")).toHaveText("true");
        }
        await opener.click();
        await page.getByRole("dialog", { name: "Save your changes first?" })
          .getByRole("button", { name: "Discard changes" }).click();
        await expect(page.getByLabel("Current page")).toHaveText("Schedule");
        await expect(page.getByLabel("Dirty")).toHaveText("false");
        await expect(page.getByLabel("Discard count")).toHaveText("1");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(errors).toEqual([]);
      });

      test("keeps CSV export native while an editor is dirty", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("textbox", { name: "Sponsor name" }).fill("Changed");
        await page.getByRole("link", { name: "Export CSV" }).click();
        await expect(page.getByLabel("Native export count")).toHaveText("1");
        await expect(page.getByRole("dialog", { name: "Save your changes first?" })).toHaveCount(0);
        await expect(page.getByLabel("Current page")).toHaveText("Sponsors");
        await expect(page.getByLabel("Dirty")).toHaveText("true");
        expect(errors).toEqual([]);
      });

      test("guards Sign out and keeps the session after a failed save", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("textbox", { name: "Sponsor name" }).fill("Changed");
        await page.getByRole("checkbox", { name: "Fail save" }).check();
        const signOut = page.getByRole("button", { name: "Sign out" });
        await signOut.click();
        const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
        await expect(dialog).toContainText("Leaving for Sign in");
        await expect(dialog.getByRole("button", { name: "Save and leave" })).toBeFocused();
        await dialog.getByRole("button", { name: "Save and leave" }).click();
        await expect(dialog.getByRole("alert")).toContainText("could not be saved");
        await expect(page.getByLabel("Sign out count")).toHaveText("0");
        await expect(page.getByLabel("Dirty")).toHaveText("true");
        await dialog.getByRole("button", { name: "Keep editing" }).click();
        await expect(signOut).toBeFocused();
        await signOut.click();
        await dialog.getByRole("button", { name: "Discard changes" }).click();
        await expect(page.getByLabel("Sign out count")).toHaveText("1");
        expect(errors).toEqual([]);
      });

      test("programmatic switches use the same guard and failed saves stay put", async ({ page }) => {
        const errors = await openFixture(page, theme);
        await page.getByRole("textbox", { name: "Sponsor name" }).fill("Changed");
        await page.getByRole("checkbox", { name: "Fail save" }).check();
        const opener = page.getByRole("button", { name: "Switch placement" });
        await opener.click();
        const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
        await expect(dialog).toContainText("Switching to Footer logos");
        await dialog.getByRole("button", { name: "Save and switch" }).click();
        await expect(dialog.getByRole("alert")).toContainText("could not be saved");
        await expect(page.getByLabel("Current page")).toHaveText("Sponsors");
        await dialog.getByRole("button", { name: "Keep editing" }).click();
        await expect(opener).toBeFocused();
        expect(errors).toEqual([]);
      });
    });
  }
}

test("reduced motion keeps the pending ring still and fades the dialog", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await openFixture(page, "light");
  await page.getByRole("textbox", { name: "Sponsor name" }).fill("Changed");
  await page.getByRole("link", { name: "Roster" }).click();
  const dialog = page.getByRole("dialog", { name: "Save your changes first?" });
  await expect(dialog).toHaveCSS("transition-duration", "0.12s, 0s");
  await dialog.getByRole("button", { name: "Save and leave" }).click();
  await expect(dialog.locator("[data-admin-pending-ring]")).toHaveCSS("animation-name", "none");
  expect(errors).toEqual([]);
});

