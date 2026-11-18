import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cinematicShopContentSchema, EMPTY_CINEMATIC_SHOP_CONTENT, MAX_SHOP_EDITIONS } from "@/lib/cinematic-shop-content";
import { shopSaveRequestSchemaFor, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, shopDraftDirty, toShopSaveRequest } from "@/lib/shop-editor/model";
import { RoseCityShopFields } from "@/components/admin/shop/rose-city/RoseCityShopFields";
import { LEAD_SCALE_BOUNDS, LEAD_TOP_BOUNDS, sizeColumnsFromText, sizeRowsFromTable, sizeTableRows, visibleKits } from "@/components/admin/shop/rose-city/shop-fields-model";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const operationId = "1c9d50f5-a8e5-41de-901b-7ef884155a09";
const photoId = "97a51639-b15d-4ac4-8097-12aaac91ec09";
const section = { eyebrow: "E", title: "CITY", description: "D", bullet_points: ["a", "b"], store_note: "", cta_label: "BUY", cta_link: "https://shop.example/buy" };
const snapshot: ShopSnapshot = {
  revision: "7", designRevision: "v2", templateKey: "cinematic@2", surface: "shop",
  sections: [{ id: "s1", kit_variant: "home", ...section }],
  photos: [{ rowId: "9f1b7b0e-0000-4000-8000-000000000001", assetId: photoId, url: "https://x/y.png", order: 0, kit_variant: "home" }],
  photoRows: [], purchase: null, media: [],
  presentation: {
    ...EMPTY_CINEMATIC_SHOP_CONTENT, leadScale: 80, leadTop: 5,
    editions: [{ label: "Authentic", price: "$115", line: "", link: "" }, { label: "Replica", price: "$95", line: "", link: "" }],
    sizeChart: { heading: "Size chart", columns: ["S", "M"], rows: [{ label: "Chest", values: ["1", "2"] }], note: "" },
  },
};
const schema = shopSaveRequestSchemaFor(10);

describe("Rose City Shop, Both kits: payloads", () => {
  it("an untouched page is clean and builds no changes, so nothing is sent", () => {
    const draft = draftFromShopSnapshot(snapshot);
    expect(shopDraftDirty(draft)).toBe(false);
    expect(draft.presentation.leadScale).toBe(80);
    expect(draft.presentation.leadTop).toBe(5);
  });

  it("a kit text edit sends the same request as before: that kit only, no presentation", () => {
    const draft = draftFromShopSnapshot(snapshot);
    draft.variants.home = { ...draft.variants.home, section: { ...draft.variants.home.section, title: "CITY OF ROSES" } };
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(snapshot, draft, operationId);
    expect(Object.keys(request.variants)).toEqual(["home"]);
    expect(request).not.toHaveProperty("presentation");
    expect(request).not.toHaveProperty("photoRows");
    expect(request.variants.home?.photos).toEqual([{ rowId: "9f1b7b0e-0000-4000-8000-000000000001", assetId: photoId, order: 0 }]);
    expect(schema.safeParse(request).success).toBe(true);
  });

  it("moving a slider changes only leadScale or leadTop in the saved presentation", () => {
    const base = draftFromShopSnapshot(snapshot);
    const before = toShopSaveRequest(snapshot, { ...base, presentationChanged: true }, operationId).presentation!;
    const moved = { ...base, presentation: { ...base.presentation, leadScale: 62.5, leadTop: 12 }, presentationChanged: true };
    const after = toShopSaveRequest(snapshot, moved, operationId).presentation!;
    expect({ ...after, leadScale: before.leadScale, leadTop: before.leadTop }).toEqual(before);
    expect(after.leadScale).toBe(62.5);
    expect(after.leadTop).toBe(12);
    expect(schema.safeParse(toShopSaveRequest(snapshot, moved, operationId)).success).toBe(true);
  });

  it("the homepage feature accepts the home kit only, on its own request", () => {
    const home: ShopSnapshot = { ...snapshot, surface: "home", presentation: null };
    const draft = draftFromShopSnapshot(home);
    draft.variants.home = { ...draft.variants.home, section: { ...draft.variants.home.section, title: "X" } };
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(home, draft, operationId);
    expect(request.surface).toBe("home");
    expect(schema.safeParse(request).success).toBe(true);
    expect(schema.safeParse({ ...request, variants: { ...request.variants, away: request.variants.home } }).success).toBe(false);
  });

  it("kit photos need at least one and at most six", () => {
    const draft = draftFromShopSnapshot(snapshot);
    draft.changedVariants = ["home"];
    const request = toShopSaveRequest(snapshot, { ...draft, variants: { ...draft.variants, home: { ...draft.variants.home, photos: [] } } }, operationId);
    expect(schema.safeParse(request).success).toBe(false);
    const photo = { rowId: null, assetId: photoId, order: 0 };
    const six = toShopSaveRequest(snapshot, draft, operationId);
    six.variants.home!.photos = Array.from({ length: 6 }, (_, order) => ({ ...photo, order }));
    expect(schema.safeParse(six).success).toBe(true);
    six.variants.home!.photos = Array.from({ length: 7 }, (_, order) => ({ ...photo, order }));
    expect(schema.safeParse(six).success).toBe(false);
  });

  it("the editor uses the existing builders, schema and endpoints and nothing else", () => {
    const editor = read("components/admin/shop/rose-city/RoseCityShopEditor.tsx");
    expect(editor).toContain("toShopSaveRequest(targetSnapshot, targetDraft, crypto.randomUUID())");
    expect(editor).toContain("shopSaveRequestSchemaFor(maxBulletPoints)");
    expect(editor).toContain("submitPageSave<ShopSnapshot>");
    expect(editor).toContain('"/api/admin/shop"');
    expect(editor).toContain('"X-Editor-Recovery": "1"');
    expect(editor).toContain("`/api/admin/shop?surface=${target}&operationId=${request.operationId}`");
    expect(editor).toContain('result.status === 409 && result.code === "CONTENT_CHANGED"');
    expect(editor).not.toContain(".rpc(");
  });
});

describe("Rose City Shop, Both kits: jersey options", () => {
  const draft = draftFromShopSnapshot(snapshot);
  const noop = () => undefined;
  const render = (editionCount: number) => {
    const d = { ...draft, presentation: { ...draft.presentation, editions: Array.from({ length: editionCount }, (_, i) => ({ label: `L${i}`, price: "", line: "", link: "" })) } };
    return renderToStaticMarkup(createElement(RoseCityShopFields, {
      id: "editions", surface: "shop", kitId: "home", draft: d, maxBulletPoints: 10, uploading: false,
      setSectionField: noop, setKitPhotos: noop, setRowPhotos: noop, uploadPhotos: noop, removePhoto: noop, updatePurchase: noop, updatePresentation: noop,
      uploadMap: noop, removeMap: noop, uploadDetail: noop, removeDetail: noop,
    }));
  };
  it.each([1, 2, 3])("with %i options only the last one can be removed", (count) => {
    const html = render(count);
    expect(html.match(/Remove (home|away|third) kit option/gi)?.length ?? 0).toBe(1);
    expect(html).toContain(`Remove ${["home", "away", "third"][count - 1]} kit option`);
    expect(html.match(/data-edition-locked/g)?.length ?? 0).toBe(count - 1);
    expect(html.includes("Add ")).toBe(count < MAX_SHOP_EDITIONS);
  });
  it("shows a kit column for each option, plus a saved or photographed kit, and Home always", () => {
    const kits = (away: boolean, third: boolean) => ({ home: { exists: false, photoCount: 0 }, away: { exists: away, photoCount: 0 }, third: { exists: third, photoCount: 0 } });
    const order = ["home", "away", "third"] as const;
    expect(visibleKits({ editionCount: 0, kits: kits(false, false) }, order)).toEqual(["home"]);
    expect(visibleKits({ editionCount: 2, kits: kits(false, false) }, order)).toEqual(["home", "away"]);
    expect(visibleKits({ editionCount: 3, kits: kits(false, false) }, order)).toEqual(["home", "away", "third"]);
    expect(visibleKits({ editionCount: 2, kits: kits(false, true) }, order)).toEqual(["home", "away", "third"]);
  });
});

describe("Rose City Shop, Both kits: sliders and size chart", () => {
  it("slider bounds equal the schema's bounds and nothing outside is accepted", () => {
    expect(LEAD_SCALE_BOUNDS).toMatchObject({ min: 30, max: 100 });
    expect(LEAD_TOP_BOUNDS).toMatchObject({ min: 0, max: 30 });
    const ok = (changes: object) => cinematicShopContentSchema.safeParse({ ...EMPTY_CINEMATIC_SHOP_CONTENT, ...changes }).success;
    expect([ok({ leadScale: 30 }), ok({ leadScale: 100 }), ok({ leadTop: 0 }), ok({ leadTop: 30 })]).toEqual([true, true, true, true]);
    expect([ok({ leadScale: 29.5 }), ok({ leadScale: 100.5 }), ok({ leadTop: -0.5 }), ok({ leadTop: 30.5 })]).toEqual([false, false, false, false]);
    const fields = read("components/admin/shop/rose-city/RoseCityShopFields.tsx");
    expect(fields).toContain('"leadScale"');
    expect(fields).toContain('"leadTop"');
    expect(fields).toContain("min={30} max={100}");
    expect(fields).toContain("min={0} max={30}");
  });
  it("the size chart round-trips through the table with one value per size", () => {
    const chart = snapshot.presentation!.sizeChart;
    expect(sizeRowsFromTable(sizeTableRows(chart), chart.columns.length)).toEqual(chart.rows);
    expect(sizeRowsFromTable([["Chest", "1"]], 3)).toEqual([{ label: "Chest", values: ["1", "", ""] }]);
    expect(sizeColumnsFromText("S, M, L")).toEqual(["S", "M", "L"]);
    expect(sizeColumnsFromText("S, M, ")).toEqual(["S", "M"]);
    expect(sizeColumnsFromText("a,b,c,d,e,f,g,h,i")).toHaveLength(8);
  });
  it("leaves Diverse City and the legacy editors untouched", () => {
    const page = read("app/admin/(protected)/shop/page.tsx");
    expect(page).toContain("<ClassicShopPageEditor />");
    expect(page).toContain("<ShopPageEditor />");
    expect(page.match(/"cinematic@2"/g)).toHaveLength(1);
    expect(page.match(/presentationTemplateKey/g)).toHaveLength(1);
  });
});
