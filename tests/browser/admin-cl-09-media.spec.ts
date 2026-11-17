import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";

const repo = process.cwd();
const evidence = resolve(repo, ".codex-work/admin-cl-09/browser");
const fixture = "/tests/browser/fixtures/admin-cl-09/";
async function valid(page: Page, name = "valid.png") {
  const base64 = await page.evaluate(() => document.createElement("canvas").toDataURL("image/png").split(",")[1]);
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}
let server: ViteDevServer | undefined;
let origin: string;

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: { "@": repo } },
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

async function open(page: Page, theme: string, failUpload = false) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  const response = await page.goto(`${origin}${fixture}?theme=${theme}&failUpload=${failUpload ? "1" : "0"}`);
  expect(response?.status()).toBe(200);
  try { await expect(page.getByRole("heading", { name: "Classic admin media primitives" })).toBeVisible(); } catch { throw new Error(JSON.stringify({ errors, body: await page.locator("body").innerText() })); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  return errors;
}

async function dropPng(page: Page, selector: string, count: number, repeats = 1) {
  await page.locator(selector).evaluate((element, n) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const bytes = atob(canvas.toDataURL("image/png").split(",")[1]);
    const data = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) data[i] = bytes.charCodeAt(i);
    for (let attempt = 0; attempt < n.repeats; attempt++) {
      const transfer = new DataTransfer();
      for (let i = 0; i < n.count; i++) transfer.items.add(new File([data], `drop-${attempt}-${i}.png`, { type: "image/png" }));
      element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
      element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    }
  }, { count, repeats });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("validates, uploads, removes, and returns focus through keyboard reorder", async ({ page }) => {
        const errors = await open(page, theme);
        const field = page.locator("[data-admin-image-field]");
        const input = field.locator('input[type="file"]');
        await input.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
        await expect(field.locator("[data-admin-image-error]")).toContainText("not a supported image");
        await input.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(1024 * 1024 + 1) });
        await expect(field.locator("[data-admin-image-error]")).toContainText("too large");
        await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
        await expect(field.locator("[data-admin-image-error]")).toContainText("not a readable image");
        await input.setInputFiles(await valid(page));
        await expect(field.locator("[data-admin-image-pending-ring]")).toBeVisible();
        const duration = await field.locator("[data-admin-image-pending-ring]").evaluate((element) =>
          getComputedStyle(element).animationDuration);
        expect(duration).toBe("0.45s");
        await expect(field.getByRole("button", { name: "Replace image" })).toBeVisible();
        await expect(field.locator("[data-admin-image-preview]")).toBeVisible();
        expect(await field.locator("[data-admin-image-preview]").evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0.16s");
        await expect(field.locator("[data-admin-image-pending-ring]")).toHaveCount(0);
        await field.getByRole("button", { name: "Remove" }).click();
        await expect(field.locator("[data-admin-image-initials]")).toHaveText("RC");

        const rows = page.locator('[data-admin-photo-manager="rows"]');
        await expect(rows.getByText("Slide 1")).toBeVisible();
        await expect(rows.locator('input[aria-invalid="true"]')).toHaveCount(1);
        const second = rows.getByRole("button", { name: "Move Second up" });
        await second.focus();
        await page.keyboard.press("Enter");
        await expect(rows.locator("[data-photo-id]").first()).toHaveAttribute("data-photo-id", "second");
        await expect(rows.getByRole("button", { name: "Move Second down" })).toBeFocused();
        await expect(rows.getByText("Slide 1")).toBeVisible();
        await rows.getByRole("button", { name: "Remove Second" }).click();
        await expect(rows.locator("[data-photo-id]")).toHaveCount(1);
        await page.getByRole("button", { name: /Undo: Removed Second/ }).click();
        await expect(rows.locator("[data-photo-id]")).toHaveCount(2);
        expect(errors).toEqual([]);
      });
    });
  }
}

test("drop, multi-file cap, tile cover, and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = await open(page, "dark");
  const field = page.locator("[data-admin-image-field]");
  await dropPng(page, "[data-admin-image-field] [data-admin-image-initials]", 1);
  await expect(field.locator("[data-admin-image-pending-ring]")).toBeVisible();
  expect(await field.locator("[data-admin-image-pending-ring]").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(field.getByRole("button", { name: "Replace image" })).toBeVisible();
  expect(await field.locator("[data-admin-image-preview]").evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0.12s");
  const rows = page.locator('[data-admin-photo-manager="rows"]');
  await dropPng(page, '[data-admin-photo-manager="rows"] [data-admin-animated-list]', 6);
  await expect(rows.locator("[data-admin-photo-message]")).toContainText("Only 6 photos fit. 2 were not added.");
  await expect(rows.locator("[data-admin-photo-pending]")).toHaveCount(4);
  await expect(rows.locator("[data-admin-photo-pending-ring]")).toHaveCount(4);
  expect(await rows.locator("[data-admin-photo-pending-ring]").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(rows.locator("[data-photo-id]")).toHaveCount(6);
  await expect(rows.locator("[data-admin-photo-pending]")).toHaveCount(0);
  await expect(rows.getByLabel("6 of 6 photos")).toHaveText("6/6");
  await rows.locator('[data-photo-id="first"]').dragTo(rows.locator('[data-photo-id="second"]'));
  await expect(rows.locator("[data-photo-id]").first()).toHaveAttribute("data-photo-id", "second");
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await expect(tiles.getByText("Cover")).toBeVisible();
  await expect(tiles.getByRole("button", { name: "Move Second down" })).toBeDisabled();
  expect(errors).toEqual([]);
});


for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`concurrent photo capacity ${viewport.width}px ${theme}`, () => {
      test.use({ viewport });

      test("reserves slots before two rapid drops and resolves every pending tile", async ({ page }) => {
        const errors = await open(page, theme);
        const rows = page.locator('[data-admin-photo-manager="rows"]');
        await page.evaluate(() => {
          const manager = document.querySelector('[data-admin-photo-manager="rows"]')!;
          const durations: string[] = [];
          new MutationObserver(() => {
            manager.querySelectorAll('[data-photo-id][data-success] img').forEach((image) => {
              durations.push(getComputedStyle(image).animationDuration);
            });
          }).observe(manager, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-success"] });
          (window as Window & { photoFadeDurations?: string[] }).photoFadeDurations = durations;
        });
        await dropPng(page, '[data-admin-photo-manager="rows"] [data-admin-animated-list]', 3, 2);
        await expect(rows.locator("[data-admin-photo-message]")).toContainText("Only 6 photos fit. 2 were not added.");
        await expect(rows.locator("[data-admin-photo-pending]")).toHaveCount(4);
        await expect(rows.locator("[data-admin-photo-pending-ring]")).toHaveCount(4);
        expect(await rows.locator("[data-admin-photo-pending-ring]").first().evaluate((element) => getComputedStyle(element).animationDuration)).toBe("0.45s");
        await expect(rows.locator("[data-photo-id]")).toHaveCount(6);
        expect(await page.evaluate(() => (window as Window & { photoFadeDurations?: string[] }).photoFadeDurations)).toContain("0.16s");
        await expect(rows.locator("[data-admin-photo-pending]")).toHaveCount(0);
        await expect(rows.getByLabel("6 of 6 photos")).toBeVisible();
        expect(errors).toEqual([]);
      });

      test("keeps an Undo slot while uploads fill the other slots", async ({ page }) => {
        const errors = await open(page, theme);
        const rows = page.locator('[data-admin-photo-manager="rows"]');
        await rows.getByRole("button", { name: "Remove First" }).click();
        await dropPng(page, '[data-admin-photo-manager="rows"] [data-admin-animated-list]', 5);
        await expect(rows.locator("[data-admin-photo-message]")).toContainText("Only 6 photos fit. 1 were not added.");
        await expect(rows.locator("[data-photo-id]")).toHaveCount(5);
        await page.getByRole("button", { name: /Undo: Removed First/ }).click();
        await expect(rows.locator("[data-photo-id]")).toHaveCount(6);
        await expect(rows.locator("[data-photo-id]").first()).toHaveAttribute("data-photo-id", "first");
        await expect(rows.locator("[data-photo-id]").nth(1)).toHaveAttribute("data-photo-id", "second");
        await expect(rows.locator("[data-admin-photo-message]")).not.toContainText("could not be restored");
        expect(errors).toEqual([]);
      });
    });
  }
}

test("failed upload removes its pending tile and reports the failure", async ({ page }) => {
  const errors = await open(page, "light", true);
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await dropPng(page, '[data-admin-photo-manager="tiles"] [data-admin-animated-list]', 1);
  await expect(tiles.locator("[data-admin-photo-pending]")).toHaveCount(1);
  await expect(tiles.locator("[data-admin-photo-pending-ring]")).toHaveCount(1);
  await expect(tiles.locator("[data-admin-photo-pending]")).toHaveCount(0);
  await expect(tiles.locator("[data-admin-photo-message]")).toContainText("The photos could not be uploaded. Try again.");
  await expect(tiles.locator("[data-photo-id]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("fixture revokes object URLs after replace, remove, and unmount", async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      active.delete(url);
      revoke(url);
    };
    (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls = active;
  });
  const errors = await open(page, "light");
  const field = page.locator("[data-admin-image-field]");
  const input = field.locator('input[type="file"]');
  await input.setInputFiles(await valid(page, "first.png"));
  await expect(field.getByRole("button", { name: "Replace image" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(1);
  await input.setInputFiles(await valid(page, "second.png"));
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(1);
  await field.getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(0);
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await dropPng(page, '[data-admin-photo-manager="tiles"] [data-admin-animated-list]', 1);
  await expect(tiles.locator("[data-photo-id]")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(1);
  await tiles.getByRole("button", { name: "Remove drop-0-0.png" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(0);
  await dropPng(page, '[data-admin-photo-manager="tiles"] [data-admin-animated-list]', 1);
  await expect(tiles.locator("[data-photo-id]")).toHaveCount(3);
  await page.evaluate(() => (window as Window & { unmountAdminMediaFixture?: () => void }).unmountAdminMediaFixture?.());
  await expect.poll(() => page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(0);
  expect(errors).toEqual([]);
});


test("image field accepts only the first of two immediate drops", async ({ page }) => {
  const errors = await open(page, "light");
  await dropPng(page, "[data-admin-image-field] [data-admin-image-initials]", 1, 2);
  await expect(page.locator("[data-admin-image-field] [data-admin-image-preview]")).toBeVisible();
  await expect(page.locator("[data-dirty-count]")).toHaveText("Dirty changes: 1");
  await page.waitForTimeout(700);
  await expect(page.locator("[data-dirty-count]")).toHaveText("Dirty changes: 1");
  expect(errors).toEqual([]);
});

for (const undoOrder of [["First", "Second"], ["Second", "First"]]) {
  test(`multiple Undo actions restore relative photo order: ${undoOrder.join(", ")}`, async ({ page }) => {
    const errors = await open(page, "light");
    const rows = page.locator('[data-admin-photo-manager="rows"]');
    await rows.getByRole("button", { name: "Remove First" }).click();
    await rows.getByRole("button", { name: "Remove Second" }).click();
    for (const name of undoOrder) await page.getByRole("button", { name: `Undo: Removed ${name}` }).click();
    await expect(rows.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(2);
    expect(await rows.locator("[data-photo-id]:not([data-admin-list-leaving])").evaluateAll(
      (elements) => elements.map((element) => element.getAttribute("data-photo-id"))))
      .toEqual(["first", "second"]);
    expect(errors).toEqual([]);
  });
}

test("tile reorder animates horizontal movement and settles", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await open(page, "light");
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  const first = tiles.locator('[data-photo-id="tile-first"]');
  const before = await first.evaluate((element) => element.getBoundingClientRect().left);
  const animation = await tiles.evaluate((root) => {
    (root.querySelector('[aria-label="Move Second up"]') as HTMLButtonElement).click();
    const first = root.querySelector('[data-photo-id="tile-first"]') as HTMLElement;
    return first.getAnimations().flatMap((item) => (item.effect as KeyframeEffect).getKeyframes())
      .some((frame) => String(frame.transform).includes("translateX"));
  });
  expect(animation).toBe(true);
  await expect(tiles.locator("[data-photo-id]").first()).toHaveAttribute("data-photo-id", "tile-second");
  await page.waitForTimeout(300);
  const after = await first.evaluate((element) => element.getBoundingClientRect().left);
  expect(after).toBeGreaterThan(before + 100);
  expect(errors).toEqual([]);
});

test("unmount during upload leaves no object URL", async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      active.delete(url);
      revoke(url);
    };
    (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls = active;
  });
  const errors = await open(page, "light");
  await dropPng(page, '[data-admin-photo-manager="tiles"] [data-admin-animated-list]', 1);
  await expect(page.locator('[data-admin-photo-manager="tiles"] [data-admin-photo-pending]')).toBeVisible();
  await page.evaluate(() => (window as Window & { unmountAdminMediaFixture?: () => void }).unmountAdminMediaFixture?.());
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(0);
  expect(errors).toEqual([]);
});


test("Undo keeps an intervening add and reorder", async ({ page }) => {
  const errors = await open(page, "light");
  const rows = page.locator('[data-admin-photo-manager="rows"]');
  await rows.getByRole("button", { name: "Remove First" }).click();
  await dropPng(page, '[data-admin-photo-manager="rows"] [data-admin-animated-list]', 1);
  await expect(rows.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(2);
  await rows.getByRole("button", { name: "Move drop-0-0.png up" }).click();
  await page.getByRole("button", { name: /Undo: Removed First/ }).click();
  expect(await rows.locator("[data-photo-id]:not([data-admin-list-leaving])").evaluateAll(
    (elements) => elements.map((element) => element.getAttribute("data-photo-id"))))
    .toEqual(["first", "added-1", "second"]);
  expect(errors).toEqual([]);
});

test("kit switch invalidates old Undo without changing the new collection", async ({ page }) => {
  const errors = await open(page, "light");
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await tiles.getByRole("button", { name: "Remove Second" }).click();
  await page.getByRole("button", { name: "Switch kit" }).click();
  await expect(page.locator("[data-active-kit]")).toHaveText("Kit B");
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(1);
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])").first()).toHaveAttribute("data-photo-id", "kit-b");
  await page.locator('[aria-label="Undo: Removed Second"]').evaluateAll((buttons) =>
    buttons.forEach((button) => (button as HTMLButtonElement).click()));
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(1);
  await page.getByRole("button", { name: "Switch kit" }).click();
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(1);
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])").first()).toHaveAttribute("data-photo-id", "tile-first");
  expect(errors).toEqual([]);
});

test("pending kit A upload is abandoned after switching to kit B", async ({ page }) => {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      active.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      active.delete(url);
      revoke(url);
    };
    (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls = active;
  });
  const errors = await open(page, "light");
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await dropPng(page, '[data-admin-photo-manager="tiles"] [data-admin-animated-list]', 1);
  await expect(tiles.locator("[data-admin-photo-pending]")).toHaveCount(1);
  await page.getByRole("button", { name: "Switch kit" }).click();
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(1);
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])").first()).toHaveAttribute("data-photo-id", "kit-b");
  await page.waitForTimeout(800);
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(1);
  expect(await page.evaluate(() => (window as Window & { activeFixtureUrls?: Set<string> }).activeFixtureUrls?.size)).toBe(0);
  await page.getByRole("button", { name: "Switch kit" }).click();
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("same-kit prop refresh keeps Undo active", async ({ page }) => {
  const errors = await open(page, "light");
  const tiles = page.locator('[data-admin-photo-manager="tiles"]');
  await tiles.getByRole("button", { name: "Remove Second" }).click();
  await page.getByRole("button", { name: "Refresh kit" }).click();
  await page.getByRole("button", { name: "Undo: Removed Second" }).click();
  await expect(tiles.locator("[data-photo-id]:not([data-admin-list-leaving])")).toHaveCount(2);
  expect(await tiles.locator("[data-photo-id]:not([data-admin-list-leaving])").evaluateAll(
    (elements) => elements.map((element) => element.getAttribute("data-photo-id"))))
    .toEqual(["tile-first", "tile-second"]);
  expect(errors).toEqual([]);
});
