import { z } from "zod";
import type { VisitorPageSnapshot } from "@/lib/visitor-page-editor";

export const STADIUM_ARTWORK_SLOTS = ["bus", "map", "partner"] as const;
export type StadiumArtworkSlot = typeof STADIUM_ARTWORK_SLOTS[number];
const heading = z.string().max(120);
const body = z.string().max(4000);
const art = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
export const stadiumCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1), height: z.number().gt(0).max(1),
}).strict().refine(crop => crop.x + crop.width <= 1 && crop.y + crop.height <= 1, "The crop must fit inside the image.");
export type StadiumCrop = z.infer<typeof stadiumCropSchema>;
export const stadiumSectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/), heading, body, note: body,
  bullets: z.array(body).max(20), visible: z.boolean(),
}).strict();
export const stadiumContentSchema = z.object({
  title: heading, subtitle: heading,
  showHeading: z.boolean(), showMap: z.boolean(), showSections: z.boolean(), showMatch: z.boolean(), showBenefits: z.boolean(),
  includesHeading: heading,
  benefits: z.array(z.object({ title: heading, detail: body }).strict()).max(10), benefitsNote: body,
  sections: z.array(stadiumSectionSchema).max(12).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, "Each section must have a unique ID."),
  phoneMapLayout: z.enum(["full", "split"]), phoneCardCrop: stadiumCropSchema, phoneMapCrop: stadiumCropSchema,
  artwork: z.object({ bus: art, map: art, partner: art }).strict(),
}).strict();
export type StadiumContent = z.infer<typeof stadiumContentSchema>;
export const stadiumDraftSchema = stadiumContentSchema;
export const stadiumSaveSchema = z.object({
  operationId: z.uuid(), expectedRevision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100),
  content: stadiumContentSchema, retiredMediaAssetIds: z.array(z.uuid()).max(100).default([]),
}).strict();
export type StadiumSaveRequest = z.infer<typeof stadiumSaveSchema>;
export type StadiumSnapshot = VisitorPageSnapshot<StadiumContent>;
export type StadiumArtwork = StadiumContent["artwork"][StadiumArtworkSlot] & { url: string | null; width: number | null; height: number | null };
export type StadiumPageContent = Omit<StadiumContent, "artwork"> & { artwork: Record<StadiumArtworkSlot, StadiumArtwork> };

export function fullStadiumCrop(): StadiumCrop { return { x: 0, y: 0, width: 1, height: 1 }; }
export function emptyStadiumContent(): StadiumContent {
  return {
    title: "Stadium", subtitle: "", showHeading: true, showMap: true, showSections: true, showMatch: true, showBenefits: true,
    includesHeading: "Ticket includes", benefits: [], benefitsNote: "", sections: [], phoneMapLayout: "full",
    phoneCardCrop: fullStadiumCrop(), phoneMapCrop: fullStadiumCrop(),
    artwork: { bus: { assetId: null, alt: "" }, map: { assetId: null, alt: "" }, partner: { assetId: null, alt: "" } },
  };
}
export function stadiumDraftFingerprint(content: StadiumContent): string { return JSON.stringify(stadiumDraftSchema.parse(content)); }
/** Replacement media starts fully visible; original-only framing never carries over silently. */
export function resetStadiumMapFraming(content: StadiumContent): StadiumContent {
  return { ...content, phoneMapLayout: "full", phoneCardCrop: fullStadiumCrop(), phoneMapCrop: fullStadiumCrop() };
}
export function stadiumCropViewBox(crop: StadiumCrop, width: number, height: number): string {
  return [crop.x * width, crop.y * height, crop.width * width, crop.height * height].map(n => Number(n.toFixed(6))).join(" ");
}
export function hydrateStadiumContent(content: StadiumContent | null, media: StadiumSnapshot["media"]): StadiumPageContent {
  const parsed = stadiumContentSchema.parse(content ?? emptyStadiumContent());
  const assets = new Map(media.map(asset => [asset.id, asset]));
  return { ...parsed, artwork: Object.fromEntries(STADIUM_ARTWORK_SLOTS.map(slot => {
    const image = parsed.artwork[slot], asset = image.assetId ? assets.get(image.assetId) : undefined;
    return [slot, { ...image,
      url: asset?.storage_bucket === "onzio-media" && process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null,
      width: asset?.width ?? null, height: asset?.height ?? null }];
  })) as StadiumPageContent["artwork"] };
}
