import { expect, test, type Page } from "@playwright/test";

async function openInspector(page: Page, editor: "programs" | "tryouts" | "shop") {
  await page.goto(`/admin/${editor}`);
  if (editor === "programs") {
    const frame = page.frameLocator(".program-canvas-frame");
    await frame.locator('a[href^="/programs/"]').first().click();
    const target = page.frameLocator(".program-canvas-frame").getByRole("button", { name: "Edit Program hero", exact: true });
    await target.click();
    return { target, dialog: page.getByRole("dialog", { name: "Program page tools", exact: true }), save: "Save program" };
  }
  if (editor === "tryouts") {
    const target = page.frameLocator("iframe").getByRole("button", { name: "Edit page introduction", exact: true });
    await target.click();
    return { target, dialog: page.getByRole("dialog", { name: "Selected Tryouts section tools", exact: true }), save: "Save page" };
  }
  const target = page.getByRole("button", { name: "Edit kit text", exact: true });
  await target.click();
  return { target, dialog: page.getByRole("dialog", { name: "Selected Shop section tools", exact: true }), save: "Save page" };
}

for (const editor of ["programs", "tryouts", "shop"] as const) {
  test(`${editor} phone inspector contains focus and restores the selected target`, async ({ page }) => {
    const { target, dialog } = await openInspector(page, editor);
    await expect(dialog).toBeVisible();
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    const background = page.getByRole("link", { name: "Dashboard", exact: true }).first();
    if (await background.count()) {
      await background.evaluate((element) => (element as HTMLElement).focus());
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(target).toBeFocused();
    await target.click();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(target).toBeFocused();
  });

  // Keep layout/dvh unchanged: only visualViewport shrinks as on iOS.
  test(`${editor} Save and Done stay above a shrinking software keyboard`, async ({ page }) => {
    const { dialog, save } = await openInspector(page, editor);
    await expect(dialog).toBeVisible();
    const layoutHeight = await page.evaluate(() => innerHeight);
    for (const field of await dialog.locator("input:not([type=file]),textarea,select").all()) {
      expect(await field.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    }
    try {
      for (const visible of [{ height: 330, top: 0 }, { height: 330, top: 85 }, { height: 460, top: 22 }]) {
        await page.evaluate(({ height, top }) => {
          const viewport = window.visualViewport!;
          Object.defineProperty(viewport, "height", { configurable: true, value: height });
          Object.defineProperty(viewport, "offsetTop", { configurable: true, value: top });
          viewport.dispatchEvent(new Event(top ? "scroll" : "resize"));
        }, visible);
        expect(await page.evaluate(() => innerHeight)).toBe(layoutHeight);
        const lowerField = dialog.locator("input:not([type=file]),textarea").last();
        if (await lowerField.count()) await lowerField.scrollIntoViewIfNeeded();
        for (const control of [dialog.getByRole("button", { name: "Done", exact: true }), dialog.getByRole("button", { name: save, exact: true })]) {
          await expect.poll(async () => {
            const rect = await control.boundingBox();
            return Boolean(rect && rect.y >= visible.top && rect.y + rect.height <= visible.top + visible.height);
          }).toBe(true);
          expect(await control.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          })).toBe(true);
        }
      }
    } finally {
      await page.evaluate(() => {
        Reflect.deleteProperty(window.visualViewport!, "height"); Reflect.deleteProperty(window.visualViewport!, "offsetTop");
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
    }
  });
}

test("Shop preview uses the public desktop and phone CSS breakpoints while fitting the canvas", async ({ page }) => {
  await page.goto("/admin/shop");
  const frame = page.locator('iframe[title$="Shop page preview"]');
  await expect(frame).toBeVisible();
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect.poll(() => page.frameLocator('iframe[title$="Shop page preview"]').locator("body").evaluate(() => innerWidth)).toBe(1440);
  await expect.poll(() => frame.boundingBox().then((rect) => rect!.width)).toBeLessThan(390);
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect.poll(() => page.frameLocator('iframe[title$="Shop page preview"]').locator("body").evaluate(() => innerWidth)).toBe(390);
});
