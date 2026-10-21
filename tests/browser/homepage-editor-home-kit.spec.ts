import { expect, test } from "@playwright/test";
import type { DBShopKitPhoto, DBShopKitSection } from "@/lib/db-types";

const clubId = "11111111-1111-4111-8111-111111111111";
const section: DBShopKitSection = {
  id: "home-kit-pilot", club_id: clubId, surface: "home", kit_variant: "home",
  eyebrow: "Club store", title: "Home kit pilot", description: "The current home kit.",
  bullet_points: ["Club crest", "Match fit"], store_note: "Available from the club store.",
  cta_label: "View home kit", cta_link: "/shop", updated_at: "2026-10-20T00:00:00Z",
};
const photos: DBShopKitPhoto[] = [
  { id: "front", surface: "home", kit_variant: "home", url: "/images/shop/rosecityshirt1.webp", sort_order: 0, created_at: section.updated_at },
  { id: "back", surface: "home", kit_variant: "home", url: "/images/shop/rosecityshirt2.jpeg", sort_order: 1, created_at: section.updated_at },
];

for (const width of [1440, 390]) {
  test(`homepage renders its populated home kit without querying failing unused variants at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const reads: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/rest/v1/shop_kit_*", route => {
      if (route.request().method() !== "GET") return route.continue();
      const url = new URL(route.request().url());
      const table = url.pathname.split("/").at(-1);
      const variant = url.searchParams.get("kit_variant");
      reads.push(`${table}:${variant}`);
      expect(url.searchParams.get("club_id")).toBe(`eq.${clubId}`);
      expect(url.searchParams.get("surface")).toBe("eq.home");
      return route.fulfill({
        status: variant === "eq.home" ? 200 : 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(variant === "eq.home"
          ? table === "shop_kit_section" ? [section] : photos
          : { message: "Unused kit unavailable" }),
      });
    });
    await page.goto("/");
    const feature = page.locator("section").filter({ has: page.getByRole("heading", { name: section.title, exact: true }) });
    await expect(feature).toBeVisible();
    const images = feature.locator("img");
    await expect(images).toHaveCount(2);
    for (const [index, photo] of photos.entries()) {
      await expect(images.nth(index)).toHaveAttribute("src", new URL(photo.url, page.url()).href);
      await expect(images.nth(index)).toHaveAttribute("alt", `${section.title} kit photo ${index + 1} of 2`);
    }
    await expect.poll(() => images.evaluateAll(items => items.every(item => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0))).toBe(true);
    await expect(feature.getByRole("link", { name: section.cta_label })).toHaveAttribute("href", "/shop");
    await expect(feature.getByText(section.description)).toBeVisible();
    await expect(feature.getByText(section.bullet_points[0])).toBeVisible();
    await expect(feature.getByText(section.store_note)).toBeVisible();
    expect(reads.sort()).toEqual(["shop_kit_photos:eq.home", "shop_kit_section:eq.home"]);
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await feature.screenshot({ path: info.outputPath(`home-kit-${width}.png`) });
  });
}
