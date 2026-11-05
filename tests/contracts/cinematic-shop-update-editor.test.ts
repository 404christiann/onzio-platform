import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { shopSaveRequestSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, toShopSaveRequest } from "@/lib/shop-editor/model";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";

const photo = "97a51639-b15d-4ac4-8097-12aaac91ec09";
const foreign = "5b2b8c3e-0e57-4d0c-9a52-0d1f7b0d6a11";
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";
const base: ShopSnapshot = { revision: "3", designRevision: "v2", templateKey: "cinematic@2", surface: "shop", sections: [], photos: [], photoRows: [], purchase: null, media: [], presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT } };
const legacy = { mapAssetId: null, mapAlt: "", mapVisible: true, mapCrop: null, sponsorsHeading: "Partners", sponsorsVisible: true, homeLabel: "Home", awayLabel: "Away", galleryLabel: "Kit photos", emptyMessage: "Soon", leadScale: 80, leadTop: 5 };

function withEnv<T>(run: () => T): T {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
  try { return run(); } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous; }
}

describe("RC2027 Shop update editor draft", () => {
  it("opens a Shop saved before the update with empty new sections and saves it cleanly", () => {
    const snapshot = { ...base, presentation: legacy } as unknown as ShopSnapshot;
    const draft = draftFromShopSnapshot(withEnv(() => hydrateShopSnapshot(snapshot)));
    expect(draft.presentation).toMatchObject({ editions: [], details: [], cardIcons: [], attributes: [], detailsHeading: "", mapHeading: "" });
    expect(draft.presentation.sizeChart).toEqual({ heading: "", columns: [], rows: [], note: "" });
    draft.presentation.editions = [{ label: "Authentic jersey", price: "$115", line: "Authentic RCFC Jersey", link: "" }];
    draft.presentationChanged = true;
    expect(shopSaveRequestSchema.safeParse(toShopSaveRequest(snapshot, draft, operationId)).success).toBe(true);
  });

  it("shows detail photos only from this club's published media in the snapshot", () => {
    const snapshot: ShopSnapshot = {
      ...base,
      presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, details: [{ assetId: photo, alt: "Crest", title: "3D crest", body: "" }, { assetId: foreign, alt: "", title: "Numbers", body: "" }, { assetId: null, alt: "", title: "Fabric", body: "" }] },
      media: [{ id: photo, storage_bucket: "onzio-media", storage_path: "club/shop/crest 1.webp", width: 1200, height: 1150 }],
    };
    const details = withEnv(() => hydrateShopSnapshot(snapshot)).presentation!.details;
    expect(details[0]).toMatchObject({ url: "http://127.0.0.1:55321/storage/v1/object/public/onzio-media/club/shop/crest%201.webp", width: 1200, height: 1150 });
    expect(details[1].url).toBe("");
    expect(details[2].url).toBe("");
  });

  it("saves detail photo identities and words, never their display addresses", () => {
    const draft = draftFromShopSnapshot(base);
    draft.presentation.details = [{ assetId: photo, alt: "Crest", title: "3D crest", body: "Silicon & satin", url: "https://spoof.example/a.png", width: 9, height: 9 }];
    draft.presentation.cardIcons = ["video", "jersey", "shipping-box", "no-access"];
    draft.presentationChanged = true;
    const request = toShopSaveRequest(base, draft, operationId);
    expect(request.presentation?.details).toEqual([{ assetId: photo, alt: "Crest", title: "3D crest", body: "Silicon & satin" }]);
    expect(request.presentation?.cardIcons).toEqual(["video", "jersey", "shipping-box", "no-access"]);
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
  });

  it("blocks Save while a detail photo uploads and cleans up unsaved photos that are replaced or removed", () => {
    const editor = readFileSync(resolve(process.cwd(), "components/admin/shop/ShopPageEditor.tsx"), "utf8");
    const upload = editor.slice(editor.indexOf("async function uploadDetailPhoto"), editor.indexOf("async function removeDetailPhoto"));
    expect(upload).toContain("setUploading(true)");
    expect(upload).toContain("finally");
    expect(upload).toContain("cleanupUnsavedDetail(previous)");
    const remove = editor.slice(editor.indexOf("async function removeDetailPhoto"), editor.indexOf("async function savePage"));
    expect(remove).toContain("cleanupUnsavedDetail(");
    expect(editor).toMatch(/disabled=\{[^}]*uploading[^}]*\} onClick=\{\(\) => void savePage\(\)\}/);
  });
});
