import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shopSaveRequestSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, toShopSaveRequest } from "@/lib/shop-editor/model";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";

const photoId = "97a51639-b15d-4ac4-8097-12aaac91ec09";
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";

function snapshot(surface: "home" | "shop"): ShopSnapshot {
  return {
    revision: "7",
    designRevision: "site-design-1",
    templateKey: "academy@1",
    surface,
    sections: [{
      id: "kit-section",
      kit_variant: "home",
      eyebrow: "Club kit",
      title: "Home kit",
      description: "Made for matchday",
      bullet_points: ["Adult and youth"],
      store_note: "Club store",
      cta_label: "Order",
      cta_link: "https://example.com/kit",
    }],
    photos: [{ rowId: photoId, assetId: null, url: "https://example.com/old.jpg", order: 0, kit_variant: "home" }],
    photoRows: [],
    purchase: null,
    media: [],
  };
}

describe("Shop page save scope", () => {
  it("rejects the Editorial Shop API when the public Store is disabled", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/admin/shop/route.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261002203000_shop_page_atomic_save.sql"), "utf8");
    expect(route).toContain('club.presentationTemplateKey === "editorial@1" && !club.storeEnabled');
    expect(migration.match(/homepage_design\(p_club_id\)->>'templateKey'='editorial@1'/g)).toHaveLength(2);
    expect(migration.match(/raise exception 'PAGE_UNAVAILABLE' using errcode='22023'/g)?.length).toBeGreaterThanOrEqual(3);
  });
  it("sends only changed variants on the selected public page", () => {
    const current = snapshot("shop");
    const draft = draftFromShopSnapshot(current);
    draft.variants.home.section.title = "Updated home kit";
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(current, draft, operationId);
    expect(request.surface).toBe("shop");
    expect(request.expectedRevision).toBe("7");
    expect(Object.keys(request.variants)).toEqual(["home"]);
    expect(request.variants.home?.section.title).toBe("Updated home kit");
    expect(request.variants.home?.photos).toEqual([{ rowId: photoId, assetId: null, order: 0 }]);
    expect(request).not.toHaveProperty("photoRows");
    expect(request).not.toHaveProperty("purchase");
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
  });

  it("keeps the independent homepage feature free of Shop page extras", () => {
    const current = snapshot("home");
    const draft = draftFromShopSnapshot(current);
    draft.variants.home.section.title = "Homepage kit";
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(current, draft, operationId);
    expect(request.surface).toBe("home");
    expect(request).not.toHaveProperty("photoRows");
    expect(request).not.toHaveProperty("purchase");
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
    expect(shopSaveRequestSchema.safeParse({ ...request, purchase: draft.purchase }).success).toBe(false);
    expect(shopSaveRequestSchema.safeParse({ ...request, variants: { away: request.variants.home } }).success).toBe(false);
  });

  it("rejects script and malformed purchase destinations before the RPC", () => {
    const current = snapshot("shop");
    const draft = draftFromShopSnapshot(current);
    draft.variants.home.section.cta_link = "javascript:alert(1)";
    draft.changedVariants = ["home"];
    expect(shopSaveRequestSchema.safeParse(toShopSaveRequest(current, draft, operationId)).success).toBe(false);
    draft.variants.home.section.cta_link = "https://example.com/kit";
    expect(shopSaveRequestSchema.safeParse(toShopSaveRequest(current, draft, operationId)).success).toBe(true);
    draft.changedVariants = [];
    draft.purchaseChanged = true;
    draft.purchase.cta_link = "/shop";
    expect(shopSaveRequestSchema.safeParse(toShopSaveRequest(current, draft, operationId)).success).toBe(false);
    draft.purchase.cta_link = "https://example.com/checkout";
    expect(shopSaveRequestSchema.safeParse(toShopSaveRequest(current, draft, operationId)).success).toBe(true);
  });

  it("hydrates only media listed in the tenant-scoped snapshot", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    try {
      const current = snapshot("shop");
      current.photos[0].assetId = photoId;
      current.media = [{ id: photoId, storage_bucket: "onzio-media", storage_path: "club/shop/photo.jpg" }];
      expect(hydrateShopSnapshot(current).photos[0].url).toBe("http://127.0.0.1:54321/storage/v1/object/public/onzio-media/club/shop/photo.jpg");
      current.media = [];
      expect(hydrateShopSnapshot(current).photos[0].url).toBe("https://example.com/old.jpg");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
});
