import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * UI-PREVIEW-CLICK-SHOP: on /admin/shop a pointer click on a field inside a Shop preview frame opens the dialog on the section that
 * holds the field, on the frame's own kit, with the control focused and ringed. Rose City (cinematic@2) shows every kit and the
 * shared sections as live frames; Diverse City's classic Shop shows one kit in one frame. A click with no field under it, the keyboard
 * and the chips beside the frames open the section as they always did. Nothing here saves: the Shop draft lives in the page, the
 * text typed to put a field on the page (a jersey option, a care line, a tile, a size chart, a map heading) dies with it, and the
 * dialogs only ever close. Config: playwright.shop-click.config.ts (Rose City on baseURL, Diverse City on SHOP_CLICK_DC_BASE_URL).
 */
const DIVERSE_CITY = process.env.SHOP_CLICK_DC_BASE_URL ?? "http://diverse-city.localhost:3230";

const HOME = "Home kit preview", AWAY = "Away kit preview", LEFT = "Purchase and jersey details preview", RIGHT = "Size chart, route map and partner strip preview";

const dialog = (page: Page) => page.locator("[data-editor-dialog]");
const panel = (page: Page, section: string) => dialog(page).locator(`[data-editor-dialog-panel="${section}"]`);
const stamped = (target: string) => `[data-edit-target="${target}"]`;
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);
const kitGroup = (page: Page, kit: string) => page.getByRole("group", { name: `Edit the ${kit} kit` });
const sharedChip = (page: Page, name: string) => page.getByRole("group", { name: "Edit shared sections" }).getByRole("button", { name, exact: true });

async function openShop(page: Page, base = "") {
  page.on("dialog", item => void item.accept());
  await page.goto(`${base}/admin/shop`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("iframe").first()).toBeVisible({ timeout: 60_000 });
}
async function waitStamped(page: Page, title: string, target: string) {
  // A frame only mounts once its box has been near the screen, so bring the shared frames' heading into view first.
  if (title === LEFT || title === RIGHT) await page.locator("#shop-shared-heading").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(([frameTitle, id]) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${frameTitle}"]`);
    return Array.from(frame?.contentDocument?.querySelectorAll(`[data-edit-target="${id}"]`) ?? []).filter(node => node.getBoundingClientRect().width > 0).length;
  }, [title, target]), { timeout: 60_000 }).toBeGreaterThan(0);
}

/** Viewport point at the centre of the first drawn node of a stamped field inside a frame (the frame is scaled, so its geometry is mapped). */
async function pointIn(page: Page, title: string, target: string) {
  await waitStamped(page, title, target);
  await page.evaluate(([frameTitle, id]) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${frameTitle}"]`)!;
    const node = Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>(`[data-edit-target="${id}"]`)).find(item => item.getBoundingClientRect().width > 0);
    (node ?? frame).scrollIntoView({ block: "center", behavior: "instant" });
  }, [title, target]);
  await page.waitForTimeout(250);
  const point = await page.evaluate(([frameTitle, id]) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${frameTitle}"]`)!;
    const box = frame.getBoundingClientRect();
    const scale = box.width / frame.clientWidth;
    const node = Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>(`[data-edit-target="${id}"]`)).find(item => item.getBoundingClientRect().width > 0);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const left = Math.max(box.left + rect.left * scale, box.left), right = Math.min(box.left + rect.right * scale, box.right);
    const top = Math.max(box.top + rect.top * scale, 0), bottom = Math.min(box.top + rect.bottom * scale, innerHeight);
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
  }, [title, target]);
  if (!point) throw new Error(`no visible preview node for ${target} in ${title}`);
  return point;
}
async function nodeText(page: Page, title: string, target: string) {
  await waitStamped(page, title, target);
  return page.evaluate(([frameTitle, id]) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${frameTitle}"]`)!;
    const node = Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>(`[data-edit-target="${id}"]`)).find(item => item.getBoundingClientRect().width > 0)!;
    return (node.textContent ?? "").replace(/\s+/g, " ").trim();
  }, [title, target]);
}

/** The field is focused and ringed, in the section the field lives in. */
async function expectFocused(page: Page, target: string) {
  await expect.poll(() => focusedTarget(page)).toBe(target);
  await expect(page.locator(`${stamped(target)}[data-edit-target-flash]`)).toHaveCount(1);
}
async function expectNothingFocused(page: Page) {
  await page.waitForTimeout(450);
  expect(await focusedTarget(page)).toBeNull();
  await expect(page.locator("[data-edit-target-flash]")).toHaveCount(0);
}
// A stamped field can be a link (Buy now, the purchase button): a click must open the field, never a tab, a page, or a new
// document inside the preview frame. Tabs are logged as they open; expectStayed checks after the field assertions, so its wait
// never eats the field's short highlight ring.
const popups = new WeakMap<Page, string[]>();
const clickedFrom = new WeakMap<Page, string>();
async function clickField(page: Page, title: string, target: string) {
  const { x, y } = await pointIn(page, title, target);
  if (!popups.has(page)) { const opened: string[] = []; popups.set(page, opened); page.context().on("page", tab => opened.push(tab.url())); }
  clickedFrom.set(page, page.url());
  await page.mouse.click(x, y);
}
/** No field click opened a tab, the admin is still where the last click started, and every preview frame still shows its own document. */
async function expectStayed(page: Page) {
  await page.waitForTimeout(1_000);
  expect(popups.get(page) ?? [], "a field click opened a new tab").toEqual([]);
  expect(page.url(), "a field click navigated the admin").toBe(clickedFrom.get(page));
  expect(page.context().pages()).toHaveLength(1);
  const frames = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[srcdoc]")).map(frame => frame.contentWindow?.location.href ?? null));
  expect(frames.length).toBeGreaterThan(0);
  for (const href of frames) expect(href, "a field click navigated a preview frame").toBe("about:srcdoc");
}
/** The stamped field is (or sits inside) a real link with an href: the case the shared preview link guard exists for. */
async function expectStampedLink(page: Page, title: string, target: string) {
  await waitStamped(page, title, target);
  const href = await page.evaluate(([frameTitle, id]) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${frameTitle}"]`)!;
    const node = Array.from(frame.contentDocument!.querySelectorAll<HTMLElement>(`[data-edit-target="${id}"]`)).find(item => item.getBoundingClientRect().width > 0)!;
    return node.closest("a[href]")?.getAttribute("href") ?? null;
  }, [title, target]);
  expect(href, `${target} is a link`).not.toBeNull();
}
/** A click on a field opens its own section with it focused, holding the text the node shows. */
async function clickAndExpect(page: Page, title: string, section: string, target: string, compare = true) {
  // The buttons carry a screen-reader-only "(opens in a new tab)" that is not part of the field's text.
  const shown = (await nodeText(page, title, target)).replace(/ \(opens in a new tab\)$/, "");
  await clickField(page, title, target);
  await expect(panel(page, section)).toBeVisible();
  await expectFocused(page, target);
  await expectStayed(page);
  if (compare) {
    expect(shown).not.toBe("");
    // A textarea keeps a line break where the page flows the text on.
    expect((await dialog(page).locator(":focus").inputValue()).replace(/\s+/g, " ").trim()).toBe(shown);
  }
}
async function closeDialog(page: Page) {
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
}
async function fill(page: Page, section: string, target: string, value: string) {
  const control = panel(page, section).locator(`${stamped(target)} input, ${stamped(target)} textarea`).first();
  await control.scrollIntoViewIfNeeded();
  await control.fill(value);
}
/** Opens a shared section from its chip, runs the typing, closes. */
async function edit(page: Page, chip: string, section: string, typing: () => Promise<void>) {
  await sharedChip(page, chip).click();
  await expect(panel(page, section)).toBeVisible();
  await typing();
  await closeDialog(page);
}

test.describe("UI-PREVIEW-CLICK-SHOP: Rose City Shop", () => {
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("a click on a kit's title opens Kit text on that kit with the title focused and ringed; the mouse shows the field outline, not the part's", async ({ page }) => {
    await openShop(page);
    const target = "shop.kitText.row:home.title";
    const { x, y } = await pointIn(page, HOME, target);
    await page.mouse.move(x, y);
    const outlines = await page.evaluate(([title, id]) => {
      const node = document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!.querySelector<HTMLElement>(`[data-edit-target="${id}"]`)!;
      const region = node.closest<HTMLElement>("[data-shop-editor-target]")!;
      const view = node.ownerDocument.defaultView!;
      return { field: view.getComputedStyle(node).outlineStyle, region: view.getComputedStyle(region).outlineStyle };
    }, [HOME, target]);
    expect(outlines).toEqual({ field: "solid", region: "none" });
    await page.mouse.click(x, y);
    await expect(panel(page, "kitText")).toBeVisible();
    await expectFocused(page, target);
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Kit title");
    await expect(dialog(page).getByRole("group", { name: "Kit" }).getByRole("button", { name: "Home kit" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("a click on a stamped link (the kit's Buy button, the purchase button) opens its field and never opens a tab or leaves the admin", async ({ page }) => {
    await openShop(page);
    await expectStampedLink(page, AWAY, "shop.kitText.row:away.buttonLabel");
    await clickAndExpect(page, AWAY, "kitText", "shop.kitText.row:away.buttonLabel");
    await closeDialog(page);
    await expectStampedLink(page, LEFT, "shop.purchase.buttonLabel");
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.buttonLabel");
  });

  test("each kit's fields open on their own kit: the Away frame's description, small heading, bullets, store note and button", async ({ page }) => {
    await openShop(page);
    await clickAndExpect(page, AWAY, "kitText", "shop.kitText.row:away.description");
    await expect(dialog(page).getByRole("group", { name: "Kit" }).getByRole("button", { name: "Away kit" })).toHaveAttribute("aria-pressed", "true");
    await closeDialog(page);
    await clickAndExpect(page, AWAY, "kitText", "shop.kitText.row:away.eyebrow");
    await closeDialog(page);
    await clickAndExpect(page, AWAY, "kitText", "shop.kitText.row:away.storeNote");
    await closeDialog(page);
    await clickAndExpect(page, AWAY, "kitText", "shop.kitText.row:away.buttonLabel");
    await closeDialog(page);
    const shown = await nodeText(page, HOME, "shop.kitText.row:home.bullets");
    await clickField(page, HOME, "shop.kitText.row:home.bullets");
    await expectFocused(page, "shop.kitText.row:home.bullets");
    expect(shown.startsWith((await dialog(page).locator(":focus").inputValue()).split("\n")[0])).toBe(true);
    await expect(dialog(page).getByRole("group", { name: "Kit" }).getByRole("button", { name: "Home kit" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a click on the kit photo, the chips, the jersey option button and the keyboard open the section with no field focused", async ({ page }) => {
    await openShop(page);
    await waitStamped(page, HOME, "shop.kitText.row:home.title");
    // The photo holds no text field: a click on it opens Kit photos.
    const photo = await page.evaluate(title => {
      const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!;
      frame.scrollIntoView({ block: "center", behavior: "instant" });
      const box = frame.getBoundingClientRect(), scale = box.width / frame.clientWidth;
      const rect = frame.contentDocument!.querySelector(".shop-portrait")!.getBoundingClientRect();
      return { x: box.left + (rect.left + rect.width / 2) * scale, y: box.top + (rect.top + rect.height / 2) * scale };
    }, HOME);
    await page.mouse.click(photo.x, photo.y);
    await expect(panel(page, "kitPhotos")).toBeVisible();
    await expectNothingFocused(page);
    await closeDialog(page);
    // A script's or keyboard's click on a field (detail 0) names no field.
    await page.evaluate(([title, id]) => document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!.querySelector<HTMLElement>(`[data-edit-target="${id}"]`)!.click(), [HOME, "shop.kitText.row:home.title"]);
    await expect(panel(page, "kitText")).toBeVisible();
    await expectNothingFocused(page);
    await closeDialog(page);
    await kitGroup(page, "home").getByRole("button", { name: "Edit kit text" }).click();
    await expect(panel(page, "kitText")).toBeVisible();
    await expectNothingFocused(page);
    await closeDialog(page);
    await kitGroup(page, "home").getByRole("button", { name: "Edit photo row" }).click();
    await expect(panel(page, "photoRow")).toBeVisible();
    await expectNothingFocused(page);
    await closeDialog(page);
    await page.getByRole("button", { name: "Edit jersey options, home kit" }).click();
    await expect(panel(page, "editions")).toBeVisible();
    await expectNothingFocused(page);
    await closeDialog(page);
    await kitGroup(page, "away").getByRole("button", { name: "Edit kit photos" }).evaluate(button => (button as HTMLButtonElement).focus());
    await page.keyboard.press("Enter");
    await expect(panel(page, "kitPhotos")).toBeVisible();
    await expectNothingFocused(page);
  });

  test("Purchase details: the heading, a detail card's words, the footer and its button each open their own field; the card is the one clicked", async ({ page }) => {
    await openShop(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.heading");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.row:1.title");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.row:2.label");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.row:3.body");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.footerText");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.buttonLabel");
  });

  test("a click on the route map picture and the partner strip heading opens Route map and Partner strip on that field", async ({ page }) => {
    await openShop(page);
    await clickField(page, RIGHT, "shop.map.description");
    await expect(panel(page, "map")).toBeVisible();
    await expectFocused(page, "shop.map.description");
    await closeDialog(page);
    await clickAndExpect(page, RIGHT, "partners", "shop.partners.heading");
  });

  test("fields typed onto the page open their own section: a jersey option's line, a care line, a tile, a map heading and a size chart cell", async ({ page }) => {
    await openShop(page);
    // Jersey options: the Home kit's option puts its line under the title.
    await page.getByRole("button", { name: "Edit jersey options, home kit" }).click();
    await expect(panel(page, "editions")).toBeVisible();
    await panel(page, "editions").getByRole("button", { name: "Add home kit option" }).click();
    await fill(page, "editions", "shop.editions.row:home.label", "Home jersey");
    await fill(page, "editions", "shop.editions.row:home.line", "Line under the home title");
    await closeDialog(page);
    await clickAndExpect(page, HOME, "editions", "shop.editions.row:home.line");
    await closeDialog(page);
    // Care line, Jersey details and Route map headings.
    await edit(page, "Care line", "care", () => fill(page, "care", "shop.care.care", "Color: Red\n100% polyester"));
    await clickAndExpect(page, LEFT, "care", "shop.care.care", false);
    expect(await dialog(page).locator(":focus").inputValue()).toBe("Color: Red\n100% polyester");
    await closeDialog(page);
    await edit(page, "Jersey details", "details", async () => {
      await panel(page, "details").getByRole("button", { name: "Add tile" }).click();
      await fill(page, "details", "shop.details.row:0.title", "Tile heading");
      await fill(page, "details", "shop.details.row:0.text", "Tile words");
    });
    await clickAndExpect(page, LEFT, "details", "shop.details.row:0.title");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "details", "shop.details.row:0.text");
    await closeDialog(page);
    await edit(page, "Route map", "map", () => fill(page, "map", "shop.map.heading", "Getting here"));
    await clickAndExpect(page, RIGHT, "map", "shop.map.heading");
    await closeDialog(page);
    // Size chart: the sizes input, then one measurement; a click on a cell opens that cell, a size name opens the sizes input.
    await edit(page, "Size chart", "sizes", async () => {
      await fill(page, "sizes", "shop.sizes.sizes", "S, M, L");
      await panel(page, "sizes").getByRole("button", { name: "Add measurement" }).click();
      await fill(page, "sizes", "shop.sizes.row:0.label", "Chest (in)");
      await fill(page, "sizes", "shop.sizes.row:0.value0", "35");
      await fill(page, "sizes", "shop.sizes.row:0.value1", "37");
      await fill(page, "sizes", "shop.sizes.row:0.value2", "39");
    });
    await clickAndExpect(page, RIGHT, "sizes", "shop.sizes.row:0.value1");
    expect(await dialog(page).locator(":focus").inputValue()).toBe("37");
    await closeDialog(page);
    await clickAndExpect(page, RIGHT, "sizes", "shop.sizes.row:0.label");
    await closeDialog(page);
    const sizes = await pointIn(page, RIGHT, "shop.sizes.sizes");
    await page.mouse.click(sizes.x, sizes.y);
    await expect(panel(page, "sizes")).toBeVisible();
    await expectFocused(page, "shop.sizes.sizes");
    await expect(dialog(page).locator(":focus")).toHaveAccessibleName("Sizes, separated by commas");
  });

  test("the Homepage shop feature frame opens Kit text on the Home kit from its title and button", async ({ page }) => {
    await openShop(page);
    await page.getByRole("button", { name: "Homepage shop feature" }).click();
    await expect(page.locator("[data-surface=\"home\"]")).toBeVisible();
    await clickAndExpect(page, HOME, "kitText", "shop.kitText.row:home.title");
    await closeDialog(page);
    await clickAndExpect(page, HOME, "kitText", "shop.kitText.row:home.buttonLabel");
    expect(await panel(page, "kitText").locator(stamped("shop.kitText.row:home.buyLink")).count()).toBe(0);
  });
});

test.describe("UI-PREVIEW-CLICK-SHOP: Rose City Shop on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  test("a tap-sized click on a kit's description and a detail card's title open the field, with the dialog's field ringed", async ({ page }) => {
    await openShop(page);
    await clickAndExpect(page, HOME, "kitText", "shop.kitText.row:home.description");
    await closeDialog(page);
    await clickAndExpect(page, LEFT, "purchase", "shop.purchase.row:0.title");
    await expect(dialog(page).locator(":focus")).toBeVisible();
  });
});

test.describe("UI-PREVIEW-CLICK-SHOP: Diverse City classic Shop", () => {
  const FRAME = "Desktop Shop page preview";
  const adminDialog = (page: Page) => page.getByRole("dialog");
  const dialogField = (page: Page, target: string): Locator => adminDialog(page).locator(stamped(target));
  test.afterEach(async ({ page }) => { await page.goto("about:blank"); });

  async function expectDialogFocus(page: Page, target: string, shown: string) {
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(page.locator(`${stamped(target)}[data-edit-target-flash]`)).toHaveCount(1);
    expect(await adminDialog(page).locator(":focus").inputValue()).toBe(shown);
    await expectStayed(page);
  }

  test("a click on the kit's title opens Kit text with the title focused and ringed; so do the small heading, store note and button", async ({ page }) => {
    await openShop(page, DIVERSE_CITY);
    await expect(page.getByRole("button", { name: "Edit kit text" })).toBeVisible();
    for (const field of ["title", "eyebrow", "storeNote", "buttonLabel"]) {
      const target = `shop.kitText.row:home.${field}`;
      const shown = await nodeText(page, FRAME, target);
      await clickField(page, FRAME, target);
      await expect(adminDialog(page)).toContainText("Kit text");
      await expect(dialogField(page, target)).toBeVisible();
      await expectDialogFocus(page, target, shown);
      await page.keyboard.press("Escape");
      await expect(adminDialog(page)).toHaveCount(0);
    }
  });

  test("a click on the stamped Buy link opens its field and never opens a tab or leaves the admin", async ({ page }) => {
    await openShop(page, DIVERSE_CITY);
    const target = "shop.kitText.row:home.buttonLabel";
    await expectStampedLink(page, FRAME, target);
    const shown = await nodeText(page, FRAME, target);
    await clickField(page, FRAME, target);
    await expectDialogFocus(page, target, shown);
  });

  test("the description and the bullet list open their own fields", async ({ page }) => {
    await openShop(page, DIVERSE_CITY);
    await waitStamped(page, FRAME, "shop.kitText.row:home.title");
    const have = await page.evaluate(title => ["description", "bullets"].filter(field => document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!.querySelector(`[data-edit-target="shop.kitText.row:home.${field}"]`)), FRAME);
    expect(have, "the seeded kit has a description and bullet points").toEqual(["description", "bullets"]);
    const shown = await nodeText(page, FRAME, "shop.kitText.row:home.description");
    await clickField(page, FRAME, "shop.kitText.row:home.description");
    await expectDialogFocus(page, "shop.kitText.row:home.description", shown);
    await page.keyboard.press("Escape");
    await expect(adminDialog(page)).toHaveCount(0);
    await clickField(page, FRAME, "shop.kitText.row:home.bullets");
    await expect.poll(() => focusedTarget(page)).toBe("shop.kitText.row:home.bullets");
    await expect(adminDialog(page).locator(":focus")).toHaveAccessibleName("Bullet points, one per line");
  });

  test("the kit photos open Kit photos, the Edit buttons and the keyboard open Kit text, none with a field focused", async ({ page }) => {
    await openShop(page, DIVERSE_CITY);
    await waitStamped(page, FRAME, "shop.kitText.row:home.title");
    const photo = await page.evaluate(title => {
      const frame = document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!;
      const box = frame.getBoundingClientRect(), scale = box.width / frame.clientWidth;
      const rect = frame.contentDocument!.querySelector("[data-shop-editor-target='photos']")!.getBoundingClientRect();
      return { x: box.left + (rect.left + rect.width * 0.15) * scale, y: box.top + (rect.top + rect.height * 0.5) * scale };
    }, FRAME);
    await page.mouse.click(photo.x, photo.y);
    await expect(adminDialog(page)).toContainText("Kit photos");
    await expectNothingFocused(page);
    await page.keyboard.press("Escape");
    await expect(adminDialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Edit kit text" }).click();
    await expect(adminDialog(page)).toContainText("Kit text");
    await expectNothingFocused(page);
    await page.keyboard.press("Escape");
    await expect(adminDialog(page)).toHaveCount(0);
    // The keyboard: Enter on the focused region (detail 0) opens it with no field.
    await page.evaluate(title => document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)!.contentDocument!.querySelector<HTMLElement>("[data-shop-editor-target='copy']")!.focus(), FRAME);
    await page.keyboard.press("Enter");
    await expect(adminDialog(page)).toContainText("Kit text");
    await expectNothingFocused(page);
  });

  test("on the phone preview a click on the title still opens the field", async ({ page }) => {
    await openShop(page, DIVERSE_CITY);
    await page.getByRole("button", { name: "Phone" }).click();
    const frame = "Phone Shop page preview";
    const target = "shop.kitText.row:home.title";
    const shown = await nodeText(page, frame, target);
    await clickField(page, frame, target);
    await expectDialogFocus(page, target, shown);
  });
});
