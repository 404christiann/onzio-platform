import { expect, test, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-VISITOR-2 and -3: on /admin/foothill-transit, /admin/chick-fil-a, /admin/tickets, /admin/season-membership and
 * /admin/know-before-you-go a click on a field inside a
 * card's preview opens that card's dialog with the field's control focused and ringed. Nothing here saves: any rows these
 * need are typed into the unsaved draft, and every test throws the draft and its browser recovery copy away.
 */
const card = (page: Page, section: string) => page.locator(`[data-preview-card="${section}"]`);
const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);

async function clearDraft(page: Page, keyPrefix: string) {
  await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key)), keyPrefix).catch(() => undefined);
}

/** Opens the route and waits until the first card's preview has been stamped. */
async function ready(page: Page, route: string, firstCard: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(card(page, firstCard)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => card(page, firstCard).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(0);
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

/** What the preview shows in a stamped node (its text, not its CSS-transformed rendering). */
const nodeText = (page: Page, section: string, target: string) => card(page, section).locator(`[data-edit-target="${target}"]`).first().evaluate(node => (node.textContent ?? "").replace(/\s+/g, " ").trim());

/** Types a value into the stamped field's control in the dialog if it is empty (never saved), growing the list with `addName` first. */
async function ensureField(page: Page, section: string, sectionTitle: string, target: string, value: string, addName?: string) {
  if (!(await dialog(page).count())) {
    await card(page, section).getByRole("button", { name: `Edit ${sectionTitle} section` }).click();
    await expect(panel(page, section)).toBeVisible();
  }
  const field = panel(page, section).locator(`[data-edit-target="${target}"]`);
  for (let attempt = 0; attempt < 12 && !(await field.count()) && addName; attempt++) await panel(page, section).getByRole("button", { name: addName, exact: true }).click();
  const control = field.locator("input, textarea").first();
  await expect(control).toBeVisible();
  if (!(await control.inputValue())) await control.fill(value);
}
async function closeDialog(page: Page, section: string, target: string) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => card(page, section).locator(`[data-edit-target="${target}"]`).count()).toBeGreaterThan(0);
}

const ROUTES = [
  { name: "Foothill Transit", route: "/admin/foothill-transit", keyPrefix: "onzio:stadium:", first: "heading", heading: { section: "heading", title: "Page heading", target: "foothill.heading.title", label: "Page heading" } },
  { name: "Chick-fil-A", route: "/admin/chick-fil-a", keyPrefix: "onzio:chick-fil-a:", first: "heading", heading: { section: "heading", title: "Page heading", target: "chickFilA.heading.title", label: "Page heading" } },
  { name: "Tickets", route: "/admin/tickets", keyPrefix: "onzio:tickets:", first: "page", heading: { section: "page", title: "Page and purchase link", target: "tickets.page.title", label: "Page heading" } },
  { name: "Season Ticket Membership", route: "/admin/season-membership", keyPrefix: "onzio:season-membership:", first: "heading", heading: { section: "heading", title: "Page heading", target: "seasonMembership.heading.title", label: "Title" } },
  { name: "Know Before You Go", route: "/admin/know-before-you-go", keyPrefix: "onzio:know-before-you-go:", first: "heading", heading: { section: "heading", title: "Page heading", target: "knowBeforeYouGo.heading.title", label: "Title" } },
] as const;

for (const spec of ROUTES) {
  const { heading } = spec;
  test.describe(`UI-PREVIEW-CLICK-VISITOR-2/3: click a ${spec.name} preview field to edit it`, () => {
    test.beforeEach(async ({ page }) => {
      page.on("dialog", item => void item.accept());
      await ready(page, spec.route, spec.first);
    });
    test.afterEach(async ({ page }) => {
      await clearDraft(page, spec.keyPrefix);
      await page.goto("about:blank");
    });

    test("the heading title opens its card with the field focused and ringed, and the mouse shows the field outline", async ({ page }) => {
      const { x, y } = await fieldPoint(page, heading.section, heading.target);
      await page.mouse.move(x, y);
      await expect(card(page, heading.section).locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", heading.target);
      await page.mouse.click(x, y);
      await expect(panel(page, heading.section)).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe(heading.target);
      await expect(dialog(page).locator(":focus")).toHaveAccessibleName(heading.label);
      await expect(dialog(page).locator(`[data-edit-target="${heading.target}"]`)).toHaveAttribute("data-edit-target-flash", "");
      await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
    });

    test("a click away from any field, the footer Edit and the keyboard open the card with no field focused", async ({ page }) => {
      await card(page, heading.section).evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      const box = (await card(page, heading.section).locator("[data-preview-box]").boundingBox())!;
      await page.mouse.click(box.x + box.width - 4, box.y + box.height - 4);
      await expect(panel(page, heading.section)).toBeVisible();
      await page.waitForTimeout(400);
      expect(await focusedTarget(page)).toBeNull();
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);

      await card(page, heading.section).getByRole("button", { name: `Edit ${heading.title} section` }).click();
      await expect(panel(page, heading.section)).toBeVisible();
      await page.waitForTimeout(400);
      expect(await focusedTarget(page)).toBeNull();
      await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toHaveCount(0);

      await card(page, heading.section).getByRole("button", { name: `Edit ${heading.title}`, exact: true }).evaluate(button => (button as HTMLButtonElement).focus());
      await page.keyboard.press("Enter");
      await expect(panel(page, heading.section)).toBeVisible();
      await page.waitForTimeout(400);
      expect(await focusedTarget(page)).toBeNull();
    });

    test.describe("phone", () => {
      test.use({ viewport: { width: 390, height: 844 } });
      test("the sheet opens on the field's section and focuses it", async ({ page }) => {
        const { x, y } = await fieldPoint(page, heading.section, heading.target);
        await page.mouse.click(x, y);
        await expect(dialog(page)).toHaveAttribute("data-view", "section");
        await expect(panel(page, heading.section)).toBeVisible();
        await expect.poll(() => focusedTarget(page)).toBe(heading.target);
        await expect(dialog(page).locator(":focus")).toHaveAccessibleName(heading.label);
      });
    });
  });
}

/** The ids of one field on every row of a list in the open dialog's section, in row order (the list grows with `addName` until it has `count`). */
async function rowTargetsInDialog(page: Page, section: string, sectionTitle: string, field: string, count: number, addName: string) {
  if (!(await dialog(page).count())) {
    await card(page, section).getByRole("button", { name: `Edit ${sectionTitle} section` }).click();
    await expect(panel(page, section)).toBeVisible();
  }
  const fields = panel(page, section).locator(`[data-edit-target*=".row:"][data-edit-target$=".${field}"]`);
  for (let attempt = 0; attempt < 12 && (await fields.count()) < count; attempt++) await panel(page, section).getByRole("button", { name: addName, exact: true }).click();
  expect(await fields.count()).toBeGreaterThanOrEqual(count);
  return fields.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-edit-target") as string));
}

/** Clicks the preview node of a row's field and checks the dialog opened its own section with that row's control focused, holding the text the node shows. */
async function clickRowField(page: Page, section: string, target: string, name: string | RegExp) {
  await closeDialog(page, section, target);
  const shown = await nodeText(page, section, target);
  const { x, y } = await fieldPoint(page, section, target);
  await page.mouse.click(x, y);
  await expect(panel(page, section)).toBeVisible();
  await expect.poll(() => focusedTarget(page)).toBe(target);
  await expect(dialog(page).locator(":focus")).toHaveAccessibleName(name);
  expect(shown).not.toBe("");
  expect(await dialog(page).locator(":focus").inputValue()).toBe(shown);
}

test.describe("UI-PREVIEW-CLICK-VISITOR-2/3: list rows open their own row's field", () => {
  test.afterEach(async ({ page }) => {
    for (const spec of ROUTES) await clearDraft(page, spec.keyPrefix);
    await page.goto("about:blank");
  });

  test("Foothill Transit: the second benefit's title", async ({ page }) => {
    await ready(page, "/admin/foothill-transit", "heading");
    await ensureField(page, "benefits", "Ticket benefits", "foothill.benefits.row:0.title", "Click to field benefit one", "Add benefit");
    await ensureField(page, "benefits", "Ticket benefits", "foothill.benefits.row:1.title", "Click to field benefit two", "Add benefit");
    await closeDialog(page, "benefits", "foothill.benefits.row:1.title");
    const shown = await nodeText(page, "benefits", "foothill.benefits.row:1.title");
    const { x, y } = await fieldPoint(page, "benefits", "foothill.benefits.row:1.title");
    await page.mouse.click(x, y);
    await expect(panel(page, "benefits")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("foothill.benefits.row:1.title");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    // The control that took focus holds the very text the clicked node shows (and the other row's text is different).
    expect(shown).not.toBe("");
    expect(await dialog(page).locator(":focus").inputValue()).toBe(shown);
  });

  test("Chick-fil-A: the second step's label", async ({ page }) => {
    await ready(page, "/admin/chick-fil-a", "heading");
    await ensureField(page, "steps", "Three steps", "chickFilA.steps.row:1.label", "Click to field step two");
    await closeDialog(page, "steps", "chickFilA.steps.row:1.label");
    const shown = await nodeText(page, "steps", "chickFilA.steps.row:1.label");
    const { x, y } = await fieldPoint(page, "steps", "chickFilA.steps.row:1.label");
    await page.mouse.click(x, y);
    await expect(panel(page, "steps")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("chickFilA.steps.row:1.label");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Label");
    expect(shown).not.toBe("");
    expect(await dialog(page).locator(":focus").inputValue()).toBe(shown);
  });

  test("Tickets: the second benefit's title, in the Ticket includes card (the card's hidden sections are not clickable)", async ({ page }) => {
    await ready(page, "/admin/tickets", "page");
    await ensureField(page, "includes", "Ticket includes", "tickets.includes.row:0.title", "Click to field benefit one", "Add benefit");
    await ensureField(page, "includes", "Ticket includes", "tickets.includes.row:1.title", "Click to field benefit two", "Add benefit");
    await closeDialog(page, "includes", "tickets.includes.row:1.title");
    const shown = await nodeText(page, "includes", "tickets.includes.row:1.title");
    const { x, y } = await fieldPoint(page, "includes", "tickets.includes.row:1.title");
    await page.mouse.click(x, y);
    await expect(panel(page, "includes")).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("tickets.includes.row:1.title");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Title");
    // The control that took focus holds the very text the clicked node shows (and the other row's text is different).
    expect(shown).not.toBe("");
    expect(await dialog(page).locator(":focus").inputValue()).toBe(shown);
  });

  test("Tickets: every stamp in every card is on that card's own visible section (none on a node the card's CSS hides)", async ({ page }) => {
    await ready(page, "/admin/tickets", "page");
    for (const section of ["page", "perks", "includes", "transit", "directions"]) {
      const stamped = await card(page, section).evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
        id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden]"),
      })));
      for (const node of stamped) {
        expect(node.id?.startsWith(`tickets.${section}.`), `${node.id} is stamped in the ${section} card`).toBe(true);
        expect(node.shown, `${node.id} is shown in the ${section} card`).toBe(true);
      }
    }
  });
  test("Season Ticket Membership: the second price row's price, keyed by the row's id", async ({ page }) => {
    await ready(page, "/admin/season-membership", "heading");
    const targets = await rowTargetsInDialog(page, "pricing", "Price table", "price0", 2, "Add seating section");
    const target = targets[1];
    expect(target).toMatch(/^seasonMembership\.pricing\.row:seat-[a-z0-9-]+\.price0$/);
    const control = panel(page, "pricing").locator(`[data-edit-target="${target}"] input`);
    if (!(await control.inputValue())) await control.fill("$99");
    await clickRowField(page, "pricing", target, /^Full season per match price.*seating section 2$/);
  });

  test("Season Ticket Membership: the second benefit's label, keyed by the benefit's id", async ({ page }) => {
    await ready(page, "/admin/season-membership", "heading");
    const targets = await rowTargetsInDialog(page, "benefits", "Member Benefits", "label", 2, "Add benefit");
    const target = targets[1];
    expect(target).toMatch(/^seasonMembership\.benefits\.row:benefit-[a-z0-9-]+\.label$/);
    const control = panel(page, "benefits").locator(`[data-edit-target="${target}"] input`);
    if (!(await control.inputValue())) await control.fill("Click to field benefit two");
    await clickRowField(page, "benefits", target, "Label");
  });

  test("Know Before You Go: the second match-day tile's label, keyed by the tile's id", async ({ page }) => {
    await ready(page, "/admin/know-before-you-go", "heading");
    const targets = await rowTargetsInDialog(page, "facts", "Match-day tiles", "label", 2, "Add tile");
    const target = targets[1];
    expect(target).toMatch(/^knowBeforeYouGo\.facts\.row:tile-[a-z0-9-]+\.label$/);
    const control = panel(page, "facts").locator(`[data-edit-target="${target}"] input`);
    if (!(await control.inputValue())) await control.fill("Click to field tile two");
    await clickRowField(page, "facts", target, "Label");
  });

  for (const { name, route, editor, sections } of [
    { name: "Season Ticket Membership", route: "/admin/season-membership", editor: "seasonMembership", sections: ["heading", "intro", "pricing", "button", "benefits", "closing"] },
    { name: "Know Before You Go", route: "/admin/know-before-you-go", editor: "knowBeforeYouGo", sections: ["heading", "match", "facts", "raffle", "donor"] },
  ]) {
    test(`${name}: every stamp in every card is on that card's own shown section (none on a node the card's CSS hides)`, async ({ page }) => {
      await ready(page, route, "heading");
      let stampedTotal = 0;
      for (const section of sections) {
        const stamped = await card(page, section).evaluate(element => Array.from(element.querySelectorAll("[data-edit-target]")).map(node => ({
          id: node.getAttribute("data-edit-target"), shown: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[hidden]"),
        })));
        stampedTotal += stamped.length;
        for (const node of stamped) {
          expect(node.id?.startsWith(`${editor}.${section}.`), `${node.id} is stamped in the ${section} card`).toBe(true);
          expect(node.shown, `${node.id} is shown in the ${section} card`).toBe(true);
        }
      }
      expect(stampedTotal).toBeGreaterThan(0);
    });
  }
});
