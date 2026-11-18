import { describe, expect, it } from "vitest";
import { shopSaveRequestSchema, shopSaveRequestSchemaFor, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, toShopSaveRequest } from "@/lib/shop-editor/model";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CINEMATIC_KIT_BULLET_POINTS, MAX_KIT_BULLET_POINTS } from "@/lib/shop-kit";

/** The Shop editor's per-design limit: 10 on the cinematic@2 branch, 8 on every other (ShopPageEditor useShopPresentation). */
const maxKitBulletPoints = (templateKey: string) => templateKey === "cinematic@2" ? CINEMATIC_KIT_BULLET_POINTS : MAX_KIT_BULLET_POINTS;

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

describe("Shop kit bullet limit by template", () => {
  const ten = Array.from({ length: 10 }, (_, index) => `Bullet ${index + 1}`);

  function tenBulletRequest(templateKey: string, surface: "home" | "shop") {
    const current = { ...snapshot(surface), templateKey };
    const draft = draftFromShopSnapshot(current);
    draft.variants.home.section.bullet_points = [...ten];
    draft.changedVariants = ["home"];
    return toShopSaveRequest(current, draft, operationId);
  }

  it("keeps all ten bullets in a cinematic@2 save on the Shop page and the homepage jersey", () => {
    for (const surface of ["shop", "home"] as const) {
      const request = tenBulletRequest("cinematic@2", surface);
      expect(request.variants.home?.section.bullet_points).toEqual(ten);
      const parsed = shopSaveRequestSchemaFor(maxKitBulletPoints("cinematic@2")).safeParse(request);
      expect(parsed.success, surface).toBe(true);
      expect(parsed.data?.variants.home?.section.bullet_points).toEqual(ten);
    }
  });

  it("rejects a ninth bullet for every other template, and allows eight", () => {
    for (const templateKey of ["cinematic@1", "academy@1", "clubhouse@1", "editorial@1"]) {
      const schema = shopSaveRequestSchemaFor(maxKitBulletPoints(templateKey));
      const request = tenBulletRequest(templateKey, "shop");
      const parsed = schema.safeParse(request);
      expect(parsed.success, templateKey).toBe(false);
      expect(parsed.error?.issues[0]).toMatchObject({
        path: ["variants", "home", "section", "bullet_points"],
        message: "Each kit can have up to 8 bullet points.",
      });
      const eight = { ...request, variants: { home: { ...request.variants.home!, section: { ...request.variants.home!.section, bullet_points: ten.slice(0, 8) } } } };
      expect(schema.safeParse(eight).success, templateKey).toBe(true);
    }
  });

  it("never accepts more than ten, whatever the template", () => {
    const request = tenBulletRequest("cinematic@2", "shop");
    const eleven = { ...request, variants: { home: { ...request.variants.home!, section: { ...request.variants.home!.section, bullet_points: [...ten, "Bullet 11"] } } } };
    expect(shopSaveRequestSchema.safeParse(eleven).success).toBe(false);
    expect(shopSaveRequestSchemaFor(maxKitBulletPoints("cinematic@2")).safeParse(eleven).success).toBe(false);
  });

  it("gives the Shop editor 10 only on its cinematic@2 branch and 8 on every other design branch", () => {
    const editor = readFileSync(resolve(process.cwd(), "components/admin/shop/ShopPageEditor.tsx"), "utf8").replace(/\r\n/g, "\n");
    const branch = editor.slice(editor.indexOf("const { variants, maxBulletPoints }"), editor.indexOf("return {", editor.indexOf("const { variants, maxBulletPoints }")));
    expect(branch).toContain("isCinematic ? { variants: [...SHOP_EDITION_VARIANTS], maxBulletPoints: CINEMATIC_KIT_BULLET_POINTS }");
    expect(branch.match(/maxBulletPoints: CINEMATIC_KIT_BULLET_POINTS/g)).toHaveLength(1);
    expect(branch.match(/maxBulletPoints: MAX_KIT_BULLET_POINTS/g)).toHaveLength(3);
    expect(editor).toContain("const isCinematic = template === \"cinematic@2\";");
    expect(editor).toContain("slice(0, maxBulletPoints)");
    expect(editor).toContain("shopSaveRequestSchemaFor(maxBulletPoints)");
  });
});
