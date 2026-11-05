import { z } from "zod";

export const shopMapCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
}).strict().refine(crop => crop.x + crop.width <= 100.000001 && crop.y + crop.height <= 100.000001, "Keep the map frame inside the image.");

/** Sam's Jersey Information icons; "" shows no icon. Mirrors onzio_private.validate_cinematic_shop_content. */
export const SHOP_CARD_ICONS = ["", "video", "jersey", "shipping-box", "no-access"] as const;
export type ShopCardIcon = typeof SHOP_CARD_ICONS[number];
export const MAX_SHOP_EDITIONS = 2;
export const MAX_SHOP_DETAILS = 6;
export const MAX_SHOP_ATTRIBUTES = 8;
export const MAX_SHOP_SIZE_COLUMNS = 8;
export const MAX_SHOP_SIZE_ROWS = 8;

const purchaseLink = z.string().max(2048).refine(value => value === "" || /^https?:\/\/\S+$/i.test(value), "Use a full https:// link.");
export const shopEditionSchema = z.object({
  label: z.string().max(80), price: z.string().max(40), line: z.string().max(160), link: purchaseLink,
}).strict();
export const shopDetailSchema = z.object({
  assetId: z.string().uuid().nullable(), alt: z.string().max(600), title: z.string().max(80), body: z.string().max(600),
}).strict();
export const shopSizeChartSchema = z.object({
  heading: z.string().max(80),
  columns: z.array(z.string().max(20)).max(MAX_SHOP_SIZE_COLUMNS),
  rows: z.array(z.object({ label: z.string().max(40), values: z.array(z.string().max(30)).max(MAX_SHOP_SIZE_COLUMNS) }).strict()).max(MAX_SHOP_SIZE_ROWS),
  note: z.string().max(80),
}).strict().refine(chart => chart.rows.every(row => row.values.length === chart.columns.length), "Each size row needs one value per size.");
const EMPTY_SIZE_CHART = { heading: "", columns: [], rows: [], note: "" };

export const cinematicShopContentSchema = z.object({
  mapAssetId: z.string().uuid().nullable(),
  mapAlt: z.string().max(600),
  mapVisible: z.boolean(),
  mapCrop: shopMapCropSchema.nullable(),
  sponsorsHeading: z.string().max(160),
  sponsorsVisible: z.boolean(),
  homeLabel: z.string().max(80),
  awayLabel: z.string().max(80),
  galleryLabel: z.string().max(160),
  emptyMessage: z.string().max(600),
  leadScale: z.number().min(30).max(100),
  leadTop: z.number().min(0).max(30),
  // RC2027-SHOP-UPDATE. Optional so settings saved before the update still load.
  editions: z.array(shopEditionSchema).max(MAX_SHOP_EDITIONS).default([]),
  detailsHeading: z.string().max(120).default(""),
  details: z.array(shopDetailSchema).max(MAX_SHOP_DETAILS).default([]),
  cardIcons: z.array(z.enum(SHOP_CARD_ICONS)).max(4).default([]),
  attributes: z.array(z.string().max(60)).max(MAX_SHOP_ATTRIBUTES).default([]),
  sizeChart: shopSizeChartSchema.default(EMPTY_SIZE_CHART),
  mapHeading: z.string().max(120).default(""),
}).strict();

export type CinematicShopContent = z.infer<typeof cinematicShopContentSchema>;
export type ShopEdition = z.infer<typeof shopEditionSchema>;
export type ShopDetail = z.infer<typeof shopDetailSchema>;
/** Display-only photo address and size, resolved from the club's published media. Never saved. */
export type ShopDetailPresentation = ShopDetail & { url?: string; width?: number; height?: number };
export type CinematicShopPresentation = Omit<CinematicShopContent, "details"> & {
  details: ShopDetailPresentation[]; mapUrl?: string; mapWidth?: number; mapHeight?: number;
};

export const EMPTY_CINEMATIC_SHOP_CONTENT: CinematicShopContent = {
  mapAssetId: null, mapAlt: "", mapVisible: false, mapCrop: null,
  sponsorsHeading: "", sponsorsVisible: false, homeLabel: "Home", awayLabel: "Away",
  galleryLabel: "Kit photos", emptyMessage: "Shop details will be announced soon.",
  leadScale: 80, leadTop: 5,
  editions: [], detailsHeading: "", details: [], cardIcons: [], attributes: [],
  sizeChart: { ...EMPTY_SIZE_CHART }, mapHeading: "",
};

/** The accepted map frame is expressed in percentages so replacement sizes work. */
export const APPROVED_SHOP_MAP_CROP = { x: 754 / 2380 * 100, y: 365 / 1216 * 100, width: 1626 / 2380 * 100, height: 851 / 1216 * 100 };

/** Fill the sections a Shop saved before RC2027-SHOP-UPDATE does not have yet. */
export function withShopDefaults<T extends Partial<CinematicShopPresentation>>(value: T): CinematicShopPresentation & T {
  return {
    ...EMPTY_CINEMATIC_SHOP_CONTENT,
    ...value,
    editions: value.editions ?? [], details: value.details ?? [], cardIcons: value.cardIcons ?? [], attributes: value.attributes ?? [],
    sizeChart: value.sizeChart ?? { heading: "", columns: [], rows: [], note: "" },
  } as CinematicShopPresentation & T;
}

export function shopContentOnly(value: CinematicShopPresentation): CinematicShopContent {
  const { mapUrl: _mapUrl, mapWidth: _mapWidth, mapHeight: _mapHeight, details, ...content } = value;
  return { ...content, details: details.map(({ assetId, alt, title, body }) => ({ assetId, alt, title, body })) };
}
