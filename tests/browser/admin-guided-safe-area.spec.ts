import { expect, test, type Locator } from "@playwright/test";

async function expectSafeEdges(control: Locator, width: number) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(48);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width - 48 + 1);
}

for (const width of [390, 844]) {
  test(width + "px: protected controls stay inside simulated safe-area edges", async ({ page }) => {
    const height = width === 844 ? 390 : 844;
    await page.setViewportSize({ width, height });
    await page.goto("/admin/roster");
    await expect(page.getByRole("button", { name: "Add player", exact: true })).toBeVisible();

    // Synthetic insets exercise real CSS geometry, not native hardware.
    await page.locator(".admin-portal").evaluate((element) => {
      const portal = element as HTMLElement;
      for (const [side, value] of Object.entries({ top: "24px", right: "48px", bottom: "24px", left: "48px" })) {
        portal.style.setProperty("--admin-safe-area-" + side, value);
      }
    });

    const header = page.locator(".admin-portal header").first();
    const main = page.locator(".admin-portal main").first();
    for (const area of [header, main]) {
      const padding = await area.evaluate(element => {
        const style = getComputedStyle(element);
        return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
      });
      expect(padding.left).toBeGreaterThanOrEqual(48);
      expect(padding.right).toBeGreaterThanOrEqual(48);
    }
    expect((await header.boundingBox())!.height).toBeGreaterThanOrEqual(96);
    await expectSafeEdges(page.getByRole("button", { name: "Open admin navigation", exact: true }), width);
    await page.getByRole("button", { name: "Open admin navigation", exact: true }).click();
    const drawer = page.locator("#admin-sidebar");
    for (const slot of ["sidebar-header", "sidebar-content", "sidebar-footer"]) {
      const left = await drawer.locator('[data-slot="' + slot + '"]').evaluate(element => parseFloat(getComputedStyle(element).paddingLeft));
      expect(left).toBeGreaterThanOrEqual(48);
    }
    await page.getByRole("button", { name: "Close admin navigation", exact: true }).click();

    await page.getByRole("button", { name: /Search admin pages|Search pages/ }).click();
    const searchDialog = page.getByRole("dialog", { name: "Search admin pages", exact: true });
    await expectSafeEdges(searchDialog, width);
    const searchBox = (await searchDialog.boundingBox())!;
    expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(height - 24 + 1);
    if (width === 390) expect((await searchDialog.boundingBox())!.y).toBeGreaterThanOrEqual(104);
    await page.keyboard.press("Escape");

    await header.locator('button[aria-haspopup="menu"]').click();
    await expectSafeEdges(page.getByRole("menu"), width);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Add player", exact: true }).click();
    const playerDialog = page.getByRole("dialog");
    await expectSafeEdges(playerDialog.locator("#player-name"), width);
    await expectSafeEdges(playerDialog.getByRole("button", { name: "Cancel", exact: true }), width);
    await expectSafeEdges(playerDialog.getByRole("button", { name: "Save player", exact: true }), width);
    const footerBottom = await playerDialog.locator(":scope > div").last().evaluate(element => parseFloat(getComputedStyle(element).paddingBottom));
    expect(footerBottom).toBeGreaterThanOrEqual(24);
    await playerDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("tab", { name: "Staff", exact: true }).click();
    await page.getByRole("button", { name: "Add staff", exact: true }).click();
    const staffDialog = page.getByRole("dialog");
    const scrollContent = staffDialog.locator(":scope > div").nth(1).locator(":scope > div").first();
    const bodyPadding = await scrollContent.evaluate(element => {
      const style = getComputedStyle(element);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), bottom: parseFloat(style.paddingBottom) };
    });
    expect(bodyPadding.left).toBeGreaterThanOrEqual(48);
    expect(bodyPadding.right).toBeGreaterThanOrEqual(48);
    expect(bodyPadding.bottom).toBeGreaterThanOrEqual(24);
    await staffDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
}
