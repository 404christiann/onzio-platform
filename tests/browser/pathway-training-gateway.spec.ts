import { expect, test } from "@playwright/test";

test("opens the shared gateway, switches pricing, and restores its trigger", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const trigger = page
    .locator('.pathway-main a[data-pathway-training-trigger="true"]:visible')
    .first();
  await expect(trigger).toHaveAttribute("href", "/book-training");

  const originalOverflow = await page.evaluate(() => document.body.style.overflow);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Book training" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  const younger = dialog.getByRole("radio", { name: "Ages 6–10" });
  const older = dialog.getByRole("radio", { name: "Ages 11–14" });
  await expect(younger).not.toBeChecked();
  await expect(older).not.toBeChecked();
  await expect(dialog.getByRole("link", { name: /Book one session/ })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Contact the academy." })).toBeVisible();

  await younger.check();
  await expect(dialog.getByRole("heading", { name: "$50" })).toBeVisible();
  await expect(dialog.getByText("$47.50 per class", { exact: true })).toBeVisible();
  await expect(dialog.getByText("$43.75 per class", { exact: true })).toBeVisible();
  await expect(dialog.getByText("$41.67 per class", { exact: true })).toBeVisible();
  await expect(dialog.getByText("$40.63 per class", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Book one session/ }),
  ).toHaveAttribute("href", /acuityscheduling\.com\/schedule\/.+\/appointment\/75737120$/);
  await expect(dialog.getByRole("link", { name: /Buy 8 class pass/ })).toHaveAttribute(
    "href",
    /acuityscheduling\.com\/catalog\.php\?.*id=1939405/,
  );
  await expect(dialog.getByText("Best per class value", { exact: true })).toBeVisible();

  await older.check();
  await expect(dialog.getByRole("heading", { name: "$60" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "$115" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "$450" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "$50" })).toHaveCount(0);
  await expect(dialog.getByText("$57.50 per class", { exact: true })).toBeVisible();

  const details = dialog.locator("details");
  await expect(details).not.toHaveAttribute("open", "");
  await dialog.getByText("How class passes work", { exact: true }).click();
  await expect(details).toHaveAttribute("open", "");
  await expect(dialog.getByText(/eight-digit booking code/)).toBeVisible();

  const focusRemainsInDialog = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && Boolean(active.closest("dialog"));
  });
  expect(focusRemainsInDialog).toBe(true);

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  if (testInfo.project.name === "mobile-chromium") {
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(390);
    expect(box.height).toBe(844);
    await expect(dialog).toHaveCSS("border-radius", "0px");
  } else {
    expect(box.x).toBeGreaterThanOrEqual(24);
    expect(box.y).toBeGreaterThanOrEqual(24);
    expect(box.width).toBeLessThanOrEqual(1040);
    expect(box.height).toBeLessThanOrEqual(852);
  }

  const hasHorizontalOverflow = await dialog.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
});

test("renders the same selector as a full page without modal behavior", async ({ page }) => {
  await page.goto("/book-training", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { level: 1, name: "Book training" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Ages 6–10" })).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Ages 11–14" })).not.toBeChecked();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("removes gateway motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .locator('.pathway-main a[data-pathway-training-trigger="true"]:visible')
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: "Book training" });
  await expect(dialog).toHaveCSS("transition-duration", "0s");
  await expect(dialog).toHaveCSS("transform", "none");
});
