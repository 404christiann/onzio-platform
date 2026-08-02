import { describe, expect, it } from "vitest";
import {
  EMPTY_SHOP_PURCHASE_DETAILS,
  normalizeShopPurchaseDetails,
} from "@/lib/shop-purchase-details";
import { EMPTY_ABOUT_PAGE_CONTENT } from "@/lib/about-content";

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
});
