import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectContained(page: Page, dialog: Locator) {
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
}

for (const width of [390, 1440]) {
  test(`${width}px: edit panels and nested search retain drafts and modal focus`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/roster");
    const add = page.getByRole("button", { name: "Add player", exact: true });
    await add.click();
    const panel = page.getByRole("dialog", { name: "New player", exact: true });
    await expect(panel).toBeVisible();
    await panel.locator("#player-name").fill("Unsaved keyboard draft");
    await panel.getByRole("button", { name: "Save player", exact: true }).focus();
    await expectContained(page, panel);
    await panel.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Control+k");
    const search = page.getByRole("dialog", { name: "Search admin pages", exact: true });
    await expect(search.getByRole("combobox")).toBeFocused();
    await search.getByRole("option").last().focus();
    await expectContained(page, search);
    await page.keyboard.press("Escape");
    await expect(search).not.toBeVisible();
    await expect(panel).toBeVisible();
    await expect(panel.locator("#player-name")).toHaveValue("Unsaved keyboard draft");
    await expect.poll(() => panel.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
    await expect(add).toBeFocused();
  });
}

test("phone navigation excludes hidden links and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const drawer = page.locator("#admin-sidebar");
  const trigger = page.getByRole("button", { name: "Open admin navigation", exact: true });
  await expect(drawer).toHaveAttribute("inert", "");
  await trigger.focus();
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(false);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("link").last().focus();
  await expectContained(page, dialog);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveAttribute("inert", "");
  await expect(trigger).toBeFocused();
});

test("season creation confirmation traps focus and cancels without writes", async ({ page }) => {
  await page.goto("/admin/seasons");
  const trigger = page.getByRole("button", { name: "Create Next Season", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Create .* Season/ });
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await expectContained(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("decorative branding preview excludes links from keyboard navigation", async ({ page }) => {
  await page.goto("/admin/branding");
  const preview = page.locator('[data-admin-public-preview] [aria-hidden="true"]');
  await expect(preview).toHaveAttribute("inert", "");
  const link = preview.locator("a").first();
  await link.evaluate(element => (element as HTMLElement).focus());
  expect(await preview.evaluate(element => element.contains(document.activeElement))).toBe(false);
});

test("open route search stays inside the viewport when desktop becomes tablet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin");
  await page.getByRole("button", { name: /Search admin pages/, exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Search admin pages", exact: true });
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.setViewportSize({ width: 640, height: 900 });
  await expect.poll(async () => {
    const box = await dialog.boundingBox();
    return Boolean(box && box.x >= 16 && box.x + box.width <= 624);
  }).toBe(true);
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
