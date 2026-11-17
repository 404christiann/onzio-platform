import { describe, expect, it } from "vitest";
import { confirmShopDraft, currentShopPhotos, kitNeedsPhoto } from "@/components/admin/shop/classic-shop-state";
import { draftFromShopSnapshot, shopDraftDirty, toShopSaveRequest } from "@/lib/shop-editor/model";
import { shopSaveRequestSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";

const photoId = "97a51639-b15d-4ac4-8097-12aaac91ec09";
const assetId = "97a51639-b15d-4ac4-8097-12aaac91ec08";
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";
const snapshot = (): ShopSnapshot => ({ surface: "shop", revision: "1", designRevision: "one", templateKey: null,
  sections: [{ id: "section", kit_variant: "home", eyebrow: "Season", title: "Home kit", description: "Original", bullet_points: ["Sizes"], store_note: "Store", cta_label: "Order", cta_link: "https://example.test/kit" }],
  photos: [{ rowId: photoId, assetId, url: "/one.jpg", order: 0, kit_variant: "home" }], photoRows: [], purchase: null, media: [],
});

describe("classic Shop confirmed draft reconciliation", () => {
  it("restores Undo with the latest confirmed row reference after an older upload save", () => {
    const receipt = snapshot();
    const removedBeforeConfirmation = { ...receipt.photos[0], rowId: null };
    expect(currentShopPhotos([removedBeforeConfirmation], receipt.photos)).toEqual([{ ...removedBeforeConfirmation, rowId: photoId, order: 0 }]);
    expect(currentShopPhotos([{ ...receipt.photos[0] }], [])[0]).toMatchObject({ rowId: null, assetId });
    const legacy = { ...receipt.photos[0], assetId: null };
    expect(currentShopPhotos([legacy], [legacy])[0]).toEqual(legacy);
  });
  it("settles the exact confirmed draft and preserves the original request contract", () => {
    const saved = snapshot();
    const draft = draftFromShopSnapshot(saved);
    draft.variants.home.section.title = "Changed";
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(saved, draft, operationId);
    expect(request).toEqual({ operationId, surface: "shop", expectedRevision: "1", designRevision: "one", variants: { home: { section: draft.variants.home.section, photos: [{ rowId: photoId, assetId, order: 0 }] } } });
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
    saved.sections[0].title = "Changed";
    expect(shopDraftDirty(confirmShopDraft(draft, draft, saved))).toBe(false);
  });

  it("keeps only newer fields dirty while adopting confirmed normalization", () => {
    const receipt = snapshot();
    const submitted = draftFromShopSnapshot(receipt);
    submitted.variants.home.section.title = "Submitted";
    submitted.changedVariants = ["home"];
    const current = structuredClone(submitted);
    current.variants.home.section.description = "Typed during save";
    receipt.sections[0].title = "Submitted";
    receipt.sections[0].cta_link = "https://normalized.test/kit";
    const settled = confirmShopDraft(submitted, current, receipt);
    expect(settled.variants.home.section).toMatchObject({ title: "Submitted", description: "Typed during save", cta_link: "https://normalized.test/kit" });
    expect(settled.changedVariants).toEqual(["home"]);
    expect(current.variants.home.section.cta_link).toBe("https://example.test/kit");
  });

  it("keeps a newer upload, removal and reorder with real confirmed row identities", () => {
    const receipt = snapshot();
    const submitted = draftFromShopSnapshot(receipt);
    submitted.variants.home.photos[0].rowId = null;
    submitted.changedVariants = ["home"];
    const current = structuredClone(submitted);
    current.variants.home.photos.unshift({ rowId: null, assetId: "97a51639-b15d-4ac4-8097-12aaac91ec07", url: "/two.jpg", order: 0 });
    const settled = confirmShopDraft(submitted, current, receipt);
    expect(settled.variants.home.photos.map((photo) => photo.assetId)).toEqual([current.variants.home.photos[0].assetId, assetId]);
    expect(settled.variants.home.photos[1].rowId).toBe(photoId);
    current.variants.home.photos = [];
    expect(confirmShopDraft(submitted, current, receipt).variants.home.photos).toEqual([]);
  });

  it("keeps changes in other kits, rows and purchase cards during the older save", () => {
    const receipt = snapshot();
    const submitted = draftFromShopSnapshot(receipt);
    const current = structuredClone(submitted);
    current.variants.third.section.title = "New third";
    current.photoRows.away = [{ rowId: null, assetId, url: "/strip.jpg", order: 0 }];
    current.purchase.cards = [{ label: "Fit", title: "Unknown title retained", body: "New text" }];
    const settled = confirmShopDraft(submitted, current, receipt);
    expect(settled.changedVariants).toEqual(["third"]);
    expect(settled.changedRows).toEqual(["away"]);
    expect(settled.purchaseChanged).toBe(true);
    expect(settled.purchase.cards).toEqual(current.purchase.cards);
  });

  it("requires a photo for content in any kit, including a link, and leaves empty kits alone", () => {
    const page = draftFromShopSnapshot(snapshot());
    expect(kitNeedsPhoto(page, "third")).toBe(false);
    page.variants.third.section.cta_link = "mailto:kit@example.test";
    expect(kitNeedsPhoto(page, "third")).toBe(true);
    page.variants.third.photos = page.variants.home.photos;
    expect(kitNeedsPhoto(page, "third")).toBe(false);
  });
});
