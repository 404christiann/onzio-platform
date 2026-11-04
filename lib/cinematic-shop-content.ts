import { z } from "zod";

export const shopMapCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().positive().max(100),
  height: z.number().positive().max(100),
}).strict().refine(crop => crop.x + crop.width <= 100.000001 && crop.y + crop.height <= 100.000001, "Keep the map frame inside the image.");

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
}).strict();

export type CinematicShopContent = z.infer<typeof cinematicShopContentSchema>;
export type CinematicShopPresentation = CinematicShopContent & { mapUrl?: string; mapWidth?: number; mapHeight?: number };

export const EMPTY_CINEMATIC_SHOP_CONTENT: CinematicShopContent = {
  mapAssetId: null, mapAlt: "", mapVisible: false, mapCrop: null,
  sponsorsHeading: "", sponsorsVisible: false, homeLabel: "Home", awayLabel: "Away",
  galleryLabel: "Kit photos", emptyMessage: "Shop details will be announced soon.",
  leadScale: 80, leadTop: 5,
};

/** The accepted map frame is expressed in percentages so replacement sizes work. */
export const APPROVED_SHOP_MAP_CROP = { x: 754 / 2380 * 100, y: 365 / 1216 * 100, width: 1626 / 2380 * 100, height: 851 / 1216 * 100 };

export function shopContentOnly(value: CinematicShopPresentation): CinematicShopContent {
  const { mapUrl: _mapUrl, mapWidth: _mapWidth, mapHeight: _mapHeight, ...content } = value;
  return content;
}
