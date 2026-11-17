import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-04/browser");
const fixture = "/tests/browser/fixtures/admin-cl-04/";
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
const widths = { sm: 440, md: 540, lg: 640, xl: 860 } as const;
const sizes = Object.keys(widths) as (keyof typeof widths)[];
const themes = ["light", "dark"] as const;
const longTitle = "Edit the full registration details for Diverse City Football Academy";
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

async function openFixture(page: Page, theme: "light" | "dark" = "light") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Classic admin dialogs" })).toBeVisible();
  return errors;
}

function slot(scope: Page | Locator, name: string) {
  return scope.locator(`[data-slot="admin-dialog${name ? `-${name}` : ""}"]`);
}

async function box(locator: Locator) {
  const bounds = await locator.boundingBox();
  if (!bounds) throw new Error("Expected the element to have layout");
  return bounds;
}

async function transitionMilliseconds(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const properties = style.transitionProperty.split(", ");
    const durations = style.transitionDuration.split(", ");
    return Object.fromEntries(properties.map((property, index) => [
      property,
      Number.parseFloat(durations[index % durations.length]) * 1000,
    ]));
  });
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("audits all four dialog sizes, fields, scrolling, and footer layout", async ({ page }) => {
        const errors = await openFixture(page, theme);
        const mobile = viewport.width === 390;
        for (const size of sizes) {
          const trigger = page.getByRole("button", { name: `Open ${size}`, exact: true });
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: longTitle });
          const close = dialog.getByRole("button", { name: "Close", exact: true });
          const header = slot(dialog, "header");
          const body = slot(dialog, "body");
          const footer = slot(dialog, "footer");
          await expect(dialog.getByRole("textbox", { name: "Club name", exact: true })).toBeFocused();
          await expect(page.locator('.admin-portal [role="dialog"]')).toHaveCount(1);
          await expect(dialog).toHaveCSS("opacity", "1");
          await expect.poll(() => dialog.evaluate((element) =>
            element.getAnimations().some((animation) => animation.playState === "running"),
          )).toBe(false);
          const panel = await box(dialog);
          expect(panel.width).toBeCloseTo(mobile ? viewport.width : widths[size], 0);
          if (mobile) expect(panel.y + panel.height).toBeCloseTo(viewport.height, 0);
          else {
            expect(panel.x + panel.width / 2).toBeCloseTo(viewport.width / 2, 0);
            expect(panel.y + panel.height / 2).toBeCloseTo(viewport.height / 2, 0);
          }

          const title = dialog.getByRole("heading", { name: longTitle });
          const titleBounds = await box(title);
          const closeBounds = await box(close);
          expect(titleBounds.x + titleBounds.width).toBeLessThanOrEqual(closeBounds.x);
          await expect(title).toHaveCSS("font-size", "17px");
          const section = dialog.getByRole("heading", { name: "Registration details", exact: true });
          await expect(section).toHaveCSS("font-size", "12px");
          await expect(section).toHaveCSS("text-transform", "uppercase");
          const heading = await box(header);
          const actions = await box(footer);
          const bodyBounds = await box(body);
          expect(heading.y + heading.height).toBeLessThanOrEqual(bodyBounds.y + 1);
          expect(bodyBounds.y + bodyBounds.height).toBeLessThanOrEqual(actions.y + 1);
          expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
          expect(await body.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
            await body.evaluate((element) => element.clientWidth + 1),
          );
          await expect(body).toHaveCSS("padding", "4px 20px 20px");
          expect(await dialog.evaluate((element) => element.scrollHeight)).toBeLessThanOrEqual(
            await dialog.evaluate((element) => element.clientHeight + 1),
          );

          const inputs = await body.getByRole("textbox").all();
          expect(inputs).toHaveLength(24);
          const first = await box(inputs[0]);
          const second = await box(inputs[1]);
          const third = await box(inputs[2]);
          for (const input of inputs) {
            const field = await box(input);
            expect(field.width).toBeGreaterThanOrEqual(mobile ? 120 : 160);
          }
          if (mobile) {
            expect(first.x).toBeCloseTo(second.x, 0);
            expect(second.y).toBeGreaterThan(first.y);
          } else {
            expect(first.y).toBeCloseTo(second.y, 0);
            expect(second.x - first.x - first.width).toBeCloseTo(16, 0);
            expect(third.x).toBeCloseTo(first.x, 0);
            expect(third.y).toBeGreaterThan(first.y);
          }

          const save = await box(footer.getByRole("button", { name: "Save changes" }));
          const cancel = await box(footer.getByRole("button", { name: "Cancel" }));
          if (mobile) {
            expect(save.width).toBeCloseTo(cancel.width, 0);
            expect(save.height).toBeGreaterThanOrEqual(44);
            expect(cancel.height).toBeGreaterThanOrEqual(44);
            expect(save.y + save.height).toBeLessThanOrEqual(cancel.y);
          } else {
            expect(cancel.x + cancel.width).toBeLessThanOrEqual(save.x);
            const rightPadding = await footer.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingRight));
            expect(save.x + save.width + rightPadding).toBeCloseTo(actions.x + actions.width, 0);
          }
          if (size === "xl") {
            const remove = await box(footer.getByRole("button", { name: "Remove" }));
            if (mobile) {
              expect(remove.width).toBeCloseTo(save.width, 0);
              expect(remove.height).toBeGreaterThanOrEqual(44);
              expect(cancel.y + cancel.height).toBeLessThanOrEqual(remove.y);
            } else {
              expect(remove.x + remove.width).toBeLessThanOrEqual(cancel.x);
            }
          } else {
            const status = await box(footer.getByText("Unsaved changes"));
            const offset = mobile
              ? status.x + status.width / 2 - save.x - save.width / 2
              : status.y + status.height / 2 - save.y - save.height / 2;
            expect(Math.abs(offset)).toBeLessThanOrEqual(1.5);
            if (mobile) expect(status.y + status.height).toBeLessThanOrEqual(save.y);
          }

          await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
          expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
          expect(await box(header)).toEqual(heading);
          expect(await box(footer)).toEqual(actions);
          expect(await page.evaluate(() => window.scrollY)).toBe(0);
          await body.evaluate((element) => { element.scrollTop = 0; });
          await page.screenshot({ path: resolve(evidence, `dialog-${viewport.width}-${theme}-${size}.png`) });
          await close.click();
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
        }
        expect(errors).toEqual([]);
      });
    });
  }
}

test("traps focus and gives Escape, backdrop, close, and Cancel the same meaning", async ({ page }) => {
  const errors = await openFixture(page);
  const trigger = page.getByRole("button", { name: "Open confirmation", exact: true });
  const dialog = page.getByRole("dialog", { name: "Remove club access?" });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const confirm = dialog.getByRole("button", { name: "Remove access", exact: true });
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  const cancelCount = page.getByLabel("Cancel count");
  await trigger.click();
  await expect(dialog).toHaveAccessibleDescription("This member will lose access to the club’s admin tools.");
  await expect(cancel).toBeFocused();
  await expect(dialog).toHaveCSS("opacity", "1");
  const title = await box(dialog.getByRole("heading", { name: "Remove club access?" }));
  const closeButton = await box(close);
  expect(Math.abs(title.y + title.height / 2 - closeButton.y - closeButton.height / 2)).toBeLessThanOrEqual(1.5);
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let count = 0; count < 5; count += 1) {
      await page.keyboard.press(direction);
      await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(cancelCount).toHaveText("1");

  await trigger.click();
  await slot(page, "backdrop").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(cancelCount).toHaveText("2");

  await trigger.click();
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(cancelCount).toHaveText("3");

  await trigger.click();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(cancelCount).toHaveText("4");

  await trigger.click();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Last dialog action")).toHaveText("confirmed");
  await expect(cancelCount).toHaveText("4");
  expect(errors).toEqual([]);
});

test("follows the visual footer order on phone and desktop without remounting actions", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  const errors = await openFixture(page);
  await page.getByRole("button", { name: "Open xl", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: longTitle });
  const footer = slot(dialog, "footer");
  const save = footer.getByRole("button", { name: "Save changes" });
  const cancel = footer.getByRole("button", { name: "Cancel" });
  const remove = footer.getByRole("button", { name: "Remove" });

  await save.focus();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(remove).toBeFocused();

  await page.setViewportSize(viewports[1]);
  await expect(remove).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  expect(errors).toEqual([]);
});

test("blocks busy dismissal and action attempts, and supports explicit dismissal", async ({ page }) => {
  const errors = await openFixture(page);
  await page.getByRole("button", { name: "Open busy confirmation" }).click();
  const busy = page.getByRole("dialog", { name: "Remove club access?" });
  await expect(busy).toBeVisible();
  for (const name of ["Close", "Cancel", "Remove access"]) {
    const button = busy.getByRole("button", { name, exact: true });
    await expect(button).toBeDisabled();
    await button.dispatchEvent("click");
  }
  await page.keyboard.press("Escape");
  await slot(page, "backdrop").click({ position: { x: 5, y: 5 } });
  await expect(busy).toBeVisible();
  await expect(page.getByLabel("Last dialog action")).toHaveText("none");
  await expect(page.getByLabel("Cancel count")).toHaveText("0");

  await page.reload();
  const trigger = page.getByRole("button", { name: "Open explicit close" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Explicit close" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await slot(page, "backdrop").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Cancel count")).toHaveText("0");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

for (const viewport of viewports) {
  test.describe(`${viewport.width}px motion`, () => {
    test.use({ viewport });

    test("uses the approved entry and exit durations for the dialog and backdrop", async ({ page }) => {
      const errors = await openFixture(page);
      const mobile = viewport.width === 390;
      await page.getByRole("button", { name: "Open md", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: longTitle });
      const backdrop = slot(page, "backdrop");
      await expect(dialog).toHaveCSS("opacity", "1");
      const entering = await transitionMilliseconds(dialog);
      expect(entering.opacity ?? entering.transform).toBe(mobile ? 240 : 140);
      expect(entering.transform).toBe(mobile ? 240 : 140);
      expect((await transitionMilliseconds(backdrop)).opacity).toBe(mobile ? 240 : 140);

      const exit = await dialog.evaluate((element) => {
        const background = document.querySelector('[data-slot="admin-dialog-backdrop"]');
        const dismiss = element.querySelector<HTMLButtonElement>('[data-slot="admin-dialog-close"]');
        if (!dismiss || !background) throw new Error("Expected a close button and backdrop");
        dismiss.click();
        return new Promise<{ popup: string; backdrop: string; mounted: boolean }>((done) => {
          requestAnimationFrame(() => done({
            popup: getComputedStyle(element).transitionDuration,
            backdrop: getComputedStyle(background).transitionDuration,
            mounted: element.isConnected,
          }));
        });
      });
      expect(exit.mounted).toBe(true);
      expect(exit.popup.split(", ")).toContain(mobile ? "0.16s" : "0.09s");
      expect(exit.backdrop.split(", ")).toContain(mobile ? "0.16s" : "0.09s");
      await expect(dialog).toBeHidden();
      expect(errors).toEqual([]);
    });

    test("reduces the dialog and backdrop to a 120ms fade", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors = await openFixture(page, "dark");
      await page.getByRole("button", { name: "Open md", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: longTitle });
      await expect(dialog).toBeVisible();
      const transition = await transitionMilliseconds(dialog);
      expect(transition.opacity).toBe(120);
      expect(transition.transform ?? 0).toBe(0);
      expect((await transitionMilliseconds(slot(page, "backdrop"))).opacity).toBe(120);
      expect(errors).toEqual([]);
    });
  });
}

test("reverses a moving sheet from its current position", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  const errors = await openFixture(page);
  const trigger = page.getByRole("button", { name: "Open md", exact: true });
  const movement = await trigger.evaluate(async (element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Expected the open button");

    async function movingSheet() {
      const deadline = performance.now() + 1000;
      while (performance.now() < deadline) {
        await new Promise<void>((frame) => { requestAnimationFrame(() => frame()); });
        const panel = document.querySelector<HTMLElement>('[data-slot="admin-dialog"]');
        const animation = panel?.getAnimations().find((item) =>
          item instanceof CSSTransition && item.transitionProperty === "transform",
        );
        const currentTime = animation?.currentTime;
        const duration = animation?.effect?.getComputedTiming().duration;
        if (panel && animation && typeof currentTime === "number" && typeof duration === "number" && currentTime < duration) {
          animation.currentTime = duration / 2;
          return panel;
        }
      }
      throw new Error("Expected a running transform transition");
    }

    element.click();
    const panel = await movingSheet();
    const close = panel.querySelector<HTMLButtonElement>('[data-slot="admin-dialog-close"]');
    if (!close) throw new Error("Expected the close button");
    const openingPosition = panel.getBoundingClientRect().y;
    close.click();
    const exiting = await movingSheet();
    const closingPosition = exiting.getBoundingClientRect().y;
    const inertDuringExit = exiting.inert;
    element.click();
    const reopened = await movingSheet();
    return {
      keptPanel: panel === exiting && panel === reopened,
      inertDuringExit,
      openingPosition,
      closingPosition,
      reopeningPosition: reopened.getBoundingClientRect().y,
      panelHeight: panel.offsetHeight,
    };
  });

  expect(movement.keptPanel).toBe(true);
  expect(movement.inertDuringExit).toBe(true);
  expect(movement.closingPosition).toBeGreaterThan(movement.openingPosition);
  expect(movement.closingPosition - movement.openingPosition).toBeLessThan(movement.panelHeight);
  expect(movement.reopeningPosition).toBeLessThan(movement.closingPosition);
  expect(movement.closingPosition - movement.reopeningPosition).toBeLessThan(movement.panelHeight);
  await expect(page.getByRole("dialog", { name: longTitle })).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps the mobile sheet and footer inside a shrinking visual viewport", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  const errors = await openFixture(page);
  await page.getByRole("button", { name: "Open xl", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: longTitle });
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect.poll(() => dialog.evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running"),
  )).toBe(false);

  await page.evaluate(() => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error("Expected Chromium VisualViewport");
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 480 },
      offsetTop: { configurable: true, value: 60 },
    });
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
  });
  const footer = slot(dialog, "footer");
  await expect.poll(async () => {
    const bounds = await box(dialog);
    return bounds.y + bounds.height;
  }).toBeLessThanOrEqual(541);
  expect((await box(dialog)).y).toBeGreaterThanOrEqual(59);
  const actions = await box(footer);
  expect(actions.y + actions.height).toBeLessThanOrEqual(541);
  await expect(dialog.getByRole("textbox", { name: "Club name", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("preserves the legacy AdminModal portal and dismissal", async ({ page }) => {
  const errors = await openFixture(page);
  const trigger = page.getByRole("button", { name: "Open legacy modal" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Legacy modal" });
  await expect(dialog.getByRole("button", { name: "Dismiss legacy modal" })).toBeFocused();
  await expect(page.locator('.admin-portal [role="dialog"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Cancel count")).toHaveText("1");
  expect(errors).toEqual([]);
});
