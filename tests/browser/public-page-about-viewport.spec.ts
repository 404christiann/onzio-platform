import { expect, test } from "@playwright/test";

test("About canvas keeps the public phone and desktop CSS viewports while fitting the editor", async ({ page }) => {
  await page.goto("/admin/about");
  const frame = page.locator(".aep-frame");
  const preview = page.frameLocator(".aep-frame");
  await expect(frame).toBeVisible();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(390);
  await expect.poll(() => frame.boundingBox().then((box) => box?.width ?? 0)).toBeLessThan(390);
  await preview.getByRole("button", { name: "Edit Page heading", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Page heading", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);

  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(1440);
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect.poll(() => preview.locator("body").evaluate(() => innerWidth)).toBe(390);
});
