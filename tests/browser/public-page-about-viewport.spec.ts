import { expect, test } from "@playwright/test";

test("About canvas keeps the public phone and desktop CSS viewports while fitting the editor", async ({ page }) => {
  await page.goto("/admin/about");
  const frame = page.locator(".aep-frame");
  const preview = page.frameLocator(".aep-frame");
  await expect(frame).toBeVisible();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(390);
  await expect.poll(() => frame.boundingBox().then((box) => box?.width ?? 0)).toBeLessThan(390);
  await preview.locator("[data-about-editor-section]").first().click();
  await expect(page.locator(".aep-inspector")).toHaveAttribute("data-open", "true");
  await page.locator(".aep-inspector-head button").click();

  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(1440);
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(390);
});
