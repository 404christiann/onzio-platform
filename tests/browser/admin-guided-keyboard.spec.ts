import { expect, test } from "@playwright/test";

for (const kind of ["player", "match", "staff"] as const) {
  test(kind + ": actions remain reachable when only the visual viewport shrinks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(kind === "match" ? "/admin/schedule" : "/admin/roster");
    if (kind === "staff") await page.getByRole("tab", { name: "Staff", exact: true }).click();
    const add = page.getByRole("button", { name: kind === "match" ? /Add match/ : kind === "staff" ? "Add staff" : "Add player", exact: kind !== "match" });
    await expect(add).toBeEnabled();
    await page.evaluate(() => {
      const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    });
    await add.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const field = dialog.locator(kind === "match" ? "#match-opponent" : kind === "staff" ? "#staff-name" : "#player-name");
    await field.focus();
    const expectFieldInsideScrollArea = async () => {
      await expect.poll(async () => field.evaluate((element) => {
        let content = element.parentElement;
        while (content && getComputedStyle(content).overflowY !== "auto") {
          content = content.parentElement;
        }
        if (!content) return { top: false, bottom: false };
        const fieldBounds = element.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        return {
          top: fieldBounds.top >= contentBounds.top,
          bottom: fieldBounds.bottom <= contentBounds.bottom,
        };
      })).toEqual({ top: true, bottom: true });
    };
    await expectFieldInsideScrollArea();
    const initialLayoutHeight = await page.evaluate(() => window.innerHeight);

    // iOS-style keyboard: document dimensions remain unchanged while the
    // visual viewport becomes shorter and moves. This is browser simulation,
    // not evidence of a real software keyboard.
    await page.evaluate(() => {
      const viewport = window.visualViewport as unknown as EventTarget & { height: number; offsetTop: number };
      viewport.height = 360;
      viewport.offsetTop = 24;
      viewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(360);
    expect(await page.evaluate(() => window.innerHeight)).toBe(initialLayoutHeight);
    await expect(field).toBeFocused();
    await expectFieldInsideScrollArea();
    await field.fill("Keyboard visibility check");
    await expect(field).toHaveValue("Keyboard visibility check");
    await expectFieldInsideScrollArea();

    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    const save = dialog.getByRole("button", { name: kind === "match" ? "Save match" : kind === "staff" ? "Save staff member" : "Save player", exact: true });
    if (kind === "staff") await save.scrollIntoViewIfNeeded();
    for (const action of [cancel, save]) {
      const bounds = (await action.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(24);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(384);
    }

    await page.evaluate(() => {
      const viewport = window.visualViewport as unknown as EventTarget & { height: number; offsetTop: number };
      viewport.height = 340;
      viewport.offsetTop = 44;
      viewport.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(async () => (await dialog.boundingBox())!.y).toBe(44);
    await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(340);
    await expect(field).toBeFocused();
    await expectFieldInsideScrollArea();
    if (kind === "staff") await save.scrollIntoViewIfNeeded();
    const saveBounds = (await save.boundingBox())!;
    expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(384);

    await cancel.click();
    await expect(dialog).not.toBeVisible();
    await expect(add).toBeFocused();
    await page.evaluate(() => {
      const viewport = window.visualViewport as unknown as EventTarget & { height: number; offsetTop: number };
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    await add.click();
    await expect.poll(async () => (await dialog.boundingBox())!.height).toBe(844);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });
}

// Native Safari sizes an appearance:auto time control as content-box even with
// border-box declared. Keep the native type/picker while making the authored
// field obey its container; actual WebKit picker behavior is checked separately.
for (const width of [320, 390]) {
  test(`${width}px: time retains its native value without overflowing the match field`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/schedule");
    await page.getByRole("button", { name: "Add match", exact: true }).click();
    const field = page.getByRole("dialog").locator("#match-time");
    await expect(field).toHaveAttribute("type", "time");
    await expect(field).toHaveCSS("appearance", "none");
    await expect(field).toHaveCSS("box-sizing", "border-box");
    await field.fill("18:30");
    await expect(field).toHaveValue("18:30");
    expect(await field.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      return bounds.left >= parent.left && bounds.right <= parent.right + 1 && (element as HTMLInputElement).validity.valid;
    })).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  });
}
