import { describe, expect, it } from "vitest";
import {
  EMPTY_SHOP_PURCHASE_DETAILS,
  normalizeShopPurchaseDetails,
} from "@/lib/shop-purchase-details";
import {
  EMPTY_ABOUT_PAGE_CONTENT,
  EMPTY_CLUB_LOGO_PAGE_CONTENT,
} from "@/lib/about-content";
import { EMPTY_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";

describe("tenant-safe public empty content", () => {
  it("does not substitute Rose City shop facts for an explicit tenant", () => {
    expect(normalizeShopPurchaseDetails(null, { legacyFallback: false })).toEqual(
      EMPTY_SHOP_PURCHASE_DETAILS,
    );
    expect(JSON.stringify(EMPTY_SHOP_PURCHASE_DETAILS)).not.toMatch(
      /Pasadena|Niky's|Buy Now/i,
    );
  });

  it("provides a neutral empty About document for explicit tenants", () => {
    expect(EMPTY_ABOUT_PAGE_CONTENT).toMatchObject({
      hero_title: "About",
      story_paragraphs: [],
      values: [],
      feature_image_url: "",
    });
    expect(JSON.stringify(EMPTY_ABOUT_PAGE_CONTENT)).not.toMatch(
      /Rose City|Pasadena|Arcadia/i,
    );
  });

  it("provides a neutral empty Club Logo document for explicit tenants", () => {
    expect(EMPTY_CLUB_LOGO_PAGE_CONTENT).toMatchObject({
      annotated_image_url: "",
      features: [],
      map_image_url: "",
      color_cards: [],
    });
    expect(JSON.stringify(EMPTY_CLUB_LOGO_PAGE_CONTENT)).not.toMatch(
      /Rose City|Pasadena|Rose Parade|Aboutassets/i,
    );
  });

  it("provides a tenant-neutral homepage hero for pre-hydration and empty-club states", () => {
    // components/Hero.tsx initializes from this before any fetch resolves, so
    // no field may carry another club's real copy (the Diverse City
    // "Rose City FC" / "Team Store" / "Meet the Squad" first-paint flash).
    expect(EMPTY_HOMEPAGE_HERO_CONTENT).toMatchObject({
      headline_line_one: "",
      primary_cta_label: "",
      primary_cta_href: "",
      secondary_cta_label: "",
      secondary_cta_href: "",
    });
    expect(JSON.stringify(EMPTY_HOMEPAGE_HERO_CONTENT)).not.toMatch(
      /Rose City|Team Store|Meet the Squad/i,
    );
  });
});
