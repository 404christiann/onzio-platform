import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`${width}px: collapsed player groups leave the keyboard focus order`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/roster");
    const group = page.locator("main button[aria-expanded][aria-controls]").first();
    await expect(group).toHaveAttribute("aria-expanded", "true");
    const id = await group.getAttribute("aria-controls");
    const rows = page.locator(`[id=${JSON.stringify(id)}]`);
    const player = rows.getByRole("button").first();
    await expect(player).toBeVisible();
    await player.focus();
    await expect(player).toBeFocused();
    await group.click();
    await expect(group).toHaveAttribute("aria-expanded", "false");
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      expect(await rows.evaluate(element => element.contains(document.activeElement))).toBe(false);
    }
    await group.click();
    await player.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(player).toBeFocused();
  });
}

for (const width of [390, 1440]) {
  test(`${width}px: Staff keeps labelled fields and its independent editor`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/roster");
    await page.getByRole("tab", { name: "Staff", exact: true }).click();
    await page.getByRole("button", { name: "Add staff", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const name of ["Initials", "Name", "Role", "Hometown"]) {
      await expect(dialog.getByLabel(name, { exact: false }).first()).toHaveCount(1);
    }
    if (width === 1440) expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(448);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Add staff", exact: true })).toBeFocused();
  });
}

for (const width of [320, 1024, 1440]) {
  test(`${width}px: theme persists and route search opens the complete player form`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "What would you like to do?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const theme = page.getByRole("button", { name: "Switch to dark theme", exact: true });
    await theme.click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Switch to light theme", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Search admin pages|Search pages/, exact: false }).click();
    const search = page.getByRole("combobox");
    await search.fill("roster");
    await expect(page.getByRole("option", { name: "Roster", exact: false })).toBeVisible();
    await search.press("Enter");
    await expect(page).toHaveURL(/\/admin\/roster$/);
    await page.getByRole("button", { name: "Add player", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name", { exact: false }).first()).toBeVisible();
    for (const id of ["player-number", "player-position", "player-height", "player-weight", "player-age", "player-hometown", "player-foot", "player-school", "player-previous-club", "player-bio"]) {
      await expect(dialog.locator(`#${id}`)).toHaveCount(1);
    }
    if (width === 320) {
      for (const field of await dialog.locator("input:not([type=file]),select,textarea").all()) {
        expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
      }
    }
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Add player", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
  });
}
