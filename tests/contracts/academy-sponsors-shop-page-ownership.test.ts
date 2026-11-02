import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("renders the Academy Sponsors page on public and canonical routes and in its editor preview", () => {
    const importPath = "@/components/sites/diverse-city/AcademySponsorsPage";
    expect(source("app/(public)/sponsors/page.tsx")).toContain(importPath);
    expect(source("app/%5Fclubs/[slug]/sponsors/page.tsx")).toContain(importPath);
    expect(source("app/admin/(protected)/sponsors/page.tsx")).toContain(importPath);
    expect(source("app/admin/(protected)/sponsors/page.tsx")).toContain(
      "<AcademySponsorsPage sponsors={previewLogos} clubName={club.name} />",
    );
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
