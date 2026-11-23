import { editTarget, resolveEditTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { SHOP_EDITION_VARIANTS } from "@/lib/cinematic-shop-content";
import type { ShopVariant } from "@/lib/shop-editor/contract";

/**
 * Click-to-field for the Shop editors (UI-PREVIEW-CLICK-SHOP). The ids are declared in EDIT_TARGET_REGISTRY ("shop"); the
 * dialog controls carry them, and the stamps below put the same ids on the public nodes inside the admin preview frames only.
 *
 * Mapping rule (the News and Sponsors lesson): a node is matched to its field by what it is, never by how many nodes came
 * before it. A kit frame holds one kit, so its ids carry that kit; a detail card or tile takes its position among the
 * siblings the public component renders from the same array the dialog lists (neither drops one); a size chart cell takes its
 * place from its own table row or column. Nothing here reads the draft, so the stamps never change with an edit.
 */

export type ShopKitField = "eyebrow" | "title" | "description" | "bullets" | "storeNote" | "buttonLabel" | "buyLink";
export const kitTarget = (kit: ShopVariant, field: ShopKitField): EditTargetId => editTarget("shop", "kitText", field, kit);

export type ShopEditionField = "label" | "price" | "line" | "link";
/** Option i is kit i: the row id is the kit the option belongs to. */
export const editionRowId = (index: number): string => SHOP_EDITION_VARIANTS[index] ?? `option-${index}`;
export const editionTarget = (index: number, field: ShopEditionField): EditTargetId => editTarget("shop", "editions", field, editionRowId(index));

export type ShopCardField = "label" | "title" | "body" | "icon";
export const cardTarget = (index: number, field: ShopCardField): EditTargetId => editTarget("shop", "purchase", field, index);

export type ShopTileField = "photoAlt" | "title" | "text";
export const tileTarget = (index: number, field: ShopTileField): EditTargetId => editTarget("shop", "details", field, index);

export type ShopMeasurementField = "label" | `value${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;
/** A size chart cell: `row` is the measurement's position, `value<n>` its cell under size n. */
export const measurementTarget = (row: number, field: ShopMeasurementField): EditTargetId => editTarget("shop", "sizes", field, row);
/** The TableEditor cell for a row and column key (`label`, then `c<size>`). */
export const measurementCellTarget = (row: number, columnKey: string): EditTargetId | undefined => {
  if (columnKey === "label") return measurementTarget(row, "label");
  const size = Number(columnKey.slice(1));
  return Number.isInteger(size) && size >= 0 && size < 8 ? measurementTarget(row, `value${size as 0 | 1}`) : undefined;
};

export const SHOP_TARGETS = {
  editionsHeading: editTarget("shop", "editions", "heading"),
  purchaseHeading: editTarget("shop", "purchase", "heading"),
  purchaseFooterLabel: editTarget("shop", "purchase", "footerLabel"),
  purchaseFooterText: editTarget("shop", "purchase", "footerText"),
  purchaseButtonLabel: editTarget("shop", "purchase", "buttonLabel"),
  purchaseButtonLink: editTarget("shop", "purchase", "buttonLink"),
  detailsHeading: editTarget("shop", "details", "heading"),
  care: editTarget("shop", "care", "care"),
  sizesHeading: editTarget("shop", "sizes", "heading"),
  sizes: editTarget("shop", "sizes", "sizes"),
  sizesNote: editTarget("shop", "sizes", "note"),
  mapVisible: editTarget("shop", "map", "visible"),
  mapHeading: editTarget("shop", "map", "heading"),
  mapDescription: editTarget("shop", "map", "description"),
  mapWholeImage: editTarget("shop", "map", "wholeImage"),
  mapCrop: editTarget("shop", "map", "crop"),
  partnersVisible: editTarget("shop", "partners", "visible"),
  partnersHeading: editTarget("shop", "partners", "heading"),
  homeLabel: editTarget("shop", "labels", "homeLabel"),
  awayLabel: editTarget("shop", "labels", "awayLabel"),
  photoRowLabel: editTarget("shop", "labels", "photoRowLabel"),
  emptyMessage: editTarget("shop", "labels", "emptyMessage"),
  imageWidth: editTarget("shop", "labels", "imageWidth"),
  imageTop: editTarget("shop", "labels", "imageTop"),
} as const;

/** The dialog section a declared Shop target belongs to (the Rose City section id, or Diverse City's `kitText` / `purchase`), or undefined. */
export function shopSectionOf(target: string | null | undefined): string | undefined {
  const resolved = resolveEditTarget(target);
  return resolved?.editor === "shop" ? resolved.section : undefined;
}

const fixed = (id: EditTargetId) => () => id;
/** The position of the `holder` (the nearest ancestor-or-self matching it) among its siblings. */
function positionOf(element: Element, holder: string): number {
  const node = element.closest(holder);
  return node?.parentElement ? Array.from(node.parentElement.children).indexOf(node) : -1;
}
const byPosition = <F extends string>(holder: string, make: (index: number, field: F) => EditTargetId, field: F) => (element: Element) => {
  const index = positionOf(element, holder);
  return index < 0 ? null : make(index, field);
};
/** A size chart cell's place: its row among the table's rows and its own position among that row's cells. */
function cellPlace(element: Element): { row: number; cell: number } {
  const row = element.closest("tr");
  return { row: row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : -1, cell: row ? Array.from(row.children).indexOf(element) : -1 };
}
const measurementField = (size: number) => `value${size}` as ShopMeasurementField;
/** The wide table lists a measurement per row and a size per column; the phone table turned sideways lists a size per row and a measurement per column. */
const wideCell = (element: Element) => { const { row, cell } = cellPlace(element); return row < 0 || cell < 1 || cell > 8 ? null : measurementTarget(row, measurementField(cell - 1)); };
const wideRowHead = (element: Element) => { const { row } = cellPlace(element); return row < 0 ? null : measurementTarget(row, "label"); };
const narrowCell = (element: Element) => { const { row, cell } = cellPlace(element); return row < 0 || cell < 1 || cell > 8 ? null : measurementTarget(cell - 1, measurementField(row)); };
const narrowColumnHead = (element: Element) => { const { cell } = cellPlace(element); return cell < 1 ? null : measurementTarget(cell - 1, "label"); };
/** Null for a table's first cell of its header row (the corner "Size" label belongs to no field). */
const notCorner = (id: EditTargetId) => (element: Element) => element.parentElement?.children[0] === element ? null : id;

/** The Rose City Shop page's kit column (CinematicShop: `.shop-feature`): one kit's words. The jersey options themselves are hidden in the frame. */
export function roseCityKitStamps(kit: ShopVariant): EditTargetStamp[] {
  return [
    { selector: ".shop-feature .shop-copy-top > h1", target: fixed(kitTarget(kit, "title")) },
    { selector: ".shop-feature .shop-copy-top > .shop-eyebrow", target: fixed(kitTarget(kit, "eyebrow")) },
    // The line under the title is the jersey option's own field, so it opens Jersey options on this kit's option.
    { selector: ".shop-feature .shop-copy-top > .shop-edition-line", target: fixed(editionTarget(SHOP_EDITION_VARIANTS.indexOf(kit), "line")) },
    { selector: ".shop-feature .shop-copy .shop-description", target: fixed(kitTarget(kit, "description")) },
    { selector: ".shop-feature .shop-copy .shop-bullets", target: fixed(kitTarget(kit, "bullets")) },
    { selector: ".shop-feature .shop-copy .shop-store", target: fixed(kitTarget(kit, "storeNote")) },
    { selector: ".shop-feature .shop-copy > .shop-buy:not(.shop-buy-small)", target: fixed(kitTarget(kit, "buttonLabel")) },
  ];
}

/**
 * The kit column of the three public components the classic Shop and the Rose City homepage feature draw: ShopKitSection (generic
 * clubs, the Rose City homepage feature), AcademyShopPage and AcademyHomeShopFeature (Diverse City's own pages). Each puts one
 * kit's words in a `[data-shop-editor-target="copy"]` column. The three differ only in the tag or class of the description and
 * the bullets (AcademyShopPage draws the first two bullets as a label-and-value list, so the whole list is the one Bullet points field), so
 * one selector list covers them; a selector another component does not use matches nothing there. The classic frame strips the
 * button's own region mark, so the button is found by being the column's link.
 */
const COPY = '[data-shop-editor-target="copy"]';
export function shopKitSectionStamps(kit: ShopVariant): EditTargetStamp[] {
  return [
    { selector: `${COPY} > p.uppercase`, target: fixed(kitTarget(kit, "eyebrow")) },
    { selector: `${COPY} > h1, ${COPY} > h2`, target: fixed(kitTarget(kit, "title")) },
    { selector: `${COPY} > p.leading-relaxed, ${COPY} > p.leading-7`, target: fixed(kitTarget(kit, "description")) },
    { selector: `${COPY} > ul, ${COPY} > dl`, target: fixed(kitTarget(kit, "bullets")) },
    { selector: `${COPY} > p.whitespace-pre-line`, target: fixed(kitTarget(kit, "storeNote")) },
    { selector: `${COPY} > a`, target: fixed(kitTarget(kit, "buttonLabel")) },
  ];
}

/** Rose City's left shared frame: Jersey details tiles, then Purchase details (heading, cards, care line, footer). */
export const ROSE_CITY_LEFT_STAMPS: EditTargetStamp[] = [
  { selector: ".shop-jersey-details > .shop-rule-heading > h2", target: fixed(SHOP_TARGETS.detailsHeading) },
  { selector: ".shop-detail-tiles > article > .shop-detail-photo, .shop-detail-tiles > article > .shop-photo-pending", target: byPosition("article", tileTarget, "photoAlt") },
  { selector: ".shop-detail-tiles > article > h3", target: byPosition("article", tileTarget, "title") },
  { selector: ".shop-detail-tiles > article > p", target: byPosition("article", tileTarget, "text") },
  { selector: ".shop-details > h2", target: fixed(SHOP_TARGETS.purchaseHeading) },
  { selector: ".shop-detail-grid > article > p", target: byPosition("article", cardTarget, "label") },
  { selector: ".shop-detail-grid > article > h3", target: byPosition("article", cardTarget, "title") },
  { selector: ".shop-detail-grid > article > h3 > .shop-info-icon", target: byPosition("article", cardTarget, "icon") },
  { selector: ".shop-detail-grid > article > div", target: byPosition("article", cardTarget, "body") },
  { selector: ".shop-details > .shop-attributes, .shop-details > button.shop-empty-inline", target: fixed(SHOP_TARGETS.care) },
  { selector: ".shop-order > div > h3", target: fixed(SHOP_TARGETS.purchaseFooterLabel) },
  { selector: ".shop-order > div > p", target: fixed(SHOP_TARGETS.purchaseFooterText) },
  { selector: ".shop-order > .shop-buy-small", target: fixed(SHOP_TARGETS.purchaseButtonLabel) },
];

/**
 * Rose City's right shared frame: the size chart, route map and partner strip. The chart draws two tables (the wide one and the
 * phone one turned sideways), so each table says which of its axes is the sizes and which the measurements. A size name opens the one
 * "Sizes" input; a measurement name or value opens its own cell in the Measurements table.
 */
export const ROSE_CITY_RIGHT_STAMPS: EditTargetStamp[] = [
  { selector: ".shop-size > .shop-rule-heading > h2", target: fixed(SHOP_TARGETS.sizesHeading) },
  { selector: ".shop-size-wide > thead th", target: notCorner(SHOP_TARGETS.sizes) },
  { selector: ".shop-size-wide > tbody th", target: wideRowHead },
  { selector: ".shop-size-wide > tbody td", target: wideCell },
  { selector: ".shop-size-narrow > thead th", target: narrowColumnHead },
  { selector: ".shop-size-narrow > tbody th", target: fixed(SHOP_TARGETS.sizes) },
  { selector: ".shop-size-narrow > tbody td", target: narrowCell },
  { selector: ".shop-size > .shop-size-unit", target: fixed(SHOP_TARGETS.sizesNote) },
  { selector: ".shop-map-view > .shop-rule-heading > h2", target: fixed(SHOP_TARGETS.mapHeading) },
  { selector: ".shop-map img", target: fixed(SHOP_TARGETS.mapDescription) },
  { selector: '[data-shop-editor-target="sponsors"] > .partners > h2', target: fixed(SHOP_TARGETS.partnersHeading) },
];

/** Diverse City's classic Shop: the Purchase details region (ShopPurchaseDetailsSection). Its cards are listed in order from the dialog's own array. */
const PURCHASE = '[data-shop-editor-target="purchase"]';
export const CLASSIC_PURCHASE_STAMPS: EditTargetStamp[] = [
  { selector: `${PURCHASE} h2`, target: fixed(SHOP_TARGETS.purchaseHeading) },
  { selector: `${PURCHASE} .grid > div > p.uppercase`, target: byPosition(`${PURCHASE} .grid > div`, cardTarget, "label") },
  { selector: `${PURCHASE} .grid > div > h3`, target: byPosition(`${PURCHASE} .grid > div`, cardTarget, "title") },
  { selector: `${PURCHASE} .grid > div > p.whitespace-pre-line`, target: byPosition(`${PURCHASE} .grid > div`, cardTarget, "body") },
  { selector: `${PURCHASE} .mt-10 > div > p.uppercase`, target: fixed(SHOP_TARGETS.purchaseFooterLabel) },
  { selector: `${PURCHASE} .mt-10 > div > p.text-white`, target: fixed(SHOP_TARGETS.purchaseFooterText) },
  { selector: `${PURCHASE} .mt-10 > a`, target: fixed(SHOP_TARGETS.purchaseButtonLabel) },
];
