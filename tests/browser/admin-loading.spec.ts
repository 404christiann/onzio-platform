import { expect, test } from "@playwright/test";

const routes = [
  "about", "analytics", "contact", "homepage", "programs", "registrations",
  "schedule", "season-stats", "seasons", "shop", "sponsors", "standings", "tryouts",
];

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop-dark", width: 1440, height: 900 },
  { name: "mobile-dark", width: 390, height: 844 },
]) {
  test(`${viewport.name}: each page keeps section placeholders during slow data and reveals content`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    if (viewport.name.includes("dark")) {
      await page.context().addCookies([{ name: "onzio-admin-theme", value: "dark", domain: "alpha.localhost", path: "/admin" }]);
    }
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    for (const routeName of routes) {
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      // Only delay real page-data reads; auth, navigation and server responses remain real.
      const handler = async (route: import("@playwright/test").Route) => {
        const request = route.request();
        if (request.method() === "POST") await held;
        await route.continue();
      };
      await page.route("**/api/admin/data", handler);
      await page.route("**/rest/v1/**", async route => { await held; await route.continue(); });
      try {
        await page.goto(`/admin/${routeName}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
        // The old overlay escalated after 400ms; placeholders must persist beyond that.
        await page.waitForTimeout(550);
        await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
        expect(await page.locator('svg [class*="admin-mark-pulse"]').count()).toBe(0);
        expect(await page.locator('[role="status"][aria-label^="Loading"]').count()).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${routeName}-${viewport.name}-loading.png`), fullPage: true });
        release();
        await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${routeName}-${viewport.name}-loaded.png`), fullPage: true });
      } finally {
        release();
        await page.unroute("**/api/admin/data", handler);
        await page.unroute("**/rest/v1/**");
      }
    }
    expect(pageErrors).toEqual([]);
  });
}

test("reduced motion disables skeleton animation and navigation remains available while loading", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/data", async route => { await held; await route.continue(); });
  try {
    await page.goto("/admin/schedule", { waitUntil: "domcontentloaded" });
    const placeholder = page.locator('[data-slot="skeleton"]').first();
    await expect(placeholder).toBeVisible();
    expect(await placeholder.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
    await expect(page.getByRole("button", { name: "Add Match" })).toBeDisabled();
    await page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
  } finally { release(); }
});
