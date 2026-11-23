import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

// UI-SLIDERS-ICON-SIZE-SCALE, on the classic admin with the owner's local browser state, Rose City (cinematic@2) only.
// Club Logo page → Crest features: each feature's Icon size and Icon scale are sliders, and the feature's own preview
// (the public page at a desktop width) follows them while the pointer is still down. Save writes the dragged values;
// the test then puts the feature's original values back.

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
type Sizing = { icon_size: number; icon_scale: number };

async function savedSizing(page: Page): Promise<Sizing> {
  const slug = new URL(page.url()).hostname.split(".")[0];
  const db = new Client(config);
  await db.connect();
  try {
    const { rows } = await db.query("select l.features->0 as feature from onzio.club_logo_page_content l join onzio.clubs c on c.id = l.club_id where c.slug = $1", [slug]);
    const feature = rows[0]?.feature as Sizing | undefined;
    if (!feature) throw new Error("This check needs a club with at least one crest feature.");
    return { icon_size: Number(feature.icon_size), icon_scale: Number(feature.icon_scale) };
  } finally { await db.end(); }
}

async function openCrestFeatures(page: Page) {
  await page.goto("/admin/about");
  await page.getByRole("button", { name: /^Club Logo/ }).click();
  await page.getByRole("button", { name: "Edit Crest features section" }).first().click();
  const sizing = page.locator("[data-crest-icon-sizing]").first();
  await sizing.scrollIntoViewIfNeeded();
  await expect(sizing.locator("[data-crest-icon-preview][data-ready]")).toBeVisible();
  return sizing;
}

const previewIcon = (sizing: Locator) => sizing.frameLocator("[data-crest-icon-preview] iframe").locator("[data-about-editor-index='0'] .feature-icon");
const widthOf = async (locator: Locator) => (await locator.boundingBox())!.width;

/** Presses the slider's thumb and moves to `fraction` of the track in small steps. Leaves the pointer down. */
async function dragTo(page: Page, sizing: Locator, slider: number, fraction: number) {
  const rail = (await sizing.locator("[data-slider-track]").nth(slider).boundingBox())!;
  const input = sizing.getByRole("slider").nth(slider);
  const [min, max, value] = await input.evaluate((node: HTMLInputElement) => [Number(node.min), Number(node.max), Number(node.value)]);
  const thumb = 24, travel = rail.width - thumb, y = rail.y + rail.height / 2;
  const from = rail.x + thumb / 2 + ((value - min) / (max - min)) * travel;
  await page.mouse.move(from, y);
  await page.mouse.down();
  const to = rail.x + thumb / 2 + fraction * travel;
  for (let step = 1; step <= 12; step++) await page.mouse.move(from + ((to - from) * step) / 12, y);
}

test("dragging icon size and scale updates the feature preview live, and Save keeps the values", async ({ page }) => {
  const sizing = await openCrestFeatures(page);
  const original = await savedSizing(page);
  const size = sizing.getByRole("slider", { name: "Icon size" });
  const scale = sizing.getByRole("slider", { name: "Icon scale" });
  await expect(size).toHaveValue(String(original.icon_size));
  await expect(size).toHaveAttribute("aria-valuetext", `${original.icon_size} pixels`);
  const rail = sizing.locator("[data-slider-track]").first();
  const railBefore = await rail.boundingBox();
  const frameBefore = await sizing.locator("[data-crest-icon-preview]").boundingBox();

  try {
    // Size: crest.css gives the icon box a width proportional to icon_size on a computer, so the preview box scales with it.
    const box = previewIcon(sizing);
    const boxBefore = await widthOf(box);
    await dragTo(page, sizing, 0, 0.9);
    const draggedSize = Number(await size.inputValue());
    expect(draggedSize).toBeGreaterThan(original.icon_size + 20);
    // Still pressed: the preview and the label already show the new size.
    await expect(sizing.locator("[data-slider-value]").first()).toHaveText(`${draggedSize} px`);
    await expect.poll(async () => (await widthOf(box)) / boxBefore).toBeCloseTo(draggedSize / original.icon_size, 1);
    await page.mouse.up();
    // Nothing in the dialog moved while the icon changed.
    expect(await rail.boundingBox()).toEqual(railBefore);
    expect(await sizing.locator("[data-crest-icon-preview]").boundingBox()).toEqual(frameBefore);

    // Scale: the picture is zoomed inside its box, so its drawn size scales with icon_scale.
    const picture = box.locator("img");
    const pictureBefore = await widthOf(picture);
    await dragTo(page, sizing, 1, 0.3);
    const draggedScale = Number(await scale.inputValue());
    expect(draggedScale).not.toBe(original.icon_scale);
    await expect(sizing.locator("[data-slider-value]").nth(1)).toHaveText(`${draggedScale.toFixed(2)}×`);
    await expect.poll(async () => (await widthOf(picture)) / pictureBefore).toBeCloseTo(draggedScale / original.icon_scale, 1);
    await page.mouse.up();

    // Keyboard: Shift+arrow is a big step, Home and End the ends; Reset puts the default back.
    await size.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(size).toHaveValue(String(draggedSize - 10));
    await page.keyboard.press("Shift+ArrowRight");
    await expect(size).toHaveValue(String(draggedSize));

    await page.locator("[data-editor-dialog-done]").click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("[data-about-status]")).toHaveText("Club Logo page saved.");
    await expect.poll(() => savedSizing(page)).toEqual({ icon_size: draggedSize, icon_scale: draggedScale });

    // A fresh load shows the saved values on the sliders.
    const reopened = await openCrestFeatures(page);
    await expect(reopened.getByRole("slider", { name: "Icon size" })).toHaveValue(String(draggedSize));
    await expect(reopened.getByRole("slider", { name: "Icon scale" })).toHaveValue(String(draggedScale));
  } finally {
    await page.mouse.up().catch(() => undefined);
    await restore(page, original);
  }
});

/** Puts the original values back through the editor (Home, then arrow steps), so the saved revision moves on as normal. */
async function restore(page: Page, original: Sizing) {
  if (JSON.stringify(await savedSizing(page)) === JSON.stringify(original)) return;
  const sizing = await openCrestFeatures(page);
  for (const [name, value, min, step] of [["Icon size", original.icon_size, 24, 1], ["Icon scale", original.icon_scale, 0.5, 0.05]] as const) {
    const slider = sizing.getByRole("slider", { name });
    await slider.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < Math.round((value - min) / step); i++) await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue(String(value));
  }
  await page.locator("[data-editor-dialog-done]").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-about-status]")).toHaveText("Club Logo page saved.");
  await expect.poll(() => savedSizing(page)).toEqual(original);
}

/** Every scroll position outside the page preview: the window and each scrolling part of the dialog. */
const editorScroll = (page: Page) => page.evaluate(() => [window.scrollY, ...Array.from(document.querySelectorAll<HTMLElement>("[data-editor-dialog], [data-editor-dialog] *"))
  .filter(element => !element.closest("[data-editor-dialog-preview]") && element.scrollHeight > element.clientHeight)
  .map(element => element.scrollTop)]);

test("the page preview scrolls on its own, without moving the editor or a slider", async ({ page }, testInfo) => {
  const sizing = await openCrestFeatures(page);
  const values = await sizing.getByRole("slider").evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value));
  // On a phone the page preview is the dialog's Preview view; on a computer it sits beside the fields.
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Preview", exact: true }).click();
  const frame = page.locator("[data-editor-dialog-preview] iframe");
  await expect(frame).toBeVisible();
  const previewTop = () => frame.evaluate((node: HTMLIFrameElement) => node.contentDocument!.scrollingElement!.scrollTop);
  await expect.poll(() => frame.evaluate((node: HTMLIFrameElement) => node.contentDocument!.scrollingElement!.scrollHeight > node.clientHeight)).toBe(true);
  const before = await editorScroll(page);
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(previewTop).toBeGreaterThan(0);
  // Past the end of the preview the scroll is not handed on to the editor.
  await page.mouse.wheel(0, 20_000);
  await expect.poll(previewTop).toBeGreaterThan(500);
  await page.waitForTimeout(300);
  expect(await editorScroll(page)).toEqual(before);
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "Fields", exact: true }).click();
  expect(await sizing.getByRole("slider").evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value))).toEqual(values);
});
