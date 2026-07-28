import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectLoadedImages(images: Locator) {
  await expect
    .poll(() => images.count(), {
      message: "Expected the public roster to render media cards.",
    })
    .toBeGreaterThan(0);

  const count = await images.count();
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(
        () =>
          image.evaluate(
            (element) =>
              element instanceof HTMLImageElement &&
              element.complete &&
              element.naturalWidth > 0,
          ),
        {
          message: `Expected roster image ${index + 1} of ${count} to load.`,
        },
      )
      .toBe(true);
  }
}

async function forceOptimizerOutage(page: Page) {
  await page.route("**/_next/image?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const sourceUrl = requestUrl.searchParams.get("url") ?? "";

    if (sourceUrl.includes("/storage/v1/object/public/onzio-media/")) {
      await route.fulfill({
        status: 402,
        contentType: "text/plain",
        body: "OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED",
      });
      return;
    }

    await route.continue();
  });
}

test("renders every roster card when optimization is unavailable", async ({
  page,
}) => {
  await forceOptimizerOutage(page);
  await page.goto(process.env.ROSTER_MEDIA_PATH ?? "/roster", {
    waitUntil: "domcontentloaded",
  });

  const cardImages = page.locator('[data-roster-card-image="true"]');
  await expectLoadedImages(cardImages);

  const count = await cardImages.count();
  for (let index = 0; index < count; index += 1) {
    const image = cardImages.nth(index);
    await expect(image).toHaveAttribute("data-image-delivery-attempt", "raw");
    await expect
      .poll(() =>
        image.evaluate((element) =>
          element instanceof HTMLImageElement ? element.currentSrc : "",
        ),
      )
      .toContain("/storage/v1/object/public/onzio-media/");
  }

  const firstPlayerCard = page.locator(
    '[data-roster-player-card="true"]',
  ).first();
  await firstPlayerCard.click();
  await expectLoadedImages(page.locator('[data-roster-modal-image="true"]'));
});
