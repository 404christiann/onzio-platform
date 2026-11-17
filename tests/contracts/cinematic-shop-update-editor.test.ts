import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicShopFields from "@/components/admin/shop/CinematicShopFields";
import { EMPTY_CINEMATIC_SHOP_CONTENT, type ShopEdition } from "@/lib/cinematic-shop-content";
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

  it("gives the cinematic Shop page Home, Away and Third kit tabs, leaving other designs and the homepage feature alone", () => {
    const editor = readFileSync(resolve(process.cwd(), "components/admin/shop/ShopPageEditor.tsx"), "utf8");
    const designBranch = editor.replace(/\r\n/g, "\n");
    expect(designBranch).toContain("= shopPolicy ? { variants: [...shopPolicy.variants], maxBulletPoints: MAX_KIT_BULLET_POINTS }\n"
      + "    : sharedWithHomepage ? { variants: SHOP_VARIANTS, maxBulletPoints: MAX_KIT_BULLET_POINTS }\n"
      + "    : isCinematic ? { variants: [...SHOP_EDITION_VARIANTS], maxBulletPoints: CINEMATIC_KIT_BULLET_POINTS }\n"
      + '    : { variants: ["home", "away"], maxBulletPoints: MAX_KIT_BULLET_POINTS };');
    expect(editor).toContain('const KIT_LABELS: Record<ShopVariant, string> = { home: "Home kit", third: "Third kit", away: "Away kit" };');
    expect(editor).toContain('const currentVariant: ShopVariant = surface === "home" || !variants.includes(selectedVariant) ? "home" : selectedVariant;');
    expect(editor).toContain('{surface === "shop" && variants.length > 1 && <div className="flex flex-wrap items-center gap-2" aria-label="Edit kit">');
    expect(editor).toContain('<ToolButton label="Edit jersey options" onClick={() => setTarget("editions")} />');
    expect(editor).toContain('target === "editions" ? "Jersey options"');
    expect(editor).not.toContain("Edit prices");
    // A jersey option in the canvas selects its kit tab.
    expect(editor).toContain('onVariantChange={variant => { setSelectedVariant(variant); setTarget(current => current === "editions" ? current : "copy"); }}');
  });

  it("edits up to three jersey options titled by kit, plus the heading over them", () => {
    const option = (label: string): ShopEdition => ({ label, price: "$115", line: "", link: "" });
    const fields = (editions: ShopEdition[], editionsHeading = "") => renderToStaticMarkup(createElement(CinematicShopFields, {
      target: "editions", value: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions, editionsHeading }, onChange: () => undefined, uploading: false,
      onUploadMap: () => undefined, onRemoveMap: () => undefined, onUploadDetail: () => undefined, onRemoveDetail: () => undefined,
    }));
    const three = fields([option("Home jersey"), option("Away jersey"), option("Foothill Transit Edition jersey")], "Pick your kit");
    expect([...three.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map(match => match[1])).toEqual(["Home kit option", "Away kit option", "Third kit option"]);
    expect(three).not.toContain(">Add ");
    expect(three).toContain(">Remove third kit option<");
    expect(three).not.toContain(">Remove home kit option<");
    expect(three).toContain("Section heading");
    expect(three).toContain('placeholder="Select your jersey" maxLength="80" value="Pick your kit"');
    const two = fields([option("Home jersey"), option("Away jersey")]);
    expect(two).toContain(">Add third kit option<");
    expect(two).toContain(">Remove away kit option<");
    expect(fields([])).toContain(">Add home kit option<");
  });

  it("round-trips the heading and saves a Third kit with its photo row", () => {
    const snapshot: ShopSnapshot = { ...base, presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editionsHeading: "Pick your kit" } };
    const draft = draftFromShopSnapshot(withEnv(() => hydrateShopSnapshot(snapshot)));
    expect(draft.presentation.editionsHeading).toBe("Pick your kit");
    draft.presentation.editionsHeading = "Select your jersey";
    draft.presentation.editions = [{ label: "Home jersey", price: "$115", line: "", link: "" }, { label: "Away jersey", price: "$115", line: "", link: "" }, { label: "Foothill Transit Edition jersey", price: "$115", line: "", link: "" }];
    draft.presentationChanged = true;
    draft.variants.third = { exists: true, section: { ...draft.variants.third.section, title: "Going Good Places", bullet_points: ["Foothill crest"] }, photos: [{ rowId: null, assetId: photo, url: "/third.png", order: 0 }] };
    draft.photoRows.third = [{ rowId: null, assetId: foreign, url: "/row.png", order: 0 }];
    draft.changedVariants = ["third"]; draft.changedRows = ["third"];
    const request = toShopSaveRequest(snapshot, draft, operationId);
    expect(request.presentation?.editionsHeading).toBe("Select your jersey");
    expect(request.presentation?.editions).toHaveLength(3);
    expect(Object.keys(request.variants)).toEqual(["third"]);
    expect(request.photoRows).toEqual({ third: [{ rowId: null, assetId: foreign, order: 0 }] });
    expect(shopSaveRequestSchema.safeParse(request).success).toBe(true);
  });

  it("sends exactly the payload the database before the jersey-options migration accepts when no new feature is used", () => {
    // The keys that 20261104040000's validate_cinematic_shop_content allows (legacy required, added optional).
    const oldSql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261104040000_cinematic_shop_update.sql"), "utf8");
    const list = (name: string) => [...oldSql.match(new RegExp(`${name} text\\[\\]:=array\\[([^\\]]*)\\]`))![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    const legacyKeys = list("legacy"), addedKeys = list("added");
    expect(addedKeys).not.toContain("editionsHeading");
    const current: ShopSnapshot = {
      ...base,
      sections: [{ id: "home-kit", kit_variant: "home", eyebrow: "Match home 2027", title: "City of the Roses", description: "", bullet_points: ["League patch"], store_note: "", cta_label: "Buy now", cta_link: "https://example.com/kit" }],
      photos: [{ rowId: photo, assetId: null, url: "/lead.png", order: 0, kit_variant: "home" }],
      presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [{ label: "Authentic jersey", price: "$115", line: "", link: "" }, { label: "Replica jersey", price: "$95", line: "", link: "" }] },
    };
    for (const heading of [undefined, "", "  "]) {
      const draft = draftFromShopSnapshot(withEnv(() => hydrateShopSnapshot(current)));
      if (heading !== undefined) draft.presentation.editionsHeading = heading;
      draft.presentation.sponsorsHeading = "Our partners";
      draft.presentationChanged = true;
      draft.variants.home.section.title = "City of the Roses 2027";
      draft.changedVariants = ["home"];
      // The admin route forwards the parsed request to save_shop_page.
      const forwarded = JSON.parse(JSON.stringify(shopSaveRequestSchema.parse(toShopSaveRequest(current, draft, operationId))));
      expect(Object.keys(forwarded.presentation).sort()).toEqual([...legacyKeys, ...addedKeys].sort());
      expect(forwarded.presentation.editions.length).toBeLessThanOrEqual(2);
      expect(Object.keys(forwarded.variants)).toEqual(["home"]);
      expect(forwarded).not.toHaveProperty("photoRows");
    }
  });
});
