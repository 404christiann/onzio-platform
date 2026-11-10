import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SponsorCarousel from "@/components/SponsorCarousel";
import type { DBSiteSponsorLogo } from "@/lib/db-types";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const sponsors = "components/sites/diverse-city/AcademySponsorsPage.tsx";
const shop = "components/sites/diverse-city/AcademyShopPage.tsx";

describe("Academy Sponsors and Shop page ownership", () => {
  it("keeps both Academy pages in the site module without root-level duplicates", () => {
    expect(existsSync(resolve(root, sponsors))).toBe(true);
    expect(existsSync(resolve(root, shop))).toBe(true);
    expect(existsSync(resolve(root, "components/AcademySponsorsPage.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "components/AcademyShopPage.tsx"))).toBe(false);
  });

  it("renders the Academy Sponsors page on public and canonical routes", () => {
    const importPath = "@/components/sites/diverse-city/AcademySponsorsPage";
    expect(source("app/(public)/sponsors/page.tsx")).toContain(importPath);
    expect(source("app/%5Fclubs/[slug]/sponsors/page.tsx")).toContain(importPath);
  });

  it("keeps the sponsor editor preview bound to the compact homepage carousel", () => {
    const editor = source("app/admin/(protected)/sponsors/page.tsx");
    const preview = editor.slice(editor.indexOf("<div data-admin-public-preview>"));
    expect(editor).toContain('label="Add sponsor logos"');
    expect(preview).toMatch(/\{placement === "carousel" \? \(\s*<SponsorCarousel sponsors=\{previewLogos\} compact \/>/);
    expect(preview).not.toContain("AcademySponsorsPage");
  });

  it("keeps an empty compact carousel preview empty", () => {
    expect(renderToStaticMarkup(createElement(SponsorCarousel, { sponsors: [], compact: true }))).toBe("");
  });

  it("shows sponsor logos in the compact carousel without a full-page hero", () => {
    const logos: DBSiteSponsorLogo[] = [{
      id: "sponsor-preview",
      placement: "carousel",
      name: "Local partner",
      logo_url: "/partner.png",
      sort_order: 0,
      show_on_homepage: true,
      show_in_footer: false,
      website_url: null,
      created_at: "2026-11-02T00:00:00Z",
    }];
    const html = renderToStaticMarkup(createElement(SponsorCarousel, { sponsors: logos, compact: true }));
    expect(html).toContain("sponsor-carousel-section--compact");
    expect(html).toContain("Proudly supported by");
    expect(html).toContain('alt="Local partner"');
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Partners coming soon");
  });

  it("uses one Academy Shop component for public and unsaved editor content", () => {
    const importPath = "@/components/sites/diverse-city/AcademyShopPage";
    expect(source("app/(public)/shop/page.tsx")).toContain(importPath);
    expect(source("components/admin/shop/ShopPageEditor.tsx")).toContain(importPath);
    expect(source("components/admin/shop/ShopPageEditor.tsx")).toContain(
      "<AcademyShopPage editorContent={content.home} />",
    );
    expect(source(shop)).toContain('fetchShopKitVariants("shop", clubId)');
    expect(source(shop)).toContain("setContent(variants.home)");
  });
});
