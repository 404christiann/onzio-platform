import { expect, test, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

// UI-FIX-LOGO-FOOTER-PREVIEW, on the classic admin with the owner's local browser state (any loopback tenant; Rose City
// for the footer preview). Reads only: nothing is written to the database.
// - The desktop sidebar stays put while the page scrolls and while the branding dialog opens and closes. It used to
//   scroll away: tailwind-merge dropped `lg:top-0` in favour of a later `lg:inset-y-auto`, leaving sticky with top:auto.
// - The admin's top-left logo is the club's saved logo (site_branding.club_logo_path), the one the public site uses.
// - The branding dialog's footer preview is the public footer at its real desktop size, scaled into a fixed frame.

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

async function queryOne<T>(page: Page, text: string): Promise<T | undefined> {
  const slug = new URL(page.url()).hostname.split(".")[0];
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query(text, [slug])).rows[0] as T | undefined;
  } finally {
    await db.end();
  }
}

const savedLogoPath = async (page: Page) => (await queryOne<{ path: string | null }>(page,
  "select b.club_logo_path as path from onzio.site_branding b join onzio.clubs c on c.id = b.club_id where c.slug = $1"))?.path?.trim() ?? "";

const hasFooterLogo = async (page: Page) => Boolean((await queryOne<{ id: string | null }>(page,
  "select h.footer_logo_media_asset_id as id from onzio.homepage_revamp_content h join onzio.clubs c on c.id = h.club_id where c.slug = $1"))?.id);

/** Pinned to the top-left at full viewport height. Chromium can leave a fractional scroll offset at the end of a page, so
 *  y may be off by a fraction of a pixel; the bug this guards against moved the sidebar by the whole scroll distance. */
async function expectPinned(sidebar: Locator, height: number) {
  const box = (await sidebar.boundingBox())!;
  expect({ x: box.x, width: box.width, height: box.height }).toEqual({ x: 0, width: 264, height });
  expect(Math.abs(box.y)).toBeLessThan(0.5);
}

/** Wheel scrolling is smooth: wait until scrollY stops changing, so a box is never read mid-animation. */
async function scrollSettled(page: Page, atLeast: number) {
  let last = -1;
  await expect.poll(async () => {
    const now = await page.evaluate(() => scrollY);
    const settled = now === last && now > atLeast;
    last = now;
    return settled;
  }, { intervals: [100] }).toBe(true);
}

/** The image's own URL, unwrapped from a /_next/image?url=… proxy if there is one. */
const sourceOf = (src: string) => {
  const url = new URL(src, "http://local");
  return decodeURIComponent(url.pathname === "/_next/image" ? url.searchParams.get("url") ?? "" : url.href);
};

test("the admin's top-left logo is the club's saved logo", async ({ page }, testInfo) => {
  await page.goto("/admin/branding");
  const path = await savedLogoPath(page);
  const logo = testInfo.project.name === "phone"
    ? page.locator("[data-admin-header-logo]")
    : page.locator("#admin-sidebar [data-slot=sidebar-header]");
  await expect(logo).toBeVisible();
  if (!path) {
    test.info().annotations.push({ type: "note", description: "Club has no saved logo; checking the text fallback." });
    return;
  }
  const image = logo.locator("img").first();
  await expect(image).toBeVisible();
  expect(sourceOf((await image.getAttribute("src")) ?? "")).toContain(path);
  const box = (await image.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(40.5);
  expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
});

test("the desktop sidebar stays pinned while the page scrolls and the branding dialog opens and closes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "The sidebar is a drawer under 1024px.");
  const sidebar = page.locator("#admin-sidebar");

  // A long page: scroll it to the bottom.
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/admin/roster");
  await expect(sidebar).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(300);
  await expectPinned(sidebar, 520);
  await page.mouse.move(800, 300);
  await page.mouse.wheel(0, 5000);
  await scrollSettled(page, 300);
  await expectPinned(sidebar, 520);

  // The branding page, scrolled as far as it goes, then the dialog opens and closes.
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.goto("/admin/branding");
  await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(50);
  await page.mouse.wheel(0, 5000);
  await scrollSettled(page, 50);
  await expectPinned(sidebar, 420);
  await page.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectPinned(sidebar, 420);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectPinned(sidebar, 420);
});

test("the footer preview is the public footer at its desktop size, inside a fixed frame", async ({ page }) => {
  await page.goto("/admin/branding");
  await page.getByRole("button", { name: "Edit" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const previewTab = dialog.getByRole("group", { name: "View" }).getByRole("button", { name: "Preview" });
  if (await previewTab.isVisible()) await previewTab.click();
  const frame = page.locator("[data-footer-preview]");
  // Only Rose City (cinematic@2) has this preview; on it, a missing frame is a failure, not a skip.
  test.skip(new URL(page.url()).hostname.split(".")[0] !== "rose-city", "The footer preview is Rose City's branding editor.");
  await expect(frame).toHaveAttribute("data-ready", "true", { timeout: 15_000 });

  const box = (await frame.boundingBox())!;
  expect(box.height).toBeCloseTo((box.width * 264) / 1440, 0);
  // No horizontal scroll from the preview at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const footer = page.frameLocator("[data-footer-preview] iframe");
  expect(await footer.locator("[data-footer-preview-root]").evaluate((node) => node.ownerDocument.defaultView!.innerWidth)).toBe(1440);
  const logo = footer.locator(".footer-logo > img, .footer-brand > img").first();
  await expect(logo).toHaveCount(1);
  // Shown only once the footer's own content has loaded: a club with an owner footer logo never flashes the crest.
  const isFooterLogo = await logo.evaluate((node) => node.parentElement!.classList.contains("footer-logo"));
  expect(isFooterLogo).toBe(await hasFooterLogo(page));
  // The public desktop rule (cinematic.css): 5.8vw for an owner footer logo, 5.5vw for the crest.
  const width = await logo.evaluate((node) => node.getBoundingClientRect().width);
  expect(width).toBeCloseTo(1440 * (isFooterLogo ? 0.058 : 0.055), 0);
  // Scaled into the dialog, the logo never draws taller than the frame.
  const shown = (await logo.boundingBox())!;
  expect(shown.height).toBeLessThanOrEqual(box.height);
});
