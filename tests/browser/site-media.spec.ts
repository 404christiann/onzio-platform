import { expect, test, type Page } from "@playwright/test";

const PUBLIC_ROUTES = [
  "/",
  "/roster",
  "/schedule",
  "/shop",
  "/club/about",
  "/club/logo",
] as const;

const FAILURE_ROUTES = ["/", "/roster", "/shop", "/club/about"] as const;

async function scrollThroughPage(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let lastHeight = 0;
      const step = Math.max(320, Math.floor(window.innerHeight * 0.75));
      const timer = window.setInterval(() => {
        window.scrollBy(0, step);
        const height = document.documentElement.scrollHeight;
        if (window.scrollY + window.innerHeight >= height && height === lastHeight) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        lastHeight = height;
      }, 80);
    });
  });
}

async function expectHealthyMedia(
  page: Page,
  route: string,
  selector = "img[data-critical-image='true']",
) {
  const images = page.locator(selector).filter({ visible: true });
  await expect
    .poll(() => images.count(), {
      message: `Expected ${route} to render at least one critical image.`,
    })
    .toBeGreaterThan(0);

  await expect
    .poll(
      () =>
        images.evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                !(element instanceof HTMLImageElement) ||
                !element.complete ||
                element.naturalWidth <= 0 ||
                element.currentSrc.includes("/_next/image") ||
                element.currentSrc.includes("/storage/v1/render/image/"),
            )
            .map((element) => {
              const image = element as HTMLImageElement;
              return {
                alt: image.alt,
                attempt: image.dataset.imageDeliveryAttempt ?? null,
                complete: image.complete,
                currentSrc: image.currentSrc,
                naturalWidth: image.naturalWidth,
              };
            }),
        ),
      {
        message: `Expected every critical image on ${route} to load directly.`,
      },
    )
    .toEqual([]);

  await expect(page.locator("[data-image-fallback='true']")).toHaveCount(0);
}

test("every public route renders direct healthy images", async ({ page }) => {
  for (const route of PUBLIC_ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await scrollThroughPage(page);
    await expectHealthyMedia(page, route);
  }

  await page.goto("/roster", { waitUntil: "domcontentloaded" });
  const playerCard = page.locator("[data-roster-player-card='true']").first();
  await expect(playerCard).toBeVisible();
  await playerCard.click();
  await expectHealthyMedia(
    page,
    "/roster player modal",
    "img[data-roster-modal-image='true']",
  );
});

test("source failures render deliberate fallbacks without broken-image chrome", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "simulated image origin outage",
      });
      return;
    }
    await route.continue();
  });

  for (const route of FAILURE_ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await scrollThroughPage(page);

    await expect
      .poll(
        () => page.locator("[data-image-fallback='true']").count(),
        {
          message: `Expected ${route} to show a deliberate image fallback.`,
        },
      )
      .toBeGreaterThan(0);

    await expect
      .poll(
        () =>
          page.locator("img").evaluateAll((elements) =>
            elements.every(
              (element) =>
                element instanceof HTMLImageElement &&
                (!element.complete || element.naturalWidth > 0),
            ),
          ),
        {
          message: `Expected ${route} to remove failed image elements.`,
        },
      )
      .toBe(true);
  }
});
