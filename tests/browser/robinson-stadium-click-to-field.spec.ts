import { expect, test, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-VISITOR-1: on /admin/stadium a click on a field inside a section card's preview opens that section's
 * dialog with the field's control focused and ringed. Nothing here saves: the story paragraphs this needs are typed
 * into the draft, and every test throws the draft and its browser recovery copy away.
 */
const card = (page: Page, section: string) => page.locator(`[data-preview-card="${section}"]`);
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);

async function clearDraft(page: Page) {
  await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("onzio:robinson:")).forEach(key => localStorage.removeItem(key))).catch(() => undefined);
}

async function ready(page: Page) {
  await page.goto("/admin/stadium", { waitUntil: "domcontentloaded" });
  await expect(card(page, "heading")).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => card(page, "heading").locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}

/** Types paragraphs into the Story draft (never saved) until the page shows `count`, then closes the dialog. */
async function ensureParagraphs(page: Page, count: number) {
  await card(page, "story").getByRole("button", { name: "Edit Story section" }).click();
  await expect(panel(page, "story")).toBeVisible();
  const field = (index: number) => panel(page, "story").getByLabel(`Paragraph ${index}`, { exact: true });
  for (let index = 1; index <= count; index++) {
    if (!(await field(index).count())) await panel(page, "story").getByRole("button", { name: "Add paragraph" }).click();
    if (!(await field(index).inputValue())) await field(index).fill(`Click to field paragraph ${index}. `.repeat(3));
  }
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => card(page, "story").locator('[data-edit-target^="robinson.story.row:"]').count()).toBeGreaterThanOrEqual(count);
}

/** Viewport point at the centre of the part of a stamped preview node that shows inside its card's box (scrolled into view first). */
async function fieldPoint(page: Page, section: string, target: string) {
  await card(page, section).evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(250);
  const point = await card(page, section).evaluate((element, id) => {
    const node = Array.from(element.querySelectorAll("[data-edit-target]")).find(item => item.getAttribute("data-edit-target") === id);
    const box = element.querySelector("[data-preview-box]")?.getBoundingClientRect();
    if (!node || !box) return null;
    const rect = node.getBoundingClientRect();
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right), top = Math.max(rect.top, box.top), bottom = Math.min(rect.bottom, box.bottom);
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
  }, target);
  if (!point) throw new Error(`no visible preview node for ${target}`);
  return point;
}

test.describe("UI-PREVIEW-CLICK-VISITOR-1: click a Robinson preview field to edit it", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", item => void item.accept());
    await ready(page);
  });
  test.afterEach(async ({ page }) => {
    await clearDraft(page);
    await page.goto("about:blank");
  });

  test("the heading title opens Page heading with Title focused and ringed, and the mouse shows the field outline", async ({ page }) => {
    const { x, y } = await fieldPoint(page, "heading", "robinson.heading.title");
    await page.mouse.move(x, y);
    await expect(card(page, "heading").locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", "robinson.heading.title");
    await page.mouse.click(x, y);
    await expect(panel(page, "heading")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("robinson.heading.title");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    await expect(dialog(page).locator('[data-edit-target="robinson.heading.title"]')).toHaveAttribute("data-edit-target-flash", "");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("a story paragraph opens Story with that Paragraph focused", async ({ page }) => {
    await ensureParagraphs(page, 2);
    const { x, y } = await fieldPoint(page, "story", "robinson.story.row:1.paragraph");
    await page.mouse.click(x, y);
    await expect(panel(page, "story")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("robinson.story.row:1.paragraph");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Paragraph 2");
  });

  test("a click away from any field, the footer Edit and the keyboard open the section with no field focused", async ({ page }) => {
    await card(page, "heading").evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await card(page, "heading").locator("[data-preview-box]").boundingBox())!;
    await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6);
    await expect(panel(page, "heading")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    await card(page, "heading").getByRole("button", { name: "Edit Page heading section" }).click();
    await expect(panel(page, "heading")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    await card(page, "heading").getByRole("button", { name: "Edit Page heading", exact: true }).evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "heading")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
  });

  test("closing and reopening with the footer Edit does not jump back to the last field", async ({ page }) => {
    const { x, y } = await fieldPoint(page, "heading", "robinson.heading.title");
    await page.mouse.click(x, y);
    await expect.poll(() => focusedTarget(page)).toBe("robinson.heading.title");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await card(page, "heading").getByRole("button", { name: "Edit Page heading section" }).click();
    await expect(panel(page, "heading")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("reduced motion: the ring shows without animating", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { x, y } = await fieldPoint(page, "heading", "robinson.heading.title");
    await page.mouse.click(x, y);
    const field = dialog(page).locator('[data-edit-target="robinson.heading.title"]');
    await expect(field).toHaveAttribute("data-edit-target-flash", "static");
    expect(await field.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the field's section and focuses it", async ({ page }) => {
      const { x, y } = await fieldPoint(page, "heading", "robinson.heading.title");
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, "heading")).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe("robinson.heading.title");
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    });
  });
});
