import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-14/fix-r6-toast/browser");
let server: ViteDevServer | undefined;
let origin: string;

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"), resolve: { alias: { "@": repo } },
    oxc: { jsx: { runtime: "automatic" } },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    server: { host: "127.0.0.1", port: 0, ws: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

async function open(page: Page, fixture: string, theme: string) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  expect((await page.goto(`${origin}/tests/browser/fixtures/${fixture}/?theme=${theme}`))?.status()).toBe(200);
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
  return errors;
}
async function nativeTabTo(page: Page, target: Locator) {
  for (let count = 0; count < 40; count++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}
async function values(page: Page) {
  return page.locator("[data-value-title]").evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute("data-value-title"),
    title: (element as HTMLInputElement).value,
    description: element.closest(".aep-value-card")?.querySelector("textarea")?.value,
  })));
}
async function geometry(notice: Locator) {
  return notice.evaluate(element => {
    const message = element.querySelector("span")!, undo = element.querySelector("button")!;
    const footer = element.closest<HTMLElement>('[data-slot="admin-dialog-footer"]');
    const status = element.closest<HTMLElement>('[data-slot="admin-dialog-status"]');
    const done = footer?.querySelector<HTMLButtonElement>('button:not([aria-label])');
    const rect = (node: Element | null | undefined) => node ? JSON.parse(JSON.stringify(node.getBoundingClientRect())) : null;
    const range = document.createRange(); range.selectNodeContents(message);
    return {
      phase: element.getAttribute("data-phase"), opacity: getComputedStyle(element).opacity,
      toast: rect(element), message: rect(message), undo: rect(undo), footer: rect(footer), status: rect(status), done: rect(done),
      messageScroll: message.scrollWidth, messageClient: message.clientWidth,
      lines: range.getClientRects().length, lineHeight: parseFloat(getComputedStyle(message).lineHeight),
      text: message.textContent,
    };
  });
}

for (const width of [320, 390, 1280]) {
  for (const theme of ["light", "dark"]) {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      test.describe(`${width}px ${theme} ${reducedMotion}`, () => {
        test.use({ viewport: { width, height: 844 }, contextOptions: { reducedMotion } });

        test("About footer keeps a stable visible Undo message readable and restores exact values", async ({ page }, info) => {
          const errors = await open(page, "admin-dialog-footer", theme);
          await page.getByRole("button", { name: "Edit Values", exact: true }).click();
          const dialog = page.getByRole("dialog", { name: "Values", exact: true });
          await expect(dialog).toHaveCSS("opacity", "1");
          await expect.poll(() => dialog.evaluate(element => element.getAnimations().some(animation => animation.playState === "running"))).toBe(false);
          const original = await values(page);
          expect(original).toEqual([
            { id: "progress-id", title: "Progress", description: "Keep learning." },
            { id: "together-id", title: "Together", description: "Everyone belongs." },
          ]);
          const footer = dialog.locator('[data-slot="admin-dialog-footer"]');
          const beforeFooter = await footer.boundingBox();
          await nativeTabTo(page, page.getByRole("button", { name: "Remove value 2", exact: true }));
          await page.keyboard.press("Enter");
          const notice = dialog.locator('[role="status"]').filter({ hasText: "Removed Together" });
          await expect(notice).toHaveAttribute("data-phase", "visible");
          await expect(notice).toHaveCSS("opacity", "1");
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const visible = await geometry(notice);
          await info.attach("stable-visible-geometry", { body: JSON.stringify({ width, theme, reducedMotion, original, beforeFooter, visible }), contentType: "application/json" });
          expect(visible.phase).toBe("visible");
          expect(visible.opacity).toBe("1");
          expect(visible.text).toBe("Removed Together");
          expect(visible.message.width, "stable visible toast must reserve usable message width").toBeGreaterThan(90);
          expect(visible.messageScroll).toBeLessThanOrEqual(visible.messageClient + 1);
          expect(visible.lines).toBe(1);
          expect(visible.message.height).toBeLessThanOrEqual(visible.lineHeight + 1);
          expect(visible.undo.width).toBeLessThan(90);
          expect(visible.undo.height).toBeGreaterThanOrEqual(width <= 700 ? 44 : 20);
          expect(visible.toast.height).toBeLessThanOrEqual(64);
          expect(visible.toast.x).toBeGreaterThanOrEqual(0);
          expect(visible.toast.right).toBeLessThanOrEqual(width);
          expect(visible.footer.height - beforeFooter!.height).toBeLessThanOrEqual(90);
          expect(visible.done.height).toBeGreaterThanOrEqual(width <= 700 ? 44 : 36);
          expect(visible.done.bottom).toBeLessThanOrEqual(844);
          if (width <= 700) expect(visible.done.width).toBeCloseTo(width - 40, 0);
          const cdp = await page.context().newCDPSession(page);
          const capture = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false, captureBeyondViewport: false });
          await cdp.detach();
          await info.attach("stable-visible-viewport", { body: Buffer.from(capture.data, "base64"), contentType: "image/png" });
          const undo = page.getByRole("button", { name: "Undo: Removed Together", exact: true });
          await nativeTabTo(page, undo);
          await page.keyboard.press("Enter");
          await expect.poll(() => values(page)).toEqual(original);
          await expect(notice).toHaveCount(0);
          expect((await footer.boundingBox())!.height).toBeCloseTo(beforeFooter!.height, 0);
          await page.getByRole("button", { name: "Done", exact: true }).click();
          await expect(page.getByRole("button", { name: "Edit Values", exact: true })).toBeFocused();
          expect(errors).toEqual([]);
        });

        test("standard primary secondary and destructive phone actions keep full width and order", async ({ page }, info) => {
          const errors = await open(page, "admin-cl-04", theme);
          await page.getByRole("button", { name: "Open xl", exact: true }).click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toHaveCSS("opacity", "1");
          await expect.poll(() => dialog.evaluate(element => element.getAnimations().some(animation => animation.playState === "running"))).toBe(false);
          const footer = dialog.locator('[data-slot="admin-dialog-footer"]');
          const actions = await footer.locator("button").evaluateAll(elements => elements.map(element => ({
            text: element.querySelector('[data-admin-save-label][aria-hidden="false"]')?.textContent?.trim() ?? element.textContent, ...JSON.parse(JSON.stringify(element.getBoundingClientRect())),
          })));
          await info.attach("standard-footer-geometry", { body: JSON.stringify(actions), contentType: "application/json" });
          expect(actions).toHaveLength(3);
          if (width <= 700) {
            expect(actions.map(action => action.text)).toEqual(["Save changes", "Cancel", "Remove"]);
            for (const action of actions) {
              expect(action.width).toBeCloseTo(width - 40, 0);
              expect(action.height).toBeGreaterThanOrEqual(44);
            }
            expect(actions[0].y).toBeLessThan(actions[1].y);
            expect(actions[1].y).toBeLessThan(actions[2].y);
          } else {
            expect(actions.map(action => action.text)).toEqual(["Remove", "Cancel", "Save changes"]);
            for (const action of actions) expect(action.width).toBeLessThan(250);
          }
          await footer.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(page.getByLabel("Last dialog action")).toHaveText("cancelled");
          expect(errors).toEqual([]);
        });

        test("default photo manager Undo remains intrinsic and restores identity", async ({ page }, info) => {
          const errors = await open(page, "admin-cl-09", theme);
          const rows = page.locator('[data-admin-photo-manager="rows"]');
          await rows.getByRole("button", { name: "Remove Second", exact: true }).click();
          const notice = page.locator('[data-admin-toast-region] [role="status"]').filter({ hasText: "Removed Second" });
          await expect(notice).toHaveAttribute("data-phase", "visible");
          await expect(notice).toHaveCSS("opacity", "1");
          const visible = await geometry(notice);
          await info.attach("default-photo-toast-geometry", { body: JSON.stringify(visible), contentType: "application/json" });
          expect(visible.message.width).toBeGreaterThan(70);
          expect(visible.messageScroll).toBeLessThanOrEqual(visible.messageClient + 1);
          expect(visible.undo.width).toBeLessThan(90);
          expect(visible.toast.height).toBeLessThanOrEqual(64);
          await nativeTabTo(page, page.getByRole("button", { name: "Undo: Removed Second", exact: true }));
          await page.keyboard.press("Enter");
          await expect.poll(() => rows.locator("[data-photo-id]:not([data-admin-list-leaving])").evaluateAll(elements => elements.map(element => element.getAttribute("data-photo-id")))).toEqual(["first", "second"]);
          expect(errors).toEqual([]);
        });
      });
    }
  }
}
