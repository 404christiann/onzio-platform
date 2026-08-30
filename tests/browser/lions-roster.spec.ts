import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = process.env.LIONS_ROSTER_BASE_URL ?? "http://lions.localhost:3002";
const screenshotDir = process.env.LIONS_ROSTER_SCREENSHOT_DIR;

async function verifyRoster(
  page: Page,
  testInfo: TestInfo,
  viewportName: "desktop" | "mobile",
) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${baseURL}/roster`, { waitUntil: "networkidle" });

  const playerCards = page.locator('[data-clubhouse-roster-player-card="true"]');
  const staffCards = page.locator(".staff-card");
  await expect(playerCards).toHaveCount(32);
  await expect(staffCards).toHaveCount(6);

  const playerFlags = playerCards.locator('[role="img"][aria-label$=" flag"]');
  const staffFlags = staffCards.locator('[role="img"][aria-label$=" flag"]');
  await expect(playerFlags).toHaveCount(32);
  await expect(staffFlags).toHaveCount(6);
  await expect(playerFlags.first()).toHaveClass(/fi-us/);
  await expect(staffFlags.first()).toHaveClass(/fi-us/);

  for (const flags of [playerFlags, staffFlags]) {
    const count = await flags.count();
    for (let index = 0; index < count; index += 1) {
      await expect
        .poll(() =>
          flags.nth(index).evaluate((element) => {
            const styles = window.getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            return {
              backgroundImage: styles.backgroundImage,
              height: bounds.height,
              width: bounds.width,
            };
          }),
        )
        .toMatchObject({
          backgroundImage: expect.stringContaining("url("),
          height: expect.any(Number),
          width: expect.any(Number),
        });
    }
  }

  await expect(playerCards.locator("a, button")).toHaveCount(0);
  await expect(staffCards.locator("a, button")).toHaveCount(0);
  await expect(page.locator('a[href^="/roster/"]')).toHaveCount(0);

  const rosterURL = page.url();
  await playerCards.first().click();
  await staffCards.first().click();
  expect(page.url()).toBe(rosterURL);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.locator('[data-roster-modal-image="true"]')).toHaveCount(0);

  const health = await page.evaluate(() => {
    const imageSources = Array.from(document.images).map(
      (image) => image.currentSrc || image.src,
    );
    const resourceURLs = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name);
    const brokenImages = Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth <= 0)
      .map((image) => image.currentSrc || image.src);
    return {
      brokenImages,
      forbiddenURLs: [...imageSources, ...resourceURLs].filter(
        (url) =>
          url.includes("ydvggllbrswfchgjhjhr") ||
          url.includes("/storage/v1/render/image/") ||
          url.includes("/_next/image"),
      ),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hasErrorOverlay: Boolean(
        document.querySelector(
          "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
        ),
      ),
    };
  });

  expect(health).toEqual({
    brokenImages: [],
    forbiddenURLs: [],
    horizontalOverflow: 0,
    hasErrorOverlay: false,
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const screenshotPath = screenshotDir
    ? resolve(
        screenshotDir,
        `lions-roster-final-${viewportName}.png`,
      )
    : testInfo.outputPath("lions-roster-final.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

test.describe("Lions roster desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("shows flags without interactive profile cards", async ({ page }, testInfo) => {
    await verifyRoster(page, testInfo, "desktop");
  });
});

test.describe("Lions roster mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test("shows flags without interactive profile cards", async ({ page }, testInfo) => {
    await verifyRoster(page, testInfo, "mobile");
  });
});
