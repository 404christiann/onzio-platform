import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-02/browser");
const fixture = "/tests/browser/fixtures/admin-cl-02/";
const viewports = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
const themes = [
  { name: "light", green: "rgb(52, 199, 89)" },
  { name: "dark", green: "rgb(48, 209, 88)" },
];
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
  await expect(page.getByRole("heading", { name: "Classic admin controls" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return errors;
}

for (const viewport of viewports) {
  for (const { name, green } of themes) {
    test.describe(`${viewport.width}px ${name}`, () => {
      test.use({ viewport });

      test("keyboard Switch states and a stable pending action", async ({ page }) => {
        const errors = await openFixture(page, name);
        const off = page.getByRole("switch", { name: "Registration open" });
        const on = page.getByRole("switch", { name: "Show team photos" });
        const disabled = page.getByRole("switch", { name: "Show standings" });
        const thumb = off.locator("span[aria-hidden=true]");
        await expect(off).not.toBeChecked();
        await expect(on).toBeChecked();
        await expect(on).toHaveCSS("background-color", green);
        await expect(disabled).toBeDisabled();
        await expect(disabled).not.toBeChecked();
        await expect(disabled).toHaveAccessibleDescription("Public roster setting. Add a season first.");
        await expect(page.getByText("Add a season first.")).toBeVisible();
        await expect(off).toHaveCSS("width", "46px");
        await expect(off).toHaveCSS("height", "28px");
        await expect(off).toHaveCSS("transition-duration", "0.18s, 0.18s");
        await expect(thumb).toHaveCSS("width", "20px");
        await expect(thumb).toHaveCSS("background-color", "rgb(255, 255, 255)");
        await expect(thumb).toHaveCSS("transition-duration", "0.18s");

        await page.keyboard.press("Tab");
        await expect(off).toBeFocused();
        await page.keyboard.press("Space");
        await expect(off).toBeChecked();
        await expect(off).toHaveCSS("background-color", green);
        await expect(thumb).toHaveCSS("transform", "matrix(1, 0, 0, 1, 18, 0)");
        await page.keyboard.press("Enter");
        await expect(off).not.toBeChecked();
        await expect(thumb).toHaveCSS("transform", "none");
        await page.keyboard.press("Tab");
        await expect(on).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(disabled).toBeFocused();
        await page.keyboard.press("Space");
        await page.keyboard.press("Enter");
        await disabled.click({ force: true });
        await expect(disabled).not.toBeChecked();
        await expect(off).not.toBeChecked();

        const preview = page.getByRole("button", { name: "Preview", exact: true });
        const activations = page.getByLabel("Activations");
        const submissions = page.getByLabel("Submissions");
        await expect(preview).toHaveAttribute("type", "button");
        await preview.click();
        await expect(submissions).toHaveText("Submissions 0");
        const idle = page.getByRole("button", { name: "Send", exact: true });
        const ring = page.locator("[data-admin-pending-ring]").first();
        await expect(ring).toHaveCSS("animation-name", "none");
        const idleWidth = await idle.evaluate((button) => button.getBoundingClientRect().width);
        await idle.press("Enter");

        const busy = page.getByRole("button", { name: "Sending reminders…", exact: true });
        const busyLabel = busy.locator('[data-admin-pending-label="pending"]');
        await expect(busy).toBeFocused();
        await expect(busy).toBeDisabled();
        await expect(busy).toHaveAttribute("aria-busy", "true");
        await expect(busy).not.toHaveAttribute("disabled");
        await expect(idle).toHaveCount(0);
        await expect(busyLabel).toHaveCSS("opacity", "1");
        await expect(busyLabel).toHaveCSS("transition-duration", "0.12s");
        expect(await busy.evaluate((button) => button.getBoundingClientRect().width)).toBe(idleWidth);
        await expect(ring).toHaveCSS("width", "15px");
        await expect(ring).toHaveCSS("height", "15px");
        await expect(ring).toHaveCSS("animation-duration", "0.45s");
        await expect(ring).toHaveCSS("animation-iteration-count", "infinite");
        await expect(ring).toHaveCSS("animation-timing-function", "linear");
        await expect.poll(() => ring.evaluate((element) => element.getAnimations().length)).toBe(1);

        await busy.click({ force: true });
        await busy.press("Enter");
        await busy.press("Space");
        await page.getByRole("textbox", { name: "Reminder title" }).press("Enter");
        await expect(activations).toHaveText("Activations 1");
        await expect(submissions).toHaveText("Submissions 1");
        await busy.focus();
        await expect(busy).toBeFocused();
        await page.screenshot({ path: resolve(evidence, `controls-${viewport.width}-${name}.png`), animations: "disabled" });

        await page.getByRole("button", { name: "Resolve" }).dispatchEvent("click");
        await expect(idle).toBeFocused();
        await expect(idle).toBeEnabled();
        await expect(idle).not.toHaveAttribute("aria-busy", "true");
        await expect(ring).toHaveCSS("animation-name", "none");
        expect(await idle.evaluate((button) => button.getBoundingClientRect().width)).toBe(idleWidth);
        expect(errors).toEqual([]);
      });
    });
  }
}

for (const { name, green } of themes) {
  test.describe(`${name} reduced motion`, () => {
    test.use({ viewport: viewports[0] });

    test("fades switch color and leaves the pending ring static", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors = await openFixture(page, name);
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      const control = page.getByRole("switch", { name: "Registration open" });
      const thumb = control.locator("span[aria-hidden=true]");
      const trackFill = () => control.evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return { opacity: style.opacity, color: style.backgroundColor, duration: style.transitionDuration };
      });
      await expect.poll(trackFill).toEqual({ opacity: "0", color: green, duration: "0.12s" });
      await control.press("Space");
      await expect(control).toBeChecked();
      await expect(thumb).toHaveCSS("transition-duration", "0s");
      await expect(thumb).toHaveCSS("transform", "matrix(1, 0, 0, 1, 18, 0)");
      await expect.poll(trackFill).toEqual({ opacity: "1", color: green, duration: "0.12s" });

      await page.getByRole("button", { name: "Send", exact: true }).press("Enter");
      const busy = page.getByRole("button", { name: "Sending reminders…", exact: true });
      const ring = busy.locator("[data-admin-pending-ring]");
      await expect(busy).toBeFocused();
      await expect(busy).toHaveAttribute("aria-busy", "true");
      await expect(ring).toBeVisible();
      await expect(ring).toHaveCSS("width", "15px");
      await expect(ring).toHaveCSS("animation-name", "none");
      expect(await ring.evaluate((element) => element.getAnimations())).toHaveLength(0);
      expect(errors).toEqual([]);
    });
  });
}
