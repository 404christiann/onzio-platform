import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import {
  availableKitVariants,
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
  resolveKitVariant,
} from "@/lib/shop-kit";
import { emptyShopSection } from "@/lib/shop-editor/model";
import { normalizeShopPurchaseDetails } from "@/lib/shop-purchase-details";
import { DEFAULT_SITE_SOCIAL_LINKS, normalizeSiteSocialLinks } from "@/lib/social-links";
import { withoutShopLinks } from "@/lib/store-visibility";
import type { ShopKitContent } from "@/lib/queries";

const ROSE_CITY = /Rose City|rosecity|Pasadena|Niky|Raffle|RoseCity/i;
const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

describe("new clubs never inherit Rose City sample content", () => {
  it("keeps blank purchase-detail fields blank on a saved row", () => {
    const details = normalizeShopPurchaseDetails({
      id: 1,
      heading: "",
      cards: null as never,
      cta_eyebrow: "",
      cta_text: "",
      cta_label: "",
      cta_link: "",
      updated_at: "",
    });
    expect(details.cards).toEqual([]);
    expect(details.cta_link).toBe("");
    expect(details.cta_text).toBe("");
    expect(JSON.stringify(details)).not.toMatch(ROSE_CITY);
  });

  it("does not invent kit bullet points or a store note", () => {
    expect(normalizeKitBulletPoints(undefined)).toEqual([]);
    expect(normalizeKitBulletPoints([])).toEqual([]);
    expect(normalizeKitStoreNote(undefined)).toBe("");
    expect(normalizeKitStoreNote(null)).toBe("");
  });

  it("starts a new kit draft empty", () => {
    expect(emptyShopSection()).toMatchObject({ bullet_points: [], store_note: "" });
    expect(JSON.stringify(emptyShopSection())).not.toMatch(ROSE_CITY);
  });

  it("lists every social platform with a blank link until the club adds one", () => {
    expect(JSON.stringify(DEFAULT_SITE_SOCIAL_LINKS)).not.toMatch(ROSE_CITY);
    const links = normalizeSiteSocialLinks([]);
    expect(links.map((link) => link.id)).toEqual(["instagram", "facebook", "tiktok", "x", "youtube"]);
    expect(links.every((link) => link.href === "")).toBe(true);
  });

  it("does not seed admin editors with Rose City content before loading", () => {
    expect(source("app/admin/(protected)/sponsors/page.tsx")).not.toMatch(/defaultSponsorLogosForPlacement/);
    expect(source("app/admin/(protected)/about/page.tsx")).not.toMatch(/toAboutDraft\(DEFAULT_ABOUT_PAGE_CONTENT\)|toLogoDraft\(DEFAULT_CLUB_LOGO_PAGE_CONTENT\)/);
    expect(source("app/(public)/club/about/page.tsx")).not.toMatch(/DEFAULT_ABOUT_PAGE_CONTENT/);
  });
});

describe("branding copy", () => {
  it("does not promise a contrast check that the page does not have", () => {
    expect(source("app/admin/(protected)/branding/page.tsx")).not.toMatch(/contrast check/i);
  });
});

describe("the Shop switch (clubs.store_enabled)", () => {
  const owner: AdminRouteAccessContext = {
    role: "owner",
    presentationTemplateKey: "clubhouse@1",
    isBillingAuthorized: true,
    canMutateContent: true,
    storeEnabled: true,
  };

  it("hides Shop in the admin when the club's shop is off", () => {
    expect(getVisibleAdminRoutes(owner).map((route) => route.id)).toContain("shop");
    expect(getVisibleAdminRoutes({ ...owner, storeEnabled: false }).map((route) => route.id)).not.toContain("shop");
  });

  it("drops Shop links from public navigation when the shop is off", () => {
    const links = [{ label: "Home", href: "/" }, { label: "Shop", href: "/shop" }];
    expect(withoutShopLinks(links, true)).toEqual(links);
    expect(withoutShopLinks(links, false)).toEqual([{ label: "Home", href: "/" }]);
  });

  it("gates the public shop route and every shared Shop link on the switch", () => {
    expect(source("app/%5Fclubs/[slug]/shop/page.tsx")).toMatch(/storeEnabled[\s\S]*notFound\(\)/);
    for (const path of [
      "components/Nav.tsx",
      "components/Footer.tsx",
      "components/sites/diverse-city/Nav.tsx",
      "components/ClubhouseHomePage.tsx",
      "components/AcademyHomeShopFeature.tsx",
      "components/ShopKitSectionContainer.tsx",
      "components/Hero.tsx",
      "components/admin/shop/ShopPageEditor.tsx",
      "components/AdminShell.tsx",
    ]) {
      expect(source(path), path).toMatch(/storeEnabled/);
    }
  });
});

describe("empty kits", () => {
  const kit = (filled: boolean): ShopKitContent => ({
    section: filled ? ({ title: "Kit" } as ShopKitContent["section"]) : null,
    photos: filled ? ([{ url: "/kit.jpg" }] as ShopKitContent["photos"]) : [],
  });

  it("offers only kits that have words and a photo", () => {
    expect(availableKitVariants({ home: kit(true), third: kit(false), away: kit(true) })).toEqual(["home", "away"]);
  });

  it("never shows the Home kit in place of an empty kit", () => {
    expect(resolveKitVariant("away", ["home", "away"])).toBe("away");
    expect(resolveKitVariant("third", ["home", "away"])).toBe("home");
    expect(resolveKitVariant("home", ["away"])).toBe("away");
    expect(resolveKitVariant("home", [])).toBeNull();
  });
});
