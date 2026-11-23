import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-LIST-2: on /admin/news a click on a field inside an article card's thumbnail opens that article on the
 * dialog section holding the field (a title or heading: Details; the cover photo: Cover photo) with the control focused and
 * ringed; on /admin/sponsors a click on a sponsor logo in the carousel card opens the dialog on that sponsor's logo control. Nothing
 * here saves: News and Sponsors edits stay in the page until Save, which no test presses, and the only edit is a typed title
 * that dies with the page.
 *
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
async function pointIn(card: Locator, selector: string, boxSelector = "[data-preview-box]") {
  await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await card.page().waitForTimeout(250);
  const point = await card.evaluate((element, [css, boxCss]) => {
    const node = element.querySelector(css);
    const box = element.querySelector(boxCss)?.getBoundingClientRect();
    if (!node || !box) return null;
    const rect = node.getBoundingClientRect();
    const left = Math.max(rect.left, box.left), right = Math.min(rect.right, box.right), top = Math.max(rect.top, box.top), bottom = Math.min(rect.bottom, box.bottom);
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
  }, [selector, boxSelector] as const);
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

/* ---------------------------------------------------------------- LIST-2: News */
const NEWS = { route: "/admin/news" };
const newsCard = (page: Page, nth: number) => page.locator("[data-news-card]").nth(nth);
const NEWS_BOX = "[data-news-thumb]";
/** A viewport point inside the card's preview box that no stamped node covers, so a click there is a click away from every field. */
async function pointAwayFromFields(card: Locator, boxSelector: string) {
  await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const point = await card.evaluate((element, boxCss) => {
    const box = element.querySelector(boxCss)!.getBoundingClientRect();
    const rects = Array.from(element.querySelectorAll("[data-edit-target]")).map(node => node.getBoundingClientRect());
    for (let y = box.top + 4; y < box.bottom - 2; y += 6) for (let x = box.left + 4; x < box.right - 2; x += 6) {
      if (!rects.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return { x, y };
    }
    return null;
  }, boxSelector);
  if (!point) throw new Error("every point of the preview is a field");
  return point;
}
async function openNews(page: Page) {
  page.on("dialog", item => void item.accept());
  await page.goto(NEWS.route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-news-card]").first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => newsCard(page, 0).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}
/** The card's own article key, its stamped targets by field, and the title it shows. */
const keyOf = (card: Locator) => card.getAttribute("data-news-card") as Promise<string>;
const field = (key: string, section: string, name: string) => `news.${section}.row:${key}.${name}`;
async function clickNews(page: Page, card: Locator, section: string, target: string) {
  const { x, y } = await pointIn(card, stamped(target), NEWS_BOX);
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(target);
  await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
}

test.describe("UI-PREVIEW-CLICK-LIST-2: News", () => {
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("a title opens that article's Details with the title focused, holding the title the card shows, and the mouse shows the outline", async ({ page }) => {
    await openNews(page);
    const card = newsCard(page, 1), key = await keyOf(card), target = field(key, "details", "title");
    const shown = await nodeText(card, target);
    const { x, y } = await pointIn(card, stamped(target), NEWS_BOX);
    await page.mouse.move(x, y);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "details")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    expect(await dialog(page).locator(":focus").inputValue()).toBe(shown);
    await expect(dialog(page)).toContainText(shown);
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("each card opens its own article, and the card heading and the category open Details too", async ({ page }) => {
    await openNews(page);
    const count = await page.locator("[data-news-card]").count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (const nth of [0, count - 1]) {
      const card = newsCard(page, nth), key = await keyOf(card), title = await nodeText(card, field(key, "details", "title"));
      await clickNews(page, card, "details", field(key, "details", "cardHeading"));
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Card heading");
      await expect(dialog(page)).toContainText(title);
      await closeDialog(page);
    }
    const card = newsCard(page, 0), key = await keyOf(card);
    await clickNews(page, card, "details", field(key, "details", "category"));
    await expect(dialog(page).locator(":focus")).toBeChecked();
  });

  test("the cover photo opens the Cover photo section, not Details, and a title typed there is on the card and still clicks through", async ({ page }) => {
    await openNews(page);
    const card = newsCard(page, 0), key = await keyOf(card);
    await clickNews(page, card, "photo", field(key, "photo", "cover"));
    await expect(panel(page, "details")).toHaveCount(0);
    await closeDialog(page);
    await clickNews(page, card, "details", field(key, "details", "title"));
    await dialog(page).locator(":focus").fill("Click to field typed title");
    await closeDialog(page);
    await expect.poll(() => nodeText(card, field(key, "details", "title"))).toBe("Click to field typed title");
    await clickNews(page, card, "details", field(key, "details", "title"));
    expect(await dialog(page).locator(":focus").inputValue()).toBe("Click to field typed title");
  });

  test("a click away from any field, the footer Edit and the keyboard open the article's Details with no field focused", async ({ page }) => {
    await openNews(page);
    const card = newsCard(page, 0);
    const away = await pointAwayFromFields(card, NEWS_BOX);
    await page.mouse.click(away.x, away.y);
    await expect(panel(page, "details")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);
    await card.locator("[data-preview-edit]").click();
    await expect(panel(page, "details")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await closeDialog(page);
    await card.locator("[data-preview-button]").evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "details")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("every stamp in every card is on that card's own shown nodes", async ({ page }) => {
    await openNews(page);
    const total = await page.locator("[data-news-card]").count();
    for (let nth = 0; nth < total; nth += 1) {
      const card = newsCard(page, nth), key = await keyOf(card);
      await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      if (await card.locator("[data-preview-button]").count() === 0) continue;
      await expect.poll(() => card.locator("[data-edit-target]").count(), { timeout: 15_000 }).toBeGreaterThan(0);
      const nodes = await card.evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
        id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none" && !node.closest("[hidden]"),
      })));
      expect(nodes.length).toBeGreaterThan(0);
      for (const node of nodes) { expect(node.id?.includes(`.row:${key}.`), `${node.id} on ${key}`).toBe(true); expect(node.shown, `${node.id} is shown`).toBe(true); }
    }
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the cover photo's section and focuses it", async ({ page }) => {
      await openNews(page);
      const card = newsCard(page, 0), key = await keyOf(card), target = field(key, "photo", "cover");
      const { x, y } = await pointIn(card, stamped(target), NEWS_BOX);
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, "photo")).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe(target);
    });
  });
});

/* ---------------------------------------------------------------- LIST-2: Rose City Sponsors */
const SPONSORS = { route: "/admin/sponsors" };
const strip = (page: Page) => pageCard(page, "carousel");
async function openSponsors(page: Page) {
  page.on("dialog", item => void item.accept());
  await page.goto(SPONSORS.route, { waitUntil: "domcontentloaded" });
  await expect(strip(page)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => strip(page).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}
/** Holds the strip still, the way a visitor who asks for reduced motion sees it, so a logo is under a known point. */
async function holdStrip(page: Page, offset: "first" | "clone") {
  await strip(page).evaluate((card, which) => {
    const track = card.querySelector<HTMLElement>(".sponsor-track");
    const set = card.querySelector<HTMLElement>(".sponsor-set");
    if (!track || !set) throw new Error("no strip");
    track.style.animation = "none";
    track.style.transform = which === "clone" ? `translateX(-${set.offsetWidth}px)` : "none";
  }, offset);
  await page.waitForTimeout(150);
}
const rowKey = (target: string) => target.slice(target.indexOf("row:") + 4, target.lastIndexOf("."));

test.describe("UI-PREVIEW-CLICK-LIST-2: Rose City Sponsors", () => {
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("a logo opens the dialog on that sponsor's logo control, in that sponsor's own row, and the mouse shows the outline", async ({ page }) => {
    await openSponsors(page);
    await holdStrip(page, "first");
    const card = strip(page);
    const ids = await card.locator(".sponsor-set").first().locator("img[data-edit-target]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
    expect(ids.length).toBeGreaterThan(0);
    const target = ids[0];
    const alt = await card.locator(stamped(target)).first().getAttribute("alt");
    const { x, y } = await pointIn(card, `.sponsor-set:first-of-type img${stamped(target)}`);
    await page.mouse.move(x, y);
    await expect(card.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "carousel")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
    const row = dialog(page).locator(`[data-sponsor-row="${rowKey(target)}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator(":focus")).toHaveAccessibleName(`Replace logo for ${alt}`);
  });

  test("every logo is stamped to its own sponsor, the clone set to the same sponsors as the real set, and a clone logo opens the same row", async ({ page }) => {
    await openSponsors(page);
    const card = strip(page);
    const sets = await card.locator(".sponsor-set").evaluateAll(nodes => nodes.map(node => ({ hidden: node.getAttribute("aria-hidden"), ids: Array.from(node.querySelectorAll("img")).map(img => img.getAttribute("data-edit-target")) })));
    expect(sets).toHaveLength(2);
    expect(sets[0].hidden).toBeNull();
    expect(sets[1].hidden).toBe("true");
    expect(sets[0].ids.length).toBeGreaterThan(0);
    expect(sets[1].ids).toEqual(sets[0].ids);
    expect(new Set(sets[0].ids).size).toBe(sets[0].ids.length);
    for (const id of sets[0].ids) expect(id).toMatch(/^sponsors\.carousel\.row:[A-Za-z0-9_-]+\.logo$/);
    await holdStrip(page, "clone");
    const target = sets[1].ids[0] as string;
    const { x, y } = await pointIn(card, `.sponsor-set[aria-hidden="true"] img${stamped(target)}`);
    await page.mouse.click(x, y);
    await expect(panel(page, "carousel")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(`[data-sponsor-row="${rowKey(target)}"] :focus`)).toHaveCount(1);
  });

  test("the strip's heading, a click away, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
    await openSponsors(page);
    const card = strip(page);
    expect(await card.locator("h2[data-edit-target]").count()).toBe(0);
    await card.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const heading = (await card.locator(".partners > h2").boundingBox())!;
    expect(heading).not.toBeNull();
    await page.mouse.click(heading.x + heading.width / 2, heading.y + heading.height / 2);
    await expect(panel(page, "carousel")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await closeDialog(page);
    await card.getByRole("button", { name: /^Edit .* section$/ }).click();
    await expect(panel(page, "carousel")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
    await closeDialog(page);
    await card.locator("[data-preview-button]").evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "carousel")).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the sponsors and focuses the clicked logo's control", async ({ page }) => {
      await openSponsors(page);
      await holdStrip(page, "first");
      const card = strip(page);
      const target = await card.locator(".sponsor-set").first().locator("img[data-edit-target]").first().getAttribute("data-edit-target") as string;
      const { x, y } = await pointIn(card, `.sponsor-set:first-of-type img${stamped(target)}`);
      await page.mouse.click(x, y);
      await expect(dialog(page)).toHaveAttribute("data-view", "section");
      await expect(panel(page, "carousel")).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe(target);
    });
  });
});
