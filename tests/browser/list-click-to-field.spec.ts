import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-LIST-1: on /admin/partners and /admin/injury-report a click on a field inside a page card's or an item
 * card's preview opens that card's dialog with the field's control focused and ringed. Nothing here saves: the local seed has
 * no partners or injuries, so the items are typed into the unsaved draft, and every test throws the draft and its browser
 * recovery copy away. Same config as visitor-click-to-field.spec.ts (playwright.visitor-click.config.ts).
 */
const PARTNERS = { route: "/admin/partners", keyPrefix: "onzio:cinematic-partners:" };
const INJURY = { route: "/admin/injury-report", keyPrefix: "onzio:cinematic-injury-report:" };

const pageCard = (page: Page, id: string) => page.locator(`[data-preview-card="${id}"]`);
const itemCards = (page: Page, prefix: string) => page.locator(`[data-item-card^="${prefix}"]`);
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);

async function clearDraft(page: Page, keyPrefix: string) {
  await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key)), keyPrefix).catch(() => undefined);
}
async function open(page: Page, route: string, firstCard: string) {
  page.on("dialog", item => void item.accept());
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(pageCard(page, firstCard)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => pageCard(page, firstCard).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}

/** Viewport point at the centre of the part of a stamped (or selected) preview node that shows inside its card's box. */
async function pointIn(card: Locator, selector: string) {
  await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await card.page().waitForTimeout(250);
  const point = await card.evaluate((element, css) => {
    const node = element.querySelector(css);
    const box = element.querySelector("[data-preview-box]")?.getBoundingClientRect();
    if (!node || !box) return null;
    const rect = node.getBoundingClientRect();
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right), top = Math.max(rect.top, box.top), bottom = Math.min(rect.bottom, box.bottom);
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
  }, selector);
  if (!point) throw new Error(`no visible preview node for ${selector}`);
  return point;
}
const stamped = (target: string) => `[data-edit-target="${target}"]`;
const nodeText = (card: Locator, target: string) => card.locator(stamped(target)).first().evaluate(node => (node.textContent ?? "").replace(/\s+/g, " ").trim());

/** Types a value into the stamped control in the open dialog's panel. */
async function fill(page: Page, section: string, target: string, value: string) {
  const control = panel(page, section).locator(`${stamped(target)} input, ${stamped(target)} textarea`).first();
  await expect(control).toBeVisible();
  await control.fill(value);
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
/** Presses "Add ..." (unsaved), returns the new item's dialog id, and leaves its dialog open with nothing focused. */
async function addItem(page: Page, prefix: string) {
  const before = await itemCards(page, prefix).count();
  await page.locator("[data-add-item]").click();
  await expect(itemCards(page, prefix)).toHaveCount(before + 1);
  const ids = await itemCards(page, prefix).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-item-card") as string));
  const id = ids[ids.length - 1];
  await expect(panel(page, id)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await focusedTarget(page)).toBeNull();
  return id;
}
const rowOf = (id: string) => id.slice(id.indexOf(":") + 1);

/** A click on a stamped node opens its own dialog section with that field focused, ringed, holding the text the node shows. */
async function clickField(page: Page, card: Locator, section: string, target: string, expectValue?: (shown: string) => string) {
  const shown = await nodeText(card, target);
  const { x, y } = await pointIn(card, stamped(target));
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(target);
  await expect(dialog(page).locator(`${stamped(target)}`)).toHaveAttribute("data-edit-target-flash", "");
  expect(shown).not.toBe("");
  expect(await dialog(page).locator(":focus").inputValue()).toBe(expectValue ? expectValue(shown) : shown);
}

test.describe("UI-PREVIEW-CLICK-LIST-1: Partners", () => {
  test.afterEach(async ({ page }) => { await clearDraft(page, PARTNERS.keyPrefix); await page.goto("about:blank"); });

  test("a page card's heading opens that page with the field focused and ringed, and the mouse shows the field outline", async ({ page }) => {
    await open(page, PARTNERS.route, "page:partners");
    const card = pageCard(page, "page:partners"), target = "partners.partners.title";
    const { x, y } = await pointIn(card, stamped(target));
    await page.mouse.move(x, y);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "page:partners")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Heading");
    await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("the Partnership Opportunities page card opens its own page's heading (not the Club Partners one); its button has no link yet, so it is not drawn", async ({ page }) => {
    await open(page, PARTNERS.route, "page:opportunities");
    const card = pageCard(page, "page:opportunities");
    expect(await card.locator(stamped("partners.opportunities.ctaLabel")).count()).toBe(0);
    await clickField(page, card, "page:opportunities", "partners.opportunities.title");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Heading");
  });

  test("a click away from any field, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
    await open(page, PARTNERS.route, "page:partners");
    const card = pageCard(page, "page:partners");
    await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await card.locator("[data-preview-box]").boundingBox())!;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4);
    await expect(panel(page, "page:partners")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);
    await card.getByRole("button", { name: "Edit Club Partners page section" }).click();
    await expect(panel(page, "page:partners")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await closeDialog(page);
    await card.getByRole("button", { name: "Edit Club Partners page", exact: true }).evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "page:partners")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("a partner card's role and name open that partner's own field; a reorder keeps each id with its partner; the footer buttons focus nothing", async ({ page }) => {
    await open(page, PARTNERS.route, "page:partners");
    const first = await addItem(page, "partner:");
    await fill(page, first, `partners.partner.row:${rowOf(first)}.name`, "Click to field one");
    await fill(page, first, `partners.partner.row:${rowOf(first)}.role`, "Role of the first");
    await closeDialog(page);
    const second = await addItem(page, "partner:");
    await fill(page, second, `partners.partner.row:${rowOf(second)}.name`, "Click to field two");
    await fill(page, second, `partners.partner.row:${rowOf(second)}.role`, "Role of the second");
    await closeDialog(page);
    for (const id of [first, second]) await expect.poll(() => page.locator(`[data-item-card="${id}"] [data-edit-target]`).count()).toBe(2);

    // Each card's own role and its own name (no logo is set, so the name is text).
    const secondCard = page.locator(`[data-item-card="${second}"]`), firstCard = page.locator(`[data-item-card="${first}"]`);
    await clickField(page, secondCard, second, `partners.partner.row:${rowOf(second)}.role`);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Role");
    await closeDialog(page);
    await clickField(page, firstCard, first, `partners.partner.row:${rowOf(first)}.name`);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Name");
    await closeDialog(page);

    // Move the second partner earlier: its card is now first, and a click still opens ITS fields.
    await secondCard.getByRole("button", { name: /^Move .* earlier$/ }).click();
    await expect(itemCards(page, "partner:").first()).toHaveAttribute("data-item-card", second);
    await expect.poll(() => secondCard.locator("[data-edit-target]").count()).toBe(2);
    await clickField(page, secondCard, second, `partners.partner.row:${rowOf(second)}.name`);
    await closeDialog(page);

    // The footer Edit opens the card with nothing focused.
    await firstCard.getByRole("button", { name: /^Edit .* partner$/ }).click();
    await expect(panel(page, first)).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
  });

  test("clicking away from a partner card's fields opens the partner with no field focused", async ({ page }) => {
    await open(page, PARTNERS.route, "page:partners");
    const id = await addItem(page, "partner:");
    await fill(page, id, `partners.partner.row:${rowOf(id)}.name`, "Click to field edge");
    await closeDialog(page);
    const card = page.locator(`[data-item-card="${id}"]`);
    await expect.poll(() => card.locator("[data-edit-target]").count()).toBeGreaterThan(0);
    await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await card.locator("[data-preview-box]").boundingBox())!;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4);
    await expect(panel(page, id)).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("every stamp in every card is on that card's own shown nodes", async ({ page }) => {
    await open(page, PARTNERS.route, "page:partners");
    const id = await addItem(page, "partner:");
    await fill(page, id, `partners.partner.row:${rowOf(id)}.name`, "Click to field shown");
    await closeDialog(page);
    await expect.poll(() => page.locator(`[data-item-card="${id}"] [data-edit-target]`).count()).toBeGreaterThan(0);
    const cards: [Locator, string][] = [[pageCard(page, "page:partners"), "partners.partners."], [pageCard(page, "page:opportunities"), "partners.opportunities."], [page.locator(`[data-item-card="${id}"]`), `partners.partner.row:${rowOf(id)}.`]];
    for (const [card, prefix] of cards) {
      const nodes = await card.evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
        id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden]"),
      })));
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) { expect(node.id?.startsWith(prefix), `${node.id} on ${prefix}`).toBe(true); expect(node.shown, `${node.id} is shown`).toBe(true); }
    }
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the field's page and focuses it", async ({ page }) => {
      await open(page, PARTNERS.route, "page:partners");
      const { x, y } = await pointIn(pageCard(page, "page:partners"), stamped("partners.partners.title"));
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, "page:partners")).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe("partners.partners.title");
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Heading");
    });
  });
});

test.describe("UI-PREVIEW-CLICK-LIST-1: Injury Report", () => {
  test.afterEach(async ({ page }) => { await clearDraft(page, INJURY.keyPrefix); await page.goto("about:blank"); });

  test("the page-part cards open the heading and the video link; the presenter card opens the partner's name", async ({ page }) => {
    await open(page, INJURY.route, "presenter");
    await clickField(page, pageCard(page, "rehab"), "rehab", "injuryReport.rehab.heading");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Rehab heading");
    await closeDialog(page);
    await clickField(page, pageCard(page, "rehab"), "rehab", "injuryReport.rehab.videoUrl", () => "");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("YouTube link");
    await closeDialog(page);
    await clickField(page, pageCard(page, "presenter"), "presenter", "injuryReport.presenter.name");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Partner name");
  });

  test("the mouse shows the field outline, and a click away, the footer Edit and the keyboard focus nothing", async ({ page }) => {
    await open(page, INJURY.route, "presenter");
    const card = pageCard(page, "rehab");
    const { x, y } = await pointIn(card, stamped("injuryReport.rehab.heading"));
    await page.mouse.move(x, y);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", "injuryReport.rehab.heading");
    const box = (await card.locator("[data-preview-box]").boundingBox())!;
    await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4);
    await expect(panel(page, "rehab")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);
    await card.getByRole("button", { name: "Edit Photo, rehab quote and video section" }).click();
    await expect(panel(page, "rehab")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);
    await card.getByRole("button", { name: "Edit Photo, rehab quote and video", exact: true }).evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "rehab")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("an injury card's injury, timeline and note open that entry's own field; the Roster's name opens the card with nothing focused", async ({ page }) => {
    await open(page, INJURY.route, "presenter");
    const first = await addItem(page, "entry:");
    await fill(page, first, `injuryReport.entry.row:${rowOf(first)}.injury`, "Click to field strain");
    await fill(page, first, `injuryReport.entry.row:${rowOf(first)}.timeline`, "One week");
    await closeDialog(page);
    const second = await addItem(page, "entry:");
    await fill(page, second, `injuryReport.entry.row:${rowOf(second)}.injury`, "Click to field sprain");
    await fill(page, second, `injuryReport.entry.row:${rowOf(second)}.timeline`, "Two weeks");
    await fill(page, second, `injuryReport.entry.row:${rowOf(second)}.note`, "Click to field note");
    await closeDialog(page);
    const firstCard = page.locator(`[data-item-card="${first}"]`), secondCard = page.locator(`[data-item-card="${second}"]`);
    await expect.poll(() => secondCard.locator("[data-edit-target]").count()).toBe(3);

    // The node shows "Injury <text>" (a label and the text); the control holds the text.
    await clickField(page, secondCard, second, `injuryReport.entry.row:${rowOf(second)}.injury`, shown => shown.replace(/^Injury /, ""));
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Injury");
    await closeDialog(page);
    await clickField(page, secondCard, second, `injuryReport.entry.row:${rowOf(second)}.timeline`, shown => shown.replace(/^Timeline /, ""));
    await closeDialog(page);
    await clickField(page, secondCard, second, `injuryReport.entry.row:${rowOf(second)}.note`);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Note (optional)");
    await closeDialog(page);
    await clickField(page, firstCard, first, `injuryReport.entry.row:${rowOf(first)}.injury`, shown => shown.replace(/^Injury /, ""));
    await closeDialog(page);

    // Reorder: the second injury moves first and a click still opens its own field.
    await secondCard.getByRole("button", { name: /^Move .* earlier$/ }).click();
    await expect(itemCards(page, "entry:").first()).toHaveAttribute("data-item-card", second);
    await expect.poll(() => secondCard.locator("[data-edit-target]").count()).toBe(3);
    await clickField(page, secondCard, second, `injuryReport.entry.row:${rowOf(second)}.timeline`, shown => shown.replace(/^Timeline /, ""));
    await closeDialog(page);

    // The player's name belongs to Roster: it carries no id, so the card opens with nothing focused.
    expect(await secondCard.locator(".injury-name[data-edit-target], .injury-position[data-edit-target], .injury-photo [data-edit-target]").count()).toBe(0);
    const { x, y } = await pointIn(secondCard, ".injury-name");
    await page.mouse.click(x, y);
    await expect(panel(page, second)).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("every stamp in every card is on that card's own shown nodes", async ({ page }) => {
    await open(page, INJURY.route, "presenter");
    const id = await addItem(page, "entry:");
    await fill(page, id, `injuryReport.entry.row:${rowOf(id)}.injury`, "Click to field shown");
    await closeDialog(page);
    await expect.poll(() => page.locator(`[data-item-card="${id}"] [data-edit-target]`).count()).toBeGreaterThan(0);
    const cards: [Locator, string][] = [[pageCard(page, "presenter"), "injuryReport.presenter."], [pageCard(page, "rehab"), "injuryReport.rehab."], [page.locator(`[data-item-card="${id}"]`), `injuryReport.entry.row:${rowOf(id)}.`]];
    for (const [card, prefix] of cards) {
      const nodes = await card.evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
        id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden]"),
      })));
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) { expect(node.id?.startsWith(prefix), `${node.id} on ${prefix}`).toBe(true); expect(node.shown, `${node.id} is shown`).toBe(true); }
    }
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the injury and focuses the clicked field", async ({ page }) => {
      await open(page, INJURY.route, "presenter");
      const id = await addItem(page, "entry:");
      await fill(page, id, `injuryReport.entry.row:${rowOf(id)}.injury`, "Click to field phone");
      await closeDialog(page);
      const target = `injuryReport.entry.row:${rowOf(id)}.injury`, card = page.locator(`[data-item-card="${id}"]`);
      await expect.poll(() => card.locator("[data-edit-target]").count()).toBeGreaterThan(0);
      const { x, y } = await pointIn(card, stamped(target));
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, id)).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe(target);
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Injury");
    });
  });
});
