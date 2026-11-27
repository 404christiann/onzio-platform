import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseStaticMarkup, type StaticElement } from "../helpers/static-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_REGISTRY, resolveEditTarget } from "@/lib/admin-edit-targets";
import { applyEditTargetStamps, watchEditTargetStamps, type EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { EMPTY_CINEMATIC_SHOP_CONTENT, SHOP_EDITION_VARIANTS } from "@/lib/cinematic-shop-content";
import type { ShopSnapshot, ShopSurface, ShopVariant } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, publicKit, publicPurchase, type ShopPageDraft } from "@/lib/shop-editor/model";
import ShopKitSection from "@/components/ShopKitSection";
import AcademyHomeShopFeature from "@/components/AcademyHomeShopFeature";
import AcademyShopPage from "@/components/sites/diverse-city/AcademyShopPage";
import ShopPurchaseDetailsSection from "@/components/ShopPurchaseDetailsSection";
import { RoseCityShopFields, type ShopFieldsProps, type ShopSectionId } from "@/components/admin/shop/rose-city/RoseCityShopFields";
import { KIT_PART_CSS, SHARED_LEFT_CSS, SHARED_RIGHT_CSS, ShopPagePreview, kitContentFromDraft } from "@/components/admin/shop/rose-city/ShopPreviewParts";
import {
  CLASSIC_PURCHASE_STAMPS, ROSE_CITY_LEFT_STAMPS, ROSE_CITY_RIGHT_STAMPS, SHOP_TARGETS, cardTarget, editionRowId, editionTarget, kitTarget,
  measurementCellTarget, measurementTarget, roseCityKitStamps, shopKitSectionStamps, shopSectionOf, tileTarget,
} from "@/components/admin/shop/shop-edit-targets";

/**
 * UI-PREVIEW-CLICK-SHOP: every Shop field has its control in the dialog carrying the id a preview click focuses it by, and
 * every stamp lands on the node that shows its field, run against the real public markup (CinematicShop through the editor's own
 * ShopPagePreview, ShopKitSection, ShopPurchaseDetailsSection) with the same hiding the Rose City frames apply.
 */
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("next/link", () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement("a", { href, className }, children) }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubId: () => "club-1", useClubContext: () => ({ id: "club-1", slug: "diverse-city", storeEnabled: true }) }));
vi.mock("@/components/ResilientImage", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: null }) }));

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const noop = () => undefined;

/* ---------------------------------------------------------------- fixture */
const photo = (id: string) => ({ rowId: id, assetId: null, url: `https://media.test/${id}.webp`, order: 0 });
const section = (kit: ShopVariant, i: number) => ({
  id: `section-${kit}`, kit_variant: kit, eyebrow: `Eyebrow ${kit}`, title: `Title ${kit}`, description: `Description ${kit}`, bullet_points: [`First ${kit}`, `Second ${kit}`],
  store_note: `Store note ${kit}`, cta_label: `Buy ${kit}`, cta_link: `https://store.test/${kit}/${i}`,
});
const snapshot = (): ShopSnapshot => ({
  revision: "1", designRevision: "v", templateKey: "cinematic@2", surface: "shop",
  sections: (["home", "away", "third"] as const).map(section),
  photos: (["home", "away", "third"] as const).map(kit => ({ ...photo(`kit-${kit}`), kit_variant: kit })),
  photoRows: (["home", "away", "third"] as const).map(kit => ({ ...photo(`row-${kit}`), kit_variant: kit })),
  purchase: {
    heading: "Jersey information",
    cards: [
      { label: "Label zero", title: "Title zero", body: "Body zero" },
      { label: "Label one", title: "Title one", body: "Body one" },
      { label: "Label two", title: "Title two", body: "Body two" },
    ],
    cta_eyebrow: "Footer label", cta_text: "Footer text", cta_label: "Order now", cta_link: "https://store.test/order",
  },
  media: [],
  presentation: {
    ...EMPTY_CINEMATIC_SHOP_CONTENT,
    editionsHeading: "Pick one",
    editions: [
      { label: "Home jersey", price: "$100", line: "Line for home", link: "" },
      { label: "Away jersey", price: "$110", line: "Line for away", link: "" },
      { label: "Third jersey", price: "$120", line: "Line for third", link: "https://store.test/third" },
    ],
    // Card 0 has no icon, so the icon of card 1 is the first icon on the page: a stamp mapped by count would call it card 0.
    cardIcons: ["", "jersey", "video"],
    detailsHeading: "Details heading",
    // Tile 0 has no photo (a placeholder box), tile 1 has one.
    details: [{ assetId: null, alt: "", title: "Tile zero", body: "Tile zero text" }, { assetId: "97a51639-b15d-4ac4-8097-12aaac91ec09", alt: "Tile one photo", title: "Tile one", body: "Tile one text", url: "https://media.test/tile.webp" }],
    attributes: ["Color: Red", "100% polyester"],
    sizeChart: { heading: "Size chart", columns: ["S", "M", "L"], rows: [{ label: "Chest (in)", values: ["35", "37", "39"] }, { label: "Length (in)", values: ["27", "28", "29"] }], note: "In inches" },
    mapHeading: "Map heading", mapVisible: true, mapUrl: "https://media.test/map.png", mapAlt: "Route map alt", mapWidth: 100, mapHeight: 50, mapAssetId: "97a51639-b15d-4ac4-8097-12aaac91ec10", mapCrop: { x: 10, y: 10, width: 50, height: 50 },
    sponsorsHeading: "Sponsors heading", sponsorsVisible: true,
  },
});
const SPONSORS = [{ id: "sponsor-1", placement: null, name: "Sponsor One", logo_url: "https://media.test/sponsor.png", sort_order: 0, show_on_homepage: true, show_in_footer: false, website_url: null, created_at: "" }];
const draft = (): ShopPageDraft => draftFromShopSnapshot(snapshot());

/* ---------------------------------------------------------------- helpers */
/** The selectors a frame's CSS hides with display:none, so a test sees only what the frame shows. */
function hiddenSelectors(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{\s*display:\s*none\s*!important;\s*\}/g)].flatMap(match => match[1].split(",").map(part => part.trim()).filter(Boolean));
}
function render(css: string, kit: ShopVariant = "home", stamps: readonly EditTargetStamp[] = []) {
  const value = draft();
  const kits = kitContentFromDraft(value, "shop");
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(ShopPagePreview, { draft: value, kits, kit, sponsors: SPONSORS })));
  const hidden = new Set<StaticElement>();
  for (const selector of hiddenSelectors(css)) for (const node of root.querySelectorAll(selector)) { hidden.add(node); for (const inner of node.descendants()) hidden.add(inner); }
  applyEditTargetStamps(root as unknown as ParentNode, stamps);
  return { root, shown: (node: StaticElement) => !hidden.has(node) };
}
const stampedIn = (root: StaticElement, id?: string) => [...root.descendants()].filter(node => { const value = node.getAttribute(EDIT_TARGET_ATTRIBUTE); return id === undefined ? value !== null : value === id; });
const text = (node: StaticElement) => node.textContent.replace(/\s+/g, " ").trim();
function only(frame: ReturnType<typeof render>, id: string) {
  const nodes = stampedIn(frame.root, id).filter(frame.shown);
  expect(nodes, id).toHaveLength(1);
  return nodes[0];
}
const idsShown = (frame: ReturnType<typeof render>) => [...new Set(stampedIn(frame.root).filter(frame.shown).map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE)!))].sort();
const index = (node: StaticElement, holder: string) => { const owner = node.closest(holder)!; return owner.parentElement!.children.indexOf(owner); };

/* ---------------------------------------------------------------- registry */
describe("the Shop registry", () => {
  const SECTIONS = EDIT_TARGET_REGISTRY.shop.sections;
  it("is the Shop route, and the kit and option fields are keyed by kit while cards and tiles are keyed by position", () => {
    expect(EDIT_TARGET_REGISTRY.shop.route).toBe("/admin/shop");
    expect(SECTIONS.kitText.fields).toBeUndefined();
    expect(SECTIONS.kitText.rowFields).toEqual(["eyebrow", "title", "description", "bullets", "storeNote", "buttonLabel", "buyLink"]);
    expect(SECTIONS.editions.rowFields).toEqual(["label", "price", "line", "link"]);
    expect(SECTIONS.purchase.rowFields).toEqual(["label", "title", "body", "icon"]);
    expect(SECTIONS.details.rowFields).toEqual(["photoAlt", "title", "text"]);
    expect(SECTIONS.sizes.rowFields).toEqual(["label", ...Array.from({ length: 8 }, (_, size) => `value${size}`)]);
  });

  it("builds row ids from the kit and the position, and rejects a kit or field that is not declared", () => {
    expect(kitTarget("away", "title")).toBe("shop.kitText.row:away.title");
    expect(editionTarget(2, "line")).toBe("shop.editions.row:third.line");
    expect(editionRowId(0)).toBe("home");
    expect(cardTarget(1, "icon")).toBe("shop.purchase.row:1.icon");
    expect(tileTarget(0, "photoAlt")).toBe("shop.details.row:0.photoAlt");
    expect(measurementCellTarget(2, "label")).toBe("shop.sizes.row:2.label");
    expect(measurementCellTarget(1, "c3")).toBe("shop.sizes.row:1.value3");
    expect(measurementCellTarget(0, "c8")).toBeUndefined();
    expect(resolveEditTarget("shop.kitText.row:third.buyLink")).toMatchObject({ section: "kitText", row: "third", route: "/admin/shop" });
    expect(resolveEditTarget("shop.kitText.title")).toBeNull();
    expect(resolveEditTarget("shop.nowhere.row:home.title")).toBeNull();
  });

  it("names the section of a declared Shop target and nothing for any other id", () => {
    expect(shopSectionOf(SHOP_TARGETS.sizesNote)).toBe("sizes");
    expect(shopSectionOf(kitTarget("home", "bullets"))).toBe("kitText");
    expect(shopSectionOf(editionTarget(1, "line"))).toBe("editions");
    expect(shopSectionOf(undefined)).toBeUndefined();
    expect(shopSectionOf("news.details.row:x.title")).toBeUndefined();
    expect(shopSectionOf("shop.sizes.nowhere")).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- the dialog's controls */
const api = (surface: ShopSurface = "shop", kitId: ShopVariant = "away"): ShopFieldsProps => ({
  surface, kitId, draft: draft(), maxBulletPoints: 8, uploading: false,
  setSectionField: noop, setKitPhotos: noop, setRowPhotos: noop, uploadPhotos: noop, removePhoto: noop, updatePurchase: noop, updatePresentation: noop,
  uploadMap: noop, removeMap: noop, uploadDetail: noop, removeDetail: noop,
});
const fieldsMarkup = (id: ShopSectionId, props = api()) => renderToStaticMarkup(createElement(RoseCityShopFields, { ...props, id }));
const stampsIn = (markup: string) => [...markup.matchAll(new RegExp(`${EDIT_TARGET_ATTRIBUTE}="([^"]+)"`, "g"))].map(match => match[1]);
const around = (markup: string, target: string) => {
  const at = markup.indexOf(`${EDIT_TARGET_ATTRIBUTE}="${target}"`);
  expect(at, target).toBeGreaterThan(-1);
  return markup.slice(at, at + 900);
};

const EXPECTED_CONTROLS: Record<ShopSectionId, string[]> = {
  editions: ["shop.editions.heading", ...["home", "away", "third"].flatMap(kit => ["label", "price", "line", "link"].map(field => `shop.editions.row:${kit}.${field}`))],
  kitPhotos: [],
  kitText: ["eyebrow", "title", "description", "bullets", "storeNote", "buttonLabel", "buyLink"].map(field => `shop.kitText.row:away.${field}`),
  photoRow: [],
  purchase: [
    ...["heading", "footerLabel", "footerText", "buttonLabel", "buttonLink"].map(field => `shop.purchase.${field}`),
    ...[0, 1, 2].flatMap(card => ["label", "title", "body", "icon"].map(field => `shop.purchase.row:${card}.${field}`)),
  ],
  details: ["shop.details.heading", ...[0, 1].flatMap(tile => ["photoAlt", "title", "text"].map(field => `shop.details.row:${tile}.${field}`))],
  care: ["shop.care.care"],
  sizes: [
    ...["heading", "sizes", "note"].map(field => `shop.sizes.${field}`),
    ...[0, 1].flatMap(row => ["label", "value0", "value1", "value2"].map(field => `shop.sizes.row:${row}.${field}`)),
  ],
  map: ["visible", "heading", "description", "wholeImage", "crop"].map(field => `shop.map.${field}`),
  partners: ["visible", "heading"].map(field => `shop.partners.${field}`),
  labels: ["homeLabel", "awayLabel", "photoRowLabel", "emptyMessage", "imageWidth", "imageTop"].map(field => `shop.labels.${field}`),
};

describe("Rose City Shop: every declared field has its control in the dialog", () => {
  it.each(Object.keys(EXPECTED_CONTROLS) as ShopSectionId[])("%s: each field is stamped on exactly one control under its own id, and nothing else is", id => {
    const stamped = stampsIn(fieldsMarkup(id));
    expect([...stamped].sort()).toEqual([...EXPECTED_CONTROLS[id]].sort());
    expect(new Set(stamped).size).toBe(stamped.length);
    for (const target of stamped) expect(resolveEditTarget(target), target).toMatchObject({ editor: "shop", section: id });
  });

  it("the controls together are exactly what the registry declares (the photo lists hold photos only and declare nothing)", () => {
    const declared = Object.entries(EDIT_TARGET_REGISTRY.shop.sections).flatMap(([section, spec]) => [
      ...(spec.fields ?? []).map(field => `shop.${section}.${field}`),
      ...(spec.rowFields ?? []).filter(field => section !== "sizes" || ["label", "value0", "value1", "value2"].includes(field)).flatMap(field => (section === "kitText" ? ["away"] : section === "editions" ? ["home", "away", "third"] : section === "purchase" ? ["0", "1", "2"] : ["0", "1"]).map(row => `shop.${section}.row:${row}.${field}`)),
    ]);
    const stamped = (Object.keys(EXPECTED_CONTROLS) as ShopSectionId[]).flatMap(id => stampsIn(fieldsMarkup(id)));
    expect([...stamped].sort()).toEqual([...declared].sort());
    expect(Object.keys(EXPECTED_CONTROLS).filter(id => !(id in EDIT_TARGET_REGISTRY.shop.sections))).toEqual(["kitPhotos", "photoRow"]);
  });

  it("each control's id is on the control the label names", () => {
    const text = fieldsMarkup("kitText");
    expect(around(text, kitTarget("away", "title"))).toMatch(/>Kit title<[\s\S]*value="Title away"/);
    expect(around(text, kitTarget("away", "bullets"))).toMatch(/>Bullet points, one per line<[\s\S]*First away/);
    expect(around(text, kitTarget("away", "buyLink"))).toMatch(/>Buy link<[\s\S]*value="https:\/\/store.test\/away\/1"/);
    const editions = fieldsMarkup("editions");
    expect(around(editions, editionTarget(1, "line"))).toMatch(/>Line under the title<[\s\S]*value="Line for away"/);
    expect(around(editions, editionTarget(2, "link"))).toMatch(/>Purchase link \(optional\)<[\s\S]*value="https:\/\/store.test\/third"/);
    const purchase = fieldsMarkup("purchase");
    expect(around(purchase, cardTarget(2, "title"))).toMatch(/>Title<[\s\S]*value="Title two"/);
    expect(around(purchase, cardTarget(1, "icon"))).toMatch(/>Icon<[\s\S]*<select/);
    expect(around(purchase, SHOP_TARGETS.purchaseButtonLabel)).toMatch(/>Button text<[\s\S]*value="Order now"/);
    expect(around(fieldsMarkup("details"), tileTarget(1, "photoAlt"))).toMatch(/>Photo description<[\s\S]*value="Tile one photo"/);
    expect(around(fieldsMarkup("sizes"), SHOP_TARGETS.sizes)).toMatch(/>Sizes, separated by commas<[\s\S]*value="S, M, L"/);
    expect(around(fieldsMarkup("sizes"), measurementTarget(1, "value2"))).toMatch(/<input[^>]*aria-label="L, measurement 2"[^>]*value="29"/);
    expect(around(fieldsMarkup("sizes"), measurementTarget(0, "label"))).toMatch(/<input[^>]*aria-label="Measurement, measurement 1"[^>]*value="Chest \(in\)"/);
    expect(around(fieldsMarkup("map"), SHOP_TARGETS.mapDescription)).toMatch(/>Map description<[\s\S]*value="Route map alt"/);
    expect(around(fieldsMarkup("partners"), SHOP_TARGETS.partnersHeading)).toMatch(/>Sponsor section heading<[\s\S]*value="Sponsors heading"/);
    expect(around(fieldsMarkup("labels"), SHOP_TARGETS.imageWidth)).toMatch(/Kit image width/);
  });

  it("the kit text controls follow the kit being edited; the Homepage feature has no Buy link control", () => {
    for (const kit of ["home", "third"] as const) {
      const stamped = stampsIn(fieldsMarkup("kitText", api("shop", kit)));
      expect(stamped.every(id => id.includes(`.row:${kit}.`)), kit).toBe(true);
    }
    const home = stampsIn(fieldsMarkup("kitText", api("home", "home")));
    expect(home).toHaveLength(6);
    expect(home).not.toContain(kitTarget("home", "buyLink"));
  });
});

/* ---------------------------------------------------------------- the Rose City frames */
describe("Rose City kit frames: each stamp is on the node that shows its field, for that kit", () => {
  for (const kit of SHOP_EDITION_VARIANTS) {
    it(`${kit}: title, small heading, line, description, bullets, store note and button`, () => {
      const frame = render(KIT_PART_CSS, kit, roseCityKitStamps(kit));
      expect(text(only(frame, kitTarget(kit, "title")))).toBe(`Title ${kit}`);
      expect(only(frame, kitTarget(kit, "title")).tagName).toBe("h1");
      expect(text(only(frame, kitTarget(kit, "eyebrow")))).toBe(`Eyebrow ${kit}`);
      // The line under the title belongs to this kit's jersey option, so its id is the option's.
      expect(text(only(frame, editionTarget(SHOP_EDITION_VARIANTS.indexOf(kit), "line")))).toBe(`Line for ${kit}`);
      expect(text(only(frame, kitTarget(kit, "description")))).toBe(`Description ${kit}`);
      expect(text(only(frame, kitTarget(kit, "bullets")))).toBe(`First ${kit}Second ${kit}`);
      expect(only(frame, kitTarget(kit, "bullets")).tagName).toBe("ul");
      expect(text(only(frame, kitTarget(kit, "storeNote")))).toBe(`Store note ${kit}`);
      expect(text(only(frame, kitTarget(kit, "buttonLabel")))).toContain(`Buy ${kit}`);
    });

    it(`${kit}: a frame carries only its own kit's ids, and only ids the registry declares`, () => {
      const frame = render(KIT_PART_CSS, kit, roseCityKitStamps(kit));
      const ids = idsShown(frame);
      expect(ids).toHaveLength(7);
      for (const id of ids) {
        const resolved = resolveEditTarget(id)!;
        expect(resolved, id).not.toBeNull();
        expect(resolved.row, id).toBe(kit);
      }
    });
  }

  it("the jersey options, kit photos and photo row carry no id (they hold no text field)", () => {
    const frame = render(KIT_PART_CSS, "home", roseCityKitStamps("home"));
    for (const node of frame.root.querySelectorAll(".shop-portrait, .shop-photo-row, .shop-options-heading, .shop-option")) expect(node.getAttribute(EDIT_TARGET_ATTRIBUTE)).toBeNull();
  });

  it("the Buy button is the feature's own link, never the small footer button", () => {
    const frame = render(KIT_PART_CSS, "home", [...roseCityKitStamps("home"), ...ROSE_CITY_LEFT_STAMPS]);
    const button = only(frame, kitTarget("home", "buttonLabel"));
    expect(button.classList.contains("shop-buy-small")).toBe(false);
    expect(stampedIn(frame.root, SHOP_TARGETS.purchaseButtonLabel).every(node => node.classList.contains("shop-buy-small"))).toBe(true);
  });
});

describe("Rose City left frame: Jersey details and Purchase details", () => {
  const frame = render(SHARED_LEFT_CSS, "home", ROSE_CITY_LEFT_STAMPS);
  it("the headings, the footer and the care line", () => {
    expect(text(only(frame, SHOP_TARGETS.detailsHeading))).toBe("Details heading");
    expect(text(only(frame, SHOP_TARGETS.purchaseHeading))).toBe("Jersey information");
    expect(text(only(frame, SHOP_TARGETS.purchaseFooterLabel))).toBe("Footer label");
    expect(text(only(frame, SHOP_TARGETS.purchaseFooterText))).toBe("Footer text");
    expect(text(only(frame, SHOP_TARGETS.purchaseButtonLabel))).toContain("Order now");
    expect(only(frame, SHOP_TARGETS.care).tagName).toBe("ul");
    expect(text(only(frame, SHOP_TARGETS.care))).toBe("Color: Red100% polyester");
  });

  it("each detail card's words carry that card's own position", () => {
    for (const [i, word] of ["zero", "one", "two"].entries()) {
      expect(text(only(frame, cardTarget(i, "label")))).toBe(`Label ${word}`);
      expect(text(only(frame, cardTarget(i, "title")))).toContain(`Title ${word}`);
      expect(text(only(frame, cardTarget(i, "body")))).toBe(`Body ${word}`);
    }
  });

  it("an icon carries its own card's position even when an earlier card has none (never the count of icons before it)", () => {
    const icons = stampedIn(frame.root).filter(node => node.classList.contains("shop-info-icon"));
    expect(icons).toHaveLength(2);
    expect(icons.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE))).toEqual([cardTarget(1, "icon"), cardTarget(2, "icon")]);
    expect(icons.map(node => index(node, ".shop-detail-grid > article"))).toEqual([1, 2]);
  });

  it("each Jersey details tile carries its own position, the photo-less tile's white box included", () => {
    expect(text(only(frame, tileTarget(0, "title")))).toBe("Tile zero");
    expect(text(only(frame, tileTarget(1, "title")))).toBe("Tile one");
    expect(text(only(frame, tileTarget(0, "text")))).toBe("Tile zero text");
    expect(text(only(frame, tileTarget(1, "text")))).toBe("Tile one text");
    expect(only(frame, tileTarget(0, "photoAlt")).classList.contains("shop-photo-pending")).toBe(true);
    expect(only(frame, tileTarget(1, "photoAlt")).getAttribute("src")).toBe("https://media.test/tile.webp");
  });

  it("every id on the frame is declared", () => {
    for (const id of idsShown(frame)) expect(resolveEditTarget(id), id).not.toBeNull();
  });
});

describe("Rose City right frame: size chart, route map and partner strip", () => {
  const frame = render(SHARED_RIGHT_CSS, "home", ROSE_CITY_RIGHT_STAMPS);
  it("the headings, the note, the map picture and the partner strip heading", () => {
    expect(text(only(frame, SHOP_TARGETS.sizesHeading))).toBe("Size chart");
    expect(text(only(frame, SHOP_TARGETS.sizesNote))).toBe("In inches");
    expect(text(only(frame, SHOP_TARGETS.mapHeading))).toBe("Map heading");
    expect(only(frame, SHOP_TARGETS.mapDescription).tagName).toBe("img");
    expect(only(frame, SHOP_TARGETS.mapDescription).getAttribute("alt")).toBe("Route map alt");
    expect(text(only(frame, SHOP_TARGETS.partnersHeading))).toBe("Sponsors heading");
  });

  const ids = (nodes: StaticElement[]) => nodes.map(node => node.getAttribute(EDIT_TARGET_ATTRIBUTE));
  it("the wide table: sizes across the top, each measurement's name and values in its own row; the corner has no field", () => {
    const wide = frame.root.querySelectorAll(".shop-size-wide")[0];
    expect(ids(wide.querySelectorAll("thead th"))).toEqual([null, SHOP_TARGETS.sizes, SHOP_TARGETS.sizes, SHOP_TARGETS.sizes]);
    expect(ids(wide.querySelectorAll("tbody th"))).toEqual([measurementTarget(0, "label"), measurementTarget(1, "label")]);
    expect(ids(wide.querySelectorAll("tbody td"))).toEqual([0, 1].flatMap(row => ([0, 1, 2] as const).map(size => measurementTarget(row, `value${size}`))));
    expect(text(stampedIn(wide as StaticElement, measurementTarget(1, "value2"))[0])).toBe("29");
  });

  it("the phone table turned sideways swaps the axes: measurement names across the top, sizes down the side, each cell still its own measurement and size", () => {
    const narrow = frame.root.querySelectorAll(".shop-size-narrow")[0];
    expect(ids(narrow.querySelectorAll("thead th"))).toEqual([null, measurementTarget(0, "label"), measurementTarget(1, "label")]);
    expect(ids(narrow.querySelectorAll("tbody th"))).toEqual([SHOP_TARGETS.sizes, SHOP_TARGETS.sizes, SHOP_TARGETS.sizes]);
    // Row i is size i; cell r of the row is measurement r. The same cell is the same id in both tables.
    expect(ids(narrow.querySelectorAll("tbody td"))).toEqual(([0, 1, 2] as const).flatMap(size => [0, 1].map(row => measurementTarget(row, `value${size}`))));
    expect(text(stampedIn(narrow as StaticElement, measurementTarget(1, "value2"))[0])).toBe("29");
    expect(text(stampedIn(narrow as StaticElement, measurementTarget(0, "value1"))[0])).toBe("37");
  });
});

/* ---------------------------------------------------------------- the homepage feature and Diverse City */
describe("ShopKitSection (the Rose City homepage feature and the classic Shop kit)", () => {
  function kitSection(kit: ShopVariant, ctaHref?: string) {
    const value = draft();
    const content = publicKit(value.variants[kit].section, value.variants[kit].photos, "shop", kit);
    const root = parseStaticMarkup(renderToStaticMarkup(createElement(ShopKitSection, { section: content.section, photos: content.photos, headingTag: "h1", animate: false, ctaHref })));
    applyEditTargetStamps(root as unknown as ParentNode, shopKitSectionStamps(kit));
    return root;
  }
  it.each([[undefined], ["/shop"]])("each field's id is on the node showing it (button link %s)", ctaHref => {
    const root = kitSection("away", ctaHref);
    const one = (field: Parameters<typeof kitTarget>[1]) => { const nodes = stampedIn(root, kitTarget("away", field)); expect(nodes, field).toHaveLength(1); return nodes[0]; };
    expect(text(one("eyebrow"))).toBe("Eyebrow away");
    expect(text(one("title"))).toBe("Title away");
    expect(one("title").tagName).toBe("h1");
    expect(text(one("description"))).toBe("Description away");
    expect(one("bullets").tagName).toBe("ul");
    expect(text(one("bullets"))).toBe("First awaySecond away");
    expect(text(one("storeNote"))).toBe("Store note away");
    expect(text(one("buttonLabel"))).toBe("Buy away");
    expect(one("buttonLabel").tagName).toBe("a");
    expect(stampedIn(root)).toHaveLength(6);
  });
});

describe("Diverse City's own pages (AcademyShopPage and AcademyHomeShopFeature)", () => {
  const value = draft();
  const content = (kit: ShopVariant) => { const built = publicKit(value.variants[kit].section, value.variants[kit].photos, "shop", kit); return { section: built.section, photos: built.photos }; };
  const stampedRoot = (component: unknown, kit: ShopVariant) => {
    const root = parseStaticMarkup(renderToStaticMarkup(createElement(component as never, { editorContent: content(kit) })));
    applyEditTargetStamps(root as unknown as ParentNode, shopKitSectionStamps(kit));
    return root;
  };
  it.each([[AcademyShopPage, "the Shop page", "dl"], [AcademyHomeShopFeature, "the homepage feature", "ul"]])("%#: %s carries each field's id on the node showing it", (component, _name, list) => {
    const root = stampedRoot(component, "home");
    const one = (field: Parameters<typeof kitTarget>[1]) => { const nodes = stampedIn(root, kitTarget("home", field)); expect(nodes, field).toHaveLength(1); return nodes[0]; };
    expect(text(one("eyebrow"))).toBe("Eyebrow home");
    expect(text(one("title"))).toBe("Title home");
    expect(text(one("description"))).toBe("Description home");
    expect(one("bullets").tagName).toBe(list);
    expect(text(one("storeNote"))).toBe("Store note home");
    expect(text(one("buttonLabel"))).toBe("Buy home");
    expect(stampedIn(root)).toHaveLength(6);
  });
  it("the Shop page draws only the first two bullets, and the whole list is still the one Bullet points field", () => {
    const many = draft();
    many.variants.home.section.bullet_points = ["One: a", "Two: b", "Three: c", "Four: d"];
    const built = publicKit(many.variants.home.section, many.variants.home.photos, "shop", "home");
    const root = parseStaticMarkup(renderToStaticMarkup(createElement(AcademyShopPage, { editorContent: { section: built.section, photos: built.photos } })));
    applyEditTargetStamps(root as unknown as ParentNode, shopKitSectionStamps("home"));
    const list = stampedIn(root, kitTarget("home", "bullets"));
    expect(list).toHaveLength(1);
    expect(list[0].querySelectorAll("dt")).toHaveLength(2);
  });
});

describe("ShopPurchaseDetailsSection (the classic Shop's Purchase details)", () => {
  const value = publicPurchase(snapshot().purchase as NonNullable<ShopPageDraft["purchase"]>);
  const root = parseStaticMarkup(renderToStaticMarkup(createElement(ShopPurchaseDetailsSection, { details: value, animate: false })));
  applyEditTargetStamps(root as unknown as ParentNode, CLASSIC_PURCHASE_STAMPS);
  const one = (id: string) => { const nodes = stampedIn(root, id); expect(nodes, id).toHaveLength(1); return nodes[0]; };

  it("the heading, footer and button", () => {
    expect(text(one(SHOP_TARGETS.purchaseHeading))).toBe("Jersey information");
    expect(text(one(SHOP_TARGETS.purchaseFooterLabel))).toBe("Footer label");
    expect(text(one(SHOP_TARGETS.purchaseFooterText))).toBe("Footer text");
    expect(text(one(SHOP_TARGETS.purchaseButtonLabel))).toBe("Order now");
  });
  it("each card's label, title and text carry that card's position", () => {
    for (const [i, word] of ["zero", "one", "two"].entries()) {
      expect(text(one(cardTarget(i, "label")))).toBe(`Label ${word}`);
      expect(text(one(cardTarget(i, "title")))).toBe(`Title ${word}`);
      expect(text(one(cardTarget(i, "body")))).toBe(`Body ${word}`);
    }
  });
  it("a blank card still holds its position, so the cards after it keep theirs", () => {
    const blank = { ...value, cards: [{ label: "", title: "", body: "" }, ...value.cards.slice(1)] };
    const withBlank = parseStaticMarkup(renderToStaticMarkup(createElement(ShopPurchaseDetailsSection, { details: blank, animate: false })));
    applyEditTargetStamps(withBlank as unknown as ParentNode, CLASSIC_PURCHASE_STAMPS);
    expect(text(stampedIn(withBlank, cardTarget(1, "title"))[0])).toBe("Title one");
    expect(text(stampedIn(withBlank, cardTarget(0, "title"))[0])).toBe("");
  });
  it("no saved link or button text means no button, so no id is on one", () => {
    const none = parseStaticMarkup(renderToStaticMarkup(createElement(ShopPurchaseDetailsSection, { details: { ...value, cta_link: "" }, animate: false })));
    applyEditTargetStamps(none as unknown as ParentNode, CLASSIC_PURCHASE_STAMPS);
    expect(stampedIn(none, SHOP_TARGETS.purchaseButtonLabel)).toHaveLength(0);
  });
});

describe("the stamps follow the page, not the draft", () => {
  it("watching re-stamps a re-rendered frame, and the stamp arrays are values of the kit alone", () => {
    const stamps = roseCityKitStamps("away");
    expect(roseCityKitStamps("away").map(stamp => stamp.selector)).toEqual(stamps.map(stamp => stamp.selector));
    const frame = render(KIT_PART_CSS, "away", []);
    const frames: (() => void)[] = [];
    let change = () => undefined as void;
    const stop = watchEditTargetStamps(frame.root as unknown as Node & ParentNode, stamps, {
      requestFrame: callback => { frames.push(callback); return frames.length; }, cancelFrame: handle => { frames[handle - 1] = () => undefined; },
      observe: (_, onChange) => { change = onChange; return { disconnect: () => undefined }; },
    });
    expect(stampedIn(frame.root)).toHaveLength(0);
    frames.at(-1)!();
    expect(stampedIn(frame.root, kitTarget("away", "title"))).toHaveLength(1);
    for (const node of frame.root.descendants()) node.removeAttribute(EDIT_TARGET_ATTRIBUTE);
    change();
    frames.at(-1)!();
    expect(stampedIn(frame.root, kitTarget("away", "title"))).toHaveLength(1);
    stop();
  });
});

/* ---------------------------------------------------------------- wiring */
describe("the Rose City Shop editor and frame", () => {
  const editor = read("components/admin/shop/rose-city/RoseCityShopEditor.tsx");
  const frame = read("components/admin/shop/rose-city/ShopScaledFrame.tsx");

  it("one approach: the frame stamps its own body and reads the click target's closest stamped node (no geometry hit test)", () => {
    expect(frame).toMatch(/useEffect\(\(\) => \(body && stamps \? watchEditTargetStamps\(body, stamps\) : undefined\), \[body, stamps\]\);/);
    expect(frame).toMatch(/const field = event\.detail > 0 \? resolveEditTarget\(target\.closest\(EDIT_TARGET_SELECTOR\)\?\.getAttribute\(EDIT_TARGET_ATTRIBUTE\)\)\?\.id : undefined;/);
    expect(frame).toMatch(/if \(hotspot \|\| field\) onSelect\(hotspot\?\.dataset\.shopEditorTarget \?\? "copy", field\);/);
    expect(frame).not.toMatch(/editTargetHitAt|editTargetAt/);
    expect(frame).toMatch(/\[data-edit-target\] \{ cursor:pointer; pointer-events:auto; \}/);
  });

  it("a click on a field opens the field's section on the frame's kit, then focuses it; a click on a part opens the part's section as before", () => {
    expect(editor).toMatch(/function openSection\(id: ShopSectionId, kit: ShopVariant \| null, event\?: MouseEvent<HTMLElement>, field\?: EditTargetId\) \{\s*if \(kit\) setActiveKit\(kit\);\s*dialog\.openSection\(id, event\);\s*dialog\.focusField\(field\);\s*\}/);
    expect(editor).toMatch(/const fieldSection = shopSectionOf\(field\);\s*const named = sections\.find\(section => section\.id === fieldSection\)\?\.id as ShopSectionId \| undefined;\s*const id = named \?\? TARGET_SECTION\[target\];\s*if \(id\) openSection\(id, KIT_SECTIONS\.includes\(id\) \? kit : null, undefined, named \? field : undefined\);/);
    expect(editor).toMatch(/focusRequest=\{dialog\.focusRequest\}/);
  });

  it("the chips beside the frames and the jersey option buttons open their sections with no field", () => {
    for (const label of ['aria-label="Edit kit text" onClick={(event) => openSection("kitText", kitId, event)}', 'aria-label="Edit kit photos" onClick={(event) => openSection("kitPhotos", kitId, event)}', 'aria-label="Edit photo row" onClick={(event) => openSection("photoRow", kitId, event)}', 'onClick={(event) => openSection("editions", null, event)}', 'onClick={(event) => openSection(id, null, event)}']) expect(editor).toContain(label);
  });

  it("every frame is given stamps built from the kit and surface alone, once (never the draft), and the clicked kit is the frame's kit", () => {
    expect(editor).toMatch(/const KIT_FRAME_STAMPS: Record<ShopVariant, readonly EditTargetStamp\[\]> = \{ home: roseCityKitStamps\("home"\), away: roseCityKitStamps\("away"\), third: roseCityKitStamps\("third"\) \};/);
    expect(editor).toMatch(/const HOME_FEATURE_STAMPS: readonly EditTargetStamp\[\] = shopKitSectionStamps\("home"\);/);
    expect(editor).toMatch(/stamps=\{surface === "shop" \? KIT_FRAME_STAMPS\[kitId\] : HOME_FEATURE_STAMPS\} onSelect=\{\(target, field\) => selectFromPreview\(target, kitId, field\)\}/);
    expect(editor).toMatch(/stamps=\{ROSE_CITY_LEFT_STAMPS\} onSelect=\{\(target, field\) => selectFromPreview\(target, null, field\)\}/);
    expect(editor).toMatch(/stamps=\{ROSE_CITY_RIGHT_STAMPS\} onSelect=\{\(target, field\) => selectFromPreview\(target, null, field\)\}/);
    expect(read("components/admin/shop/shop-edit-targets.ts")).not.toMatch(/ShopPageDraft|shop-editor\/model|\.length|index %/);
  });

  it("the dialog is the same EditorDialog, and the public components gain nothing", () => {
    for (const file of ["CinematicShop", "CinematicSponsors"]) expect(read(`components/cinematic/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
    for (const file of ["ShopKitSection", "ShopPurchaseDetailsSection"]) expect(read(`components/${file}.tsx`), file).not.toMatch(/edit-target|editTarget/);
  });
});

describe("the Diverse City classic Shop editor and frame", () => {
  const editor = read("components/admin/shop/ClassicShopPageEditor.tsx");
  const frame = read("components/admin/shop/ShopPreviewFrame.tsx");

  it("the frame stamps its body and reads the click target's closest stamped node, for a pointer click only and only when given stamps", () => {
    expect(frame).toMatch(/useEffect\(\(\) => \(body && stamps \? watchEditTargetStamps\(body, stamps\) : undefined\), \[body, stamps\]\);/);
    expect(frame).toMatch(/const field = stamps && event\.detail > 0 \? resolveEditTarget\(target\.closest\(EDIT_TARGET_SELECTOR\)\?\.getAttribute\(EDIT_TARGET_ATTRIBUTE\)\)\?\.id : undefined;/);
    expect(frame).toMatch(/onSelect\(hotspot\.dataset\.shopEditorTarget \?\? "copy", hotspot, field\);/);
  });

  it("the keyboard still opens the region with no field", () => {
    expect(frame).toMatch(/if \(classic\) hotspot\.click\(\);\s*else onSelect\(hotspot\.dataset\.shopEditorTarget \?\? "copy", hotspot\);/);
  });

  it("a field opens the dialog that holds it and asks it to focus the control; a part alone opens as before", () => {
    expect(editor).toMatch(/const FIELD_DIALOG: Record<string, Target> = \{ kitText: "copy", purchase: "purchase" \};/);
    expect(editor).toMatch(/const fieldDialog = FIELD_DIALOG\[shopSectionOf\(field\) \?\? ""\];\s*const next = fieldDialog \?\? requested;\s*fieldRequest\.current = fieldDialog \? field \?\? null : null;/);
    expect(editor).toMatch(/stamps=\{previewStamps\} onSelect=\{\(value, opener, field\) => openEditor\(value as Target, opener, field\)\}/);
    expect(editor).toMatch(/initialFocus=\{initialFocus\}/);
    expect(editor).toMatch(/focusEditTarget\(document, id\)/);
  });

  it("the stamps are built from the selected kit alone (never the draft), and the title-only Clubhouse page gets none", () => {
    expect(editor).toMatch(/const previewStamps = useMemo\(\(\) => nameOnly \? undefined : \[\.\.\.shopKitSectionStamps\(variant\), \.\.\.CLASSIC_PURCHASE_STAMPS\], \[nameOnly, variant\]\);/);
  });

  it("every kit and purchase field in the dialog carries its id (kit fields under the kit being edited)", () => {
    expect(editor.match(/<(?:Link)?Field target=/g)).toHaveLength(15);
    for (const field of ["eyebrow", "title", "description", "bullets", "storeNote", "buttonLabel", "buyLink"]) expect(editor).toContain(`target={kitTarget(variant, "${field}")}`);
    for (const field of ["label", "title", "body"]) expect(editor).toContain(`target={cardTarget(index, "${field}")}`);
    for (const name of ["purchaseHeading", "purchaseFooterLabel", "purchaseFooterText", "purchaseButtonLabel", "purchaseButtonLink"]) expect(editor).toContain(`target={SHOP_TARGETS.${name}}`);
  });
});
