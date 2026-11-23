import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES: on Rose City's /admin/about, /admin/contact and /admin/policies a click on a field inside a
 * card's live preview opens that card's dialog with the field's control focused and ringed. Nothing here saves: every edit is typed
 * into the unsaved draft (About keeps no browser copy; Contact and Policies' recovery copies are thrown away after each test) and no
 * test presses Save. Config: playwright.about-contact-policies.config.ts.
 */
const CONTACT_KEY = "onzio:cinematic-contact:", POLICIES_KEY = "onzio:cinematic-policies:";

const card = (page: Page, id: string) => page.locator(`[data-preview-card="${id}"]`);
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const stamped = (target: string) => `[data-edit-target="${target}"]`;
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);

async function clearDraft(page: Page, prefix: string) {
  await page.evaluate(key => Object.keys(localStorage).filter(name => name.startsWith(key)).forEach(name => localStorage.removeItem(name)), prefix).catch(() => undefined);
}
async function open(page: Page, route: string, firstCard: string) {
  page.on("dialog", item => void item.accept());
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(card(page, firstCard)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => card(page, firstCard).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
}
/** Like open, for a card that has nothing stamped yet (an empty section). */
async function openBare(page: Page, route: string, firstCard: string) {
  page.on("dialog", item => void item.accept());
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(card(page, firstCard)).toBeVisible({ timeout: 60_000 });
  await expect(card(page, firstCard).locator("[data-preview-box][data-preview-mounted='true']")).toBeVisible({ timeout: 30_000 });
}
async function pointIn(cardNode: Locator, selector: string) {
  await cardNode.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await cardNode.page().waitForTimeout(250);
  const point = await cardNode.evaluate((element, css) => {
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
const nodeText = (cardNode: Locator, target: string) => cardNode.locator(stamped(target)).first().evaluate(node => (node.textContent ?? "").replace(/\s+/g, " ").trim());
async function typeInto(page: Page, section: string, target: string, value: string) {
  const control = panel(page, section).locator(`${stamped(target)} input, ${stamped(target)} textarea`).first();
  await expect(control).toBeVisible();
  await control.fill(value);
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
/** Opens a card by its footer button (no field), so edits can be typed. */
async function openByEdit(page: Page, title: string, section: string) {
  await page.getByRole("button", { name: `Edit ${title} section`, exact: true }).click();
  await expect(panel(page, section)).toBeVisible();
  await page.waitForTimeout(300);
}
/** The targets in the open dialog panel that end with `.field`, in order. */
const targetsIn = (page: Page, section: string, prefix: string, field: string) =>
  panel(page, section).locator(`[data-edit-target^="${prefix}"][data-edit-target$=".${field}"]`).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));

/** A click on a stamped node opens its own dialog section with that field focused, ringed, holding the text the node shows. */
async function clickField(page: Page, cardNode: Locator, section: string, target: string, options: { name?: string | RegExp; contains?: boolean } = {}) {
  const shown = await nodeText(cardNode, target);
  const { x, y } = await pointIn(cardNode, stamped(target));
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(target);
  await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
  if (options.name) await expect(dialog(page).locator(":focus")).toHaveAccessibleName(options.name);
  const value = await dialog(page).locator(":focus").inputValue();
  expect(shown).not.toBe("");
  if (options.contains) expect(shown).toContain(value); else expect(value).toBe(shown);
  return value;
}
/** The three ways to open a card that must NOT focus a field: a click on nothing, the footer Edit, the keyboard. */
async function opensWithoutField(page: Page, cardId: string, title: string, section: string) {
  const cardNode = card(page, cardId);
  await cardNode.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = (await cardNode.locator("[data-preview-box]").boundingBox())!;
  await page.mouse.click(box.x + box.width - 3, box.y + box.height - 3);
  await expect(panel(page, section)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await focusedTarget(page)).toBeNull();
  await closeDialog(page);
  await cardNode.getByRole("button", { name: `Edit ${title} section`, exact: true }).click();
  await expect(panel(page, section)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await focusedTarget(page)).toBeNull();
  await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
  await closeDialog(page);
  await cardNode.getByRole("button", { name: `Edit ${title}`, exact: true }).evaluate(button => (button as HTMLButtonElement).focus());
  await page.keyboard.press("Enter");
  await expect(panel(page, section)).toBeVisible();
  await page.waitForTimeout(400);
  expect(await focusedTarget(page)).toBeNull();
  await closeDialog(page);
}
/** Every stamp in every listed card is on that card's own, shown section (none on a node the card's CSS hides). */
async function stampsAreOwn(page: Page, editor: string, sections: string[], own: (section: string) => string = section => `${editor}.${section}.`) {
  for (const section of sections) {
    await card(page, section).scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const found = await card(page, section).evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
        id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden]"),
      })));
      if (!found.length) return ["no stamps yet"];
      return found.filter(node => !node.id?.startsWith(own(section)) || !node.shown).map(node => `${node.id} (${node.shown ? "other section" : "hidden"})`);
    }, { message: `stamps in the ${section} card`, timeout: 15_000 }).toEqual([]);
  }
}

/* ---------------------------------------------------------------- About */
const ABOUT = "/admin/about";

test.describe("About and Club Logo", () => {
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("the Page heading card: a click on the heading opens the field focused and ringed, and the mouse shows the field outline", async ({ page }) => {
    await openBare(page, ABOUT, "hero");
    await openByEdit(page, "Page heading", "hero");
    await typeInto(page, "hero", "about.hero.heading", "Click to field heading");
    await closeDialog(page);
    await expect.poll(() => card(page, "hero").locator(stamped("about.hero.heading")).count()).toBe(1);
    const cardNode = card(page, "hero"), target = "about.hero.heading";
    const { x, y } = await pointIn(cardNode, stamped(target));
    await page.mouse.move(x, y);
    await expect(cardNode.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "hero")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Page heading");
    await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
    expect(await dialog(page).locator(":focus").inputValue()).toBe("Click to field heading");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("a click away from any field, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
    await openBare(page, ABOUT, "hero");
    await opensWithoutField(page, "hero", "Page heading", "hero");
  });

  test("Story: a paragraph on the card opens its own paragraph control (paragraphs are keyed by position)", async ({ page }) => {
    await open(page, ABOUT, "story");
    const targets = await card(page, "story").locator('[data-edit-target^="about.story.row:"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
    expect(targets.length).toBeGreaterThan(1);
    const target = targets[1];
    expect(target).toBe("about.story.row:1.paragraph");
    await clickField(page, card(page, "story"), "story", target, { name: "Story paragraphs, paragraph 2" });
    await closeDialog(page);
    await clickField(page, card(page, "story"), "story", targets[0], { name: "Story paragraphs, paragraph 1" });
  });

  test("Values: a click opens that card's own title, and after a move the same card (by its id) is still the one that opens", async ({ page }) => {
    await open(page, ABOUT, "values");
    const titles = await card(page, "values").locator('[data-edit-target$=".title"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
    expect(titles.length).toBeGreaterThan(1);
    const b = titles[1];
    const shownB = await nodeText(card(page, "values"), b);
    expect(await clickField(page, card(page, "values"), "values", b, { name: "Title" })).toBe(shownB);
    // Move B earlier in the dialog: B's card id does not change, so its node on the page is still B's.
    await panel(page, "values").getByRole("button", { name: "Move value 2 earlier" }).click();
    await closeDialog(page);
    await expect.poll(() => card(page, "values").locator('[data-edit-target$=".title"]').first().getAttribute("data-edit-target")).toBe(b);
    expect(await nodeText(card(page, "values"), b)).toBe(shownB);
    expect(await clickField(page, card(page, "values"), "values", b, { name: "Title" })).toBe(shownB);
  });

  test("Closing: the closing text and the button's words each open their own control", async ({ page }) => {
    await openBare(page, ABOUT, "closing");
    await openByEdit(page, "Closing", "closing");
    await typeInto(page, "closing", "about.closing.text", "Click to field closing");
    await typeInto(page, "closing", "about.closing.buttonLabel", "Click to field button");
    await closeDialog(page);
    await expect.poll(() => card(page, "closing").locator("[data-edit-target]").count()).toBeGreaterThan(0);
    await clickField(page, card(page, "closing"), "closing", "about.closing.text", { name: "Closing text" });
    await closeDialog(page);
    await clickField(page, card(page, "closing"), "closing", "about.closing.buttonLabel", { name: "Button text" });
  });

  test("Club Logo page: a crest feature and a color card open their own controls", async ({ page }) => {
    await openBare(page, ABOUT, "hero");
    await page.getByRole("button", { name: "Club Logo page", exact: true }).click();
    await expect(card(page, "features")).toBeVisible();
    await expect.poll(() => card(page, "features").locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const titles = await card(page, "features").locator('[data-edit-target$=".title"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
    expect(await clickField(page, card(page, "features"), "features", titles[0], { name: "Title" })).toBe(await nodeText(card(page, "features"), titles[0]));
    await closeDialog(page);
    await expect.poll(() => card(page, "colors").locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await card(page, "colors").scrollIntoViewIfNeeded();
    const images = await card(page, "colors").locator('[data-edit-target$=".image"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
    const { x, y } = await pointIn(card(page, "colors"), stamped(images[1]));
    await page.mouse.click(x, y);
    await expect(panel(page, "colors")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(images[1]);
    await expect(dialog(page).locator(stamped(images[1]))).toHaveAttribute("data-edit-target-flash", "");
  });

  test("every stamp in every About and Club Logo card is on that card's own shown section (none on a node the card's CSS hides)", async ({ page }) => {
    await openBare(page, ABOUT, "hero");
    await openByEdit(page, "Page heading", "hero");
    await typeInto(page, "hero", "about.hero.heading", "Click to field heading");
    await closeDialog(page);
    await stampsAreOwn(page, "about", ["hero"]);
    await page.getByRole("button", { name: "Club Logo page", exact: true }).click();
    await stampsAreOwn(page, "about", ["images"]);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("a click on the heading opens the sheet on the field, focused and ringed", async ({ page }) => {
      await openBare(page, ABOUT, "hero");
      await openByEdit(page, "Page heading", "hero");
      await typeInto(page, "hero", "about.hero.heading", "Click to field heading");
      await page.locator("[data-editor-dialog-back]").first().click().catch(() => undefined);
      await closeDialog(page);
      await expect.poll(() => card(page, "hero").locator(stamped("about.hero.heading")).count()).toBe(1);
      await clickField(page, card(page, "hero"), "hero", "about.hero.heading");
      await page.screenshot({ path: "tmp/screens/about-phone-click-heading.png" });
    });
  });
});

/* ---------------------------------------------------------------- Contact */
const CONTACT = "/admin/contact";

test.describe("Contact", () => {
  test.afterEach(async ({ page }) => { await clearDraft(page, CONTACT_KEY); await page.goto("about:blank"); });

  test("the heading card: a click on the title opens the field focused and ringed, with the field outline on hover", async ({ page }) => {
    await open(page, CONTACT, "heading");
    const cardNode = card(page, "heading"), target = "contact.heading.title";
    const { x, y } = await pointIn(cardNode, stamped(target));
    await page.mouse.move(x, y);
    await expect(cardNode.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "heading")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("the subtitle and each row's words and button open that row's own control", async ({ page }) => {
    await open(page, CONTACT, "heading");
    await clickField(page, card(page, "heading"), "heading", "contact.heading.subtitle", { name: "Subtitle" });
    await closeDialog(page);
    for (const action of ["media", "tryouts", "tickets", "partnerships"]) {
      await clickField(page, card(page, action), action, `contact.${action}.prompt`, { name: "Row text" });
      await closeDialog(page);
      await clickField(page, card(page, action), action, `contact.${action}.action`, { name: "Button text" });
      await closeDialog(page);
    }
  });

  test("Information: the button (a link, or the grey Link pending box) opens its button text; its row text opens its row text", async ({ page }) => {
    await open(page, CONTACT, "information");
    await clickField(page, card(page, "information"), "information", "contact.information.action", { name: "Button text", contains: true });
    await closeDialog(page);
    await clickField(page, card(page, "information"), "information", "contact.information.prompt", { name: "Row text" });
  });

  test("a typed row text shows on the card and the click still opens that row's control", async ({ page }) => {
    await open(page, CONTACT, "tickets");
    await openByEdit(page, "Tickets", "tickets");
    await typeInto(page, "tickets", "contact.tickets.prompt", "Click to field ticket row");
    await closeDialog(page);
    await expect.poll(() => nodeText(card(page, "tickets"), "contact.tickets.prompt")).toBe("Click to field ticket row");
    expect(await clickField(page, card(page, "tickets"), "tickets", "contact.tickets.prompt", { name: "Row text" })).toBe("Click to field ticket row");
  });

  test("a click away from any field, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
    await open(page, CONTACT, "media");
    await opensWithoutField(page, "media", "Media", "media");
  });

  test("every stamp in every Contact card is on that card's own shown section (none on a node the card's CSS hides)", async ({ page }) => {
    await open(page, CONTACT, "heading");
    await stampsAreOwn(page, "contact", ["heading", "media", "tryouts", "tickets", "information", "partnerships"]);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("a click on the title opens the sheet on the field, focused and ringed", async ({ page }) => {
      await open(page, CONTACT, "heading");
      await clickField(page, card(page, "heading"), "heading", "contact.heading.title", { name: "Title" });
      await page.screenshot({ path: "tmp/screens/contact-phone-click-title.png" });
    });
  });
});

/* ---------------------------------------------------------------- Policies */
const POLICIES = "/admin/policies";
const rowCards = (page: Page) => page.locator('[data-preview-card^="row:"]');
/** Adds a row (unsaved), types its heading and answer lines, closes the dialog, and returns its dialog id. Blank strings stay blank lines. */
async function addRow(page: Page, heading: string, lines: string[]) {
  const before = await rowCards(page).count();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(rowCards(page)).toHaveCount(before + 1);
  const ids = await rowCards(page).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-preview-card") as string));
  const id = ids[ids.length - 1], row = id.slice(id.indexOf(":") + 1);
  await expect(panel(page, id)).toBeVisible();
  await typeInto(page, id, `policies.row.row:${row}.heading`, heading);
  for (let index = 0; index < lines.length; index += 1) await panel(page, id).getByRole("button", { name: "Add paragraph", exact: true }).click();
  for (let index = 0; index < lines.length; index += 1) if (lines[index]) await typeInto(page, id, `policies.row.row:${row}-l${index}.line`, lines[index]);
  await closeDialog(page);
  // A card mounts its preview only near the viewport, and only a mounted preview is stamped.
  await card(page, id).scrollIntoViewIfNeeded();
  await expect.poll(() => card(page, id).locator(stamped(`policies.row.row:${row}.heading`)).count()).toBe(1);
  return { id, row };
}

test.describe("Stadium Guidelines and Fan Code", () => {
  test.afterEach(async ({ page }) => { await clearDraft(page, POLICIES_KEY); await page.goto("about:blank"); });

  test("the page heading card: a click on the title opens the page section with the title focused and ringed, with the field outline on hover", async ({ page }) => {
    await open(page, POLICIES, "page");
    const cardNode = card(page, "page"), target = "policies.page.title";
    const { x, y } = await pointIn(cardNode, stamped(target));
    await page.mouse.move(x, y);
    await expect(cardNode.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", target);
    await page.mouse.click(x, y);
    await expect(panel(page, "page")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    await expect(dialog(page).locator(stamped(target))).toHaveAttribute("data-edit-target-flash", "");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("a row card: the heading and each answer line open that row's own controls; a blank line between them is skipped, not mismatched", async ({ page }) => {
    await open(page, POLICIES, "page");
    const { id, row } = await addRow(page, "Click to field row", ["Click to field first", "", "Click to field third"]);
    await clickField(page, card(page, id), id, `policies.row.row:${row}.heading`, { name: "Row heading" });
    await closeDialog(page);
    expect(await clickField(page, card(page, id), id, `policies.row.row:${row}-l2.line`, { name: "Line 3 paragraph" })).toBe("Click to field third");
    await closeDialog(page);
    expect(await clickField(page, card(page, id), id, `policies.row.row:${row}-l0.line`, { name: "Line 1 paragraph" })).toBe("Click to field first");
    expect(await card(page, id).locator(stamped(`policies.row.row:${row}-l1.line`)).count()).toBe(0);
  });

  test("two rows: each card opens its own row, never the other's", async ({ page }) => {
    await open(page, POLICIES, "page");
    const first = await addRow(page, "Click to field row one", ["One answer"]);
    const second = await addRow(page, "Click to field row two", ["Two answer"]);
    expect(first.id).not.toBe(second.id);
    await clickField(page, card(page, second.id), second.id, `policies.row.row:${second.row}.heading`, { name: "Row heading" });
    await expect(panel(page, first.id)).toHaveCount(0);
    await closeDialog(page);
    expect(await clickField(page, card(page, first.id), first.id, `policies.row.row:${first.row}-l0.line`, { name: "Line 1 paragraph" })).toBe("One answer");
  });

  test("the other page's rows work too: switching pages keeps each page's own cards", async ({ page }) => {
    await open(page, POLICIES, "page");
    await page.getByRole("group", { name: "Page to edit" }).getByRole("button", { name: /Fan Code/ }).click();
    await expect(card(page, "page")).toBeVisible();
    await expect.poll(() => card(page, "page").locator("[data-edit-target]").count()).toBeGreaterThan(0);
    await clickField(page, card(page, "page"), "page", "policies.page.title", { name: "Title" });
  });

  test("a click away from any field, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
    await open(page, POLICIES, "page");
    await opensWithoutField(page, "page", "Page heading", "page");
  });

  test("every stamp in the page card and every row card is on that card's own shown section (none on a node the card's CSS hides)", async ({ page }) => {
    await open(page, POLICIES, "page");
    const { id, row } = await addRow(page, "Click to field row", ["Click to field answer"]);
    await stampsAreOwn(page, "policies", ["page"]);
    await stampsAreOwn(page, "policies", [id], () => `policies.row.row:${row}`);
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("a click on a row's heading opens the sheet on the row, focused and ringed", async ({ page }) => {
      await open(page, POLICIES, "page");
      const { id, row } = await addRow(page, "Click to field row", ["Click to field answer"]);
      await clickField(page, card(page, id), id, `policies.row.row:${row}.heading`, { name: "Row heading" });
      await page.screenshot({ path: "tmp/screens/policies-phone-click-row.png" });
    });
  });
});

/* ---------------------------------------------------------------- desktop evidence */
test.describe("desktop 1280 screenshots (click, dialog open, field focused and ringed)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test.afterEach(async ({ page }) => { await clearDraft(page, CONTACT_KEY); await clearDraft(page, POLICIES_KEY); await page.goto("about:blank"); });
  test("Contact title", async ({ page }) => {
    await open(page, CONTACT, "heading");
    await clickField(page, card(page, "heading"), "heading", "contact.heading.title", { name: "Title" });
    await page.screenshot({ path: "tmp/screens/contact-desktop-click-title.png" });
  });
  test("Policies page title", async ({ page }) => {
    await open(page, POLICIES, "page");
    await clickField(page, card(page, "page"), "page", "policies.page.title", { name: "Title" });
    await page.screenshot({ path: "tmp/screens/policies-desktop-click-title.png" });
  });
  test("About story paragraph", async ({ page }) => {
    await open(page, ABOUT, "story");
    await clickField(page, card(page, "story"), "story", "about.story.row:0.paragraph", { name: "Story paragraphs, paragraph 1" });
    await page.screenshot({ path: "tmp/screens/about-desktop-click-paragraph.png" });
  });
});
