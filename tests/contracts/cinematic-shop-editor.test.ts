import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cinematicShopContentSchema, EMPTY_CINEMATIC_SHOP_CONTENT, APPROVED_SHOP_MAP_CROP } from "@/lib/cinematic-shop-content";
import { shopSaveRequestSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, shopDraftDirty, toShopSaveRequest, rebaseShopDraft } from "@/lib/shop-editor/model";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";

const assetId = "97a51639-b15d-4ac4-8097-12aaac91ec09";
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";
const snapshot: ShopSnapshot = { revision: "7", designRevision: "v2", templateKey: "cinematic@2", surface: "shop", sections: [], photos: [], photoRows: [], purchase: null, media: [], presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT } };

describe("cinematic Shop authoring and atomic-save scope", () => {
  it("saves only changed Shop settings and strips derived image URLs/dimensions", () => {
    const draft = draftFromShopSnapshot(snapshot);
    draft.presentation = { ...draft.presentation, mapAssetId: assetId, mapUrl: "https://spoof.example/map.png", mapWidth: 900, mapHeight: 600, sponsorsHeading: "Our partners" };
    draft.presentationChanged = true;
    expect(shopDraftDirty(draft)).toBe(true);
    const request = toShopSaveRequest(snapshot, draft, operationId);
    expect(request.variants).toEqual({});
    expect(request.presentation?.mapAssetId).toBe(assetId);
    expect(request.presentation).not.toHaveProperty("mapUrl");
    expect(request.presentation).not.toHaveProperty("mapWidth");
    expect(request).not.toHaveProperty("purchase");
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
    expect(shopSaveRequestSchema.safeParse({ ...request, surface: "home" }).success).toBe(false);
  });

  it("keeps unsaved settings during conflict review and updates the revision", () => {
    const draft = draftFromShopSnapshot(snapshot);
    draft.presentation.sponsorsHeading = "Keep my heading";
    draft.presentationChanged = true;
    const next = { ...snapshot, revision: "8", presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, sponsorsHeading: "Other editor" } };
    const rebased = rebaseShopDraft(draft, next);
    expect(rebased.presentation.sponsorsHeading).toBe("Keep my heading");
    expect(toShopSaveRequest(next, rebased, operationId).expectedRevision).toBe("8");
    expect(snapshot.presentation?.sponsorsHeading).toBe("");
  });

  it("rejects crop overflow, malformed controls and untrusted media fields", () => {
    const valid = { ...EMPTY_CINEMATIC_SHOP_CONTENT, mapCrop: APPROVED_SHOP_MAP_CROP };
    expect(cinematicShopContentSchema.safeParse(valid).success).toBe(true);
    for (const changes of [{ mapCrop: { x: 90, y: 0, width: 20, height: 100 } }, { mapCrop: { x: 0, y: 0, width: 0, height: 100 } }, { mapVisible: "true" }, { leadScale: 101 }, { leadTop: -1 }, { mapAssetId: "javascript:alert(1)" }, { mapUrl: "https://other.example" }]) {
      expect(cinematicShopContentSchema.safeParse({ ...valid, ...changes }).success).toBe(false);
    }
  });

  it("hydrates map URLs only from the tenant snapshot's published media list", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    try {
      const content = { ...snapshot, presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, mapAssetId: assetId, mapUrl: "https://foreign.example" }, media: [{ id: assetId, storage_bucket: "onzio-media", storage_path: "club/shop/map 1.png", width: 1200, height: 800 }] };
      const hydrated = hydrateShopSnapshot(content);
      expect(hydrated.presentation?.mapUrl).toBe("http://127.0.0.1:55321/storage/v1/object/public/onzio-media/club/shop/map%201.png");
      expect(hydrated.presentation?.mapWidth).toBe(1200);
      expect(hydrateShopSnapshot({ ...content, media: [] }).presentation?.mapUrl).toBe("");
    } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous; }
  });

  it("starts empty cinematic kit fields without another club's store copy", () => {
    const draft = draftFromShopSnapshot(snapshot);
    expect(draft.variants.home.section.store_note).toBe("");
    expect(draft.variants.away.section.bullet_points).toEqual([]);
    expect(draft.presentation.mapAssetId).toBeNull();
  });

  it("uses one renderer for public/admin, gated to cinematic version two", () => {
    const route = readFileSync(resolve(process.cwd(), "app/(public)/shop/page.tsx"), "utf8");
    const editor = readFileSync(resolve(process.cwd(), "components/admin/shop/ShopPageEditor.tsx"), "utf8");
    const canvas = readFileSync(resolve(process.cwd(), "components/admin/shop/CinematicShopCanvas.tsx"), "utf8");
    const query = readFileSync(resolve(process.cwd(), "lib/cinematic-shop-query.ts"), "utf8");
    expect(route).toContain('club.presentationTemplateKey === "cinematic@2"');
    expect(route).toContain("<CinematicShopPage />");
    expect(editor).toContain('isCinematic && surface === "shop"');
    expect(canvas).toContain("<CinematicShop ");
    expect(query.match(/\.eq\("club_id", clubId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(query).not.toContain("normalizeShopPurchaseDetails");
  });
});
