import { describe, expect, it } from "vitest";
import type { ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, rebaseShopDraft, toShopSaveRequest } from "@/lib/shop-editor/model";

const baseline: ShopSnapshot = {
  surface: "shop", templateKey: "academy@1", revision: "1", designRevision: "design-1", sections: [],
  photos: [{ rowId: "old-row", assetId: "published-asset", kit_variant: "home", order: 0, url: "/photo.webp" }],
  photoRows: [], purchase: null, media: [],
};

describe("Shop draft rebasing after conflict review", () => {
  it("preserves draft copy and published photos while removing obsolete photo-row references", () => {
    const draft = draftFromShopSnapshot(baseline);
    draft.variants.home.section.title = "Keep my title";
    draft.changedVariants = ["home"];
    const latest = { ...baseline, revision: "2", photos: [] };
    const rebased = rebaseShopDraft(draft, latest);
    expect(rebased.variants.home.section.title).toBe("Keep my title");
    expect(rebased.variants.home.photos).toEqual([{ rowId: null, assetId: "published-asset", order: 0, url: "/photo.webp" }]);
    const request = toShopSaveRequest(latest, rebased, "same-draft-new-operation");
    expect(request.expectedRevision).toBe("2");
    expect(request.variants.home?.photos).toEqual([{ rowId: null, assetId: "published-asset", order: 0 }]);
    expect(draft.variants.home.photos[0].rowId).toBe("old-row");
  });

  it("adopts the current row ID when the same published asset was re-added elsewhere", () => {
    const latest = { ...baseline, revision: "2", photos: [{ ...baseline.photos[0], rowId: "new-row" }] };
    expect(rebaseShopDraft(draftFromShopSnapshot(baseline), latest).variants.home.photos[0].rowId).toBe("new-row");
  });
});
