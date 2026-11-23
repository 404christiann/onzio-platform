import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-ROSTER: on /admin/roster a click on a field of a player card (photo, number, flag, name, position,
 * hometown, a season stat) opens that player's dialog on the section holding the field with its control focused and ringed.
 * Cards are keyed by the player's uuid; a click away from every field, the Edit button's keyboard activation and the Enter
 * key open Basics with nothing focused. Nothing here saves or toggles a Shown switch (that writes straight away): every test
 * only opens and closes the dialog. Run with playwright.roster-click.config.ts.
 */
const cards = (page: Page) => page.locator("li[data-player-id]");
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);
const stamped = (target: string) => `[data-edit-target$="${target}"]`;
const rowOf = async (card: Locator) => (await card.getAttribute("data-player-id")) as string;

async function ready(page: Page) {
  page.on("dialog", item => void item.accept());
  await page.goto("/admin/roster", { waitUntil: "domcontentloaded" });
  await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => cards(page).first().locator("[data-edit-target$='.mins']").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}

/** Viewport point at the centre of a stamped node on a card, after bringing the card into view. */
async function pointOn(card: Locator, field: string) {
  await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await card.page().waitForTimeout(150);
  const rect = await card.locator(stamped(`.${field}`)).first().boundingBox();
  if (!rect) throw new Error(`no visible card node for ${field}`);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
const fieldCard = (page: Page) => cards(page).filter({ has: page.locator("[data-edit-target$='.goals']") }).first();
const keeperCard = (page: Page) => cards(page).filter({ has: page.locator("[data-edit-target$='.saves']") }).first();

async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}

/** A click on a card field opens its own section with that field's control focused and ringed. */
async function clickField(page: Page, card: Locator, section: string, field: string, name: string | RegExp) {
  const row = await rowOf(card);
  const { x, y } = await pointOn(card, field);
  await page.mouse.move(x, y);
  await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", new RegExp(`\\.${field}$`));
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toMatch(new RegExp(`^roseCityRoster\\.${section}\\.row:${row}\\.${field}$`));
  await expect(dialog(page).locator(":focus")).toHaveAccessibleName(name);
  await expect(dialog(page).locator(`[data-edit-target$=".${field}"]`).first()).toHaveAttribute("data-edit-target-flash", "");
}

test.describe("UI-PREVIEW-CLICK-ROSTER: click a Roster card field to edit it", () => {
  test.beforeEach(async ({ page }) => { await ready(page); });
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("name, number, hometown, flag and photo open their section with the field focused and ringed", async ({ page }) => {
    const card = fieldCard(page);
    await clickField(page, card, "basics", "name", "Name");
    await closeDialog(page);
    await clickField(page, card, "basics", "number", "Jersey number");
    await closeDialog(page);
    await clickField(page, card, "details", "hometown", "Hometown");
    await closeDialog(page);
    // The local seed's nationalities draw no flag (an empty box has no area to click), so only a drawn flag is clicked.
    if (((await card.locator(stamped(".nationality")).first().boundingBox())?.width ?? 0) > 0) {
      await clickField(page, card, "basics", "nationality", "Nationality");
      await closeDialog(page);
    }
    const row = await rowOf(card);
    const { x, y } = await pointOn(card, "photo");
    await page.mouse.click(x, y);
    await expect(panel(page, "basics")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(`roseCityRoster.basics.row:${row}.photo`);
  });

  test("the position abbreviation focuses the pressed position button", async ({ page }) => {
    const card = fieldCard(page);
    const shown = (await card.locator(stamped(".position")).first().textContent())!.trim();
    const names: Record<string, string> = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" };
    await clickField(page, card, "basics", "position", names[shown]);
    await expect(dialog(page).locator(":focus")).toHaveAttribute("aria-pressed", "true");
  });

  test("a season stat opens Season stats on that stat, a goalkeeper's Saves on Saves", async ({ page }) => {
    await clickField(page, fieldCard(page), "stats", "goals", "Goals");
    await closeDialog(page);
    await clickField(page, fieldCard(page), "stats", "mins", "Minutes");
    await closeDialog(page);
    if (await keeperCard(page).count()) await clickField(page, keeperCard(page), "stats", "saves", "Saves");
  });

  test("the card opened is the card clicked: another player's field opens that player, by uuid", async ({ page }) => {
    const all = cards(page);
    const second = all.nth(1);
    const name = (await second.locator(stamped(".name")).first().textContent())!.replace(/\s+/g, " ").trim().replace(/ C$/, "");
    const row = await rowOf(second);
    const { x, y } = await pointOn(second, "name");
    await page.mouse.click(x, y);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("heading", { name: new RegExp(`^Edit ${name}`, "i") }).first()).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(`roseCityRoster.basics.row:${row}.name`);
  });

  test("a click away from any field, the keyboard and the footer open Basics with nothing focused; the switch area carries no field", async ({ page }) => {
    const card = fieldCard(page);
    await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    // Between two stats of the strip: part of the card, no field.
    const gap = await card.evaluate(element => {
      const stats = [...element.querySelectorAll<HTMLElement>("[data-edit-target$='.goals'], [data-edit-target$='.assists']")].map(node => node.getBoundingClientRect());
      return { x: (stats[0].right + stats[1].left) / 2, y: (stats[0].top + stats[0].bottom) / 2 };
    });
    await page.mouse.move(gap.x, gap.y);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveCount(0);
    await page.mouse.click(gap.x, gap.y);
    await expect(panel(page, "basics")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await closeDialog(page);

    const face = card.locator("button[data-kit-edit]");
    await face.evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "basics")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);

    await face.evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Space");
    await expect(panel(page, "basics")).toBeVisible();
    await page.waitForTimeout(500);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);

    expect(await card.locator("[data-edit-target]").evaluateAll(nodes => nodes.filter(node => !node.closest("button[data-kit-edit]")).length)).toBe(0);
  });

  test("the hover outline is a mouse-only box over the field under the pointer and leaves with the pointer", async ({ page }) => {
    const card = fieldCard(page);
    const { x, y } = await pointOn(card, "number");
    await page.mouse.move(x, y);
    const outline = card.locator("[data-field-hover]:not([hidden])");
    await expect(outline).toHaveAttribute("data-target", /\.number$/);
    const box = (await outline.boundingBox())!;
    const field = (await card.locator(stamped(".number")).first().boundingBox())!;
    expect(Math.abs(box.x - field.x)).toBeLessThan(3);
    expect(Math.abs(box.width - field.width)).toBeLessThan(3);
    await page.mouse.move(5, 5);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveCount(0);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the field's section and focuses it", async ({ page }) => {
      const card = cards(page).first();
      const row = await rowOf(card);
      const { x, y } = await pointOn(card, "hometown");
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, "details")).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe(`roseCityRoster.details.row:${row}.hometown`);
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Hometown");
    });
  });
});
