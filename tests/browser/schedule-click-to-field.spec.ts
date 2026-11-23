import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-SCHEDULE: on /admin/schedule (Rose City) a click on a field inside a match card's thumbnail opens THAT
 * match's dialog on the section holding the field (Match, Result and stream, Match summary, Presented by) with the control
 * focused and ringed; a click on the card's blank area, the Edit button and the keyboard open the match on Match with no field.
 * Nothing here saves: edits are typed into the unsaved draft and die with the page, which is left through its unsaved-changes
 * prompt (accepted). Same env as the other click specs, see playwright.schedule-click.config.ts.
 */
const cards = (page: Page) => page.locator("[data-match-card]");
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const stamped = (target: string) => `[data-edit-target="${target}"]`;
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);
const flashing = (page: Page) => dialog(page).locator("[data-edit-target-flash]");
const target = (key: string, section: string, field: string) => `schedule.${section}.row:${key.replace(/[^A-Za-z0-9_-]/g, "_")}.${field}`;

async function open(page: Page) {
  page.on("dialog", item => void item.accept());
  await page.goto("/admin/schedule", { waitUntil: "domcontentloaded" });
  await expect(cards(page).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => cards(page).first().locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}
const keyOf = (card: Locator) => card.getAttribute("data-match-card") as Promise<string>;

/** Viewport point at the centre of the part of a stamped preview node that shows inside its card's box. */
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
const shown = (card: Locator, id: string) => card.locator(stamped(id)).first().evaluate(node => (node.textContent ?? "").replace(/\s+/g, " ").trim());
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
/** A click on a stamped node opens its own dialog section with that field focused and ringed. Returns the focused control's id. */
async function clickField(page: Page, card: Locator, section: string, id: string) {
  const { x, y } = await pointIn(card, stamped(id));
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(id);
  await expect(dialog(page).locator(`[data-edit-target-flash]${stamped(id)}`)).toHaveCount(1);
}
/** A card that has a played result, by its stamped result cell. */
async function playedCard(page: Page) {
  const all = await cards(page).all();
  for (const card of all) if ((await card.locator(".fixture-result strong").count()) > 0) return card;
  throw new Error("no played match in the seed");
}
async function anyCard(page: Page) {
  const all = await cards(page).all();
  for (const card of all) if ((await card.locator(".fixture-result strong").count()) === 0) return card;
  throw new Error("no upcoming match in the seed");
}

test("a click on a card's fields opens that match on the section holding the field, focused and ringed", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  await clickField(page, card, "match", target(key, "match", "opponent"));
  expect(await page.locator(`#match-opponent`).inputValue()).toBe(await shown(card, target(key, "match", "opponent")));
  await closeDialog(page);
  await clickField(page, card, "match", target(key, "match", "venue"));
  await closeDialog(page);
  await clickField(page, card, "match", target(key, "match", "date"));
  await closeDialog(page);
  await clickField(page, card, "match", target(key, "match", "time"));
  await closeDialog(page);
  await clickField(page, card, "match", target(key, "match", "homeAway"));
  await closeDialog(page);
  await clickField(page, card, "result", target(key, "result", "clubScore"));
  await closeDialog(page);
  await clickField(page, card, "result", target(key, "result", "replayVideo"));
  await closeDialog(page);
  await clickField(page, card, "summary", target(key, "summary", "timeline"));
});

test("the result cell focuses the first score, which holds the number the card shows", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  const score = (await shown(card, target(key, "result", "clubScore"))).match(/(\d+)-(\d+)/)!;
  await clickField(page, card, "result", target(key, "result", "clubScore"));
  expect(await page.locator("#match-club-score").inputValue()).toBe(score[1]);
});

test("a click on another card opens that card's match (keyed by the match, not the list position)", async ({ page }) => {
  await open(page);
  const all = await cards(page).all();
  expect(all.length).toBeGreaterThan(2);
  for (const card of [all[all.length - 1], all[1], all[0]]) {
    const key = await keyOf(card);
    await clickField(page, card, "match", target(key, "match", "opponent"));
    expect(await page.locator("#match-opponent").inputValue()).toBe(await shown(card, target(key, "match", "opponent")));
    expect(await dialog(page).locator("[data-edit-target]").evaluateAll((nodes, row) => nodes.every(node => node.getAttribute("data-edit-target")!.includes(`.row:${row}.`)), key.replace(/[^A-Za-z0-9_-]/g, "_"))).toBe(true);
    await closeDialog(page);
  }
});

test("Edit, the keyboard and a click on blank card space open the match on Match with no field", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  await card.locator(`[data-match-edit="${key}"]`).click();
  await expect(panel(page, "match")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(flashing(page)).toHaveCount(0);
  await closeDialog(page);
  await card.locator("[data-preview-button], button[aria-label^='Edit match']").first().evaluate(button => (button as HTMLElement).focus());
  await page.keyboard.press("Enter");
  await expect(panel(page, "match")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(flashing(page)).toHaveCount(0);
  await closeDialog(page);
  // A point inside the thumb that no stamped node covers.
  const blank = await card.evaluate(element => {
    const box = element.querySelector("[data-preview-box]")!.getBoundingClientRect();
    const rects = Array.from(element.querySelectorAll("[data-edit-target]")).map(node => node.getBoundingClientRect());
    for (let y = box.top + 3; y < box.bottom - 3; y += 4) for (let x = box.left + 3; x < box.right - 3; x += 4) {
      if (!rects.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return { x, y };
    }
    return null;
  });
  expect(blank).not.toBeNull();
  await page.mouse.click(blank!.x, blank!.y);
  await expect(panel(page, "match")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(flashing(page)).toHaveCount(0);
});

test("the Match Summary link opens the summary on its first list, and rows typed into the unsaved draft are keyed by match and index", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  await clickField(page, card, "summary", target(key, "summary", "timeline"));
  const group = panel(page, "summary").locator(stamped(target(key, "summary", "timeline")));
  await expect(group).toHaveCount(1);
  await group.getByRole("button", { name: "Add timeline entry" }).click();
  await group.getByRole("button", { name: "Add timeline entry" }).click();
  const minute = (index: number) => panel(page, "summary").locator(stamped(`schedule.summary.row:${key}-${index}.eventMinute`));
  await expect(minute(0)).toHaveCount(1);
  await expect(minute(1)).toHaveCount(1);
  await minute(1).fill("77'");
  await closeDialog(page);
  // Reopened from the card, focus lands on the first list's first control: now the first row's Minute.
  const { x, y } = await pointIn(card, stamped(target(key, "summary", "timeline")));
  await page.mouse.click(x, y);
  await expect(panel(page, "summary")).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(`schedule.summary.row:${key}-0.eventMinute`);
  expect(await page.evaluate(() => document.activeElement?.closest("fieldset[data-edit-target]")?.getAttribute("data-edit-target"))).toBe(target(key, "summary", "timeline"));
});

test("the sponsor strip and the league cell open Presented by and Match", async ({ page }) => {
  await open(page);
  for (const card of await cards(page).all()) {
    const key = await keyOf(card);
    if ((await card.locator(`.match-sponsor img`).count()) > 0) {
      await clickField(page, card, "sponsor", target(key, "sponsor", "logo"));
      await closeDialog(page);
      break;
    }
  }
  for (const card of await cards(page).all()) {
    const key = await keyOf(card);
    const hasLogo = (await card.locator(".fixture-league img").count()) > 0;
    // The centre of the cell is the logo when there is one, else the competition text (or its dash).
    await clickField(page, card, "match", target(key, "match", hasLogo ? "leagueLogo" : "competition"));
    return;
  }
});

test("hovering a field outlines it for a mouse; leaving clears it", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  const { x, y } = await pointIn(card, stamped(target(key, "match", "opponent")));
  await page.mouse.move(x, y);
  const outline = card.locator("[data-field-hover]");
  await expect(outline).toBeVisible();
  expect(await outline.getAttribute("data-target")).toBe(target(key, "match", "opponent"));
  await page.mouse.move(0, 0);
  await expect(outline).toBeHidden();
});

test("an unplayed card's Watch on YouTube cell opens Result on the stream link", async ({ page }) => {
  await open(page);
  const card = await anyCard(page), key = await keyOf(card);
  await clickField(page, card, "result", target(key, "result", "replayVideo"));
});

test("a typed edit keeps its field after a re-render and never reaches another match", async ({ page }) => {
  await open(page);
  const card = await playedCard(page), key = await keyOf(card);
  await clickField(page, card, "match", target(key, "match", "opponent"));
  await page.locator("#match-opponent").fill("Typed Opponent FC");
  await closeDialog(page);
  await expect.poll(() => shown(card, target(key, "match", "opponent"))).toBe("Typed Opponent FC");
  await clickField(page, card, "match", target(key, "match", "venue"));
  const others = await cards(page).evaluateAll((nodes, own) => nodes.filter(node => node.getAttribute("data-match-card") !== own).map(node => node.textContent ?? ""), key);
  expect(others.some(text => text.includes("Typed Opponent FC"))).toBe(false);
});
