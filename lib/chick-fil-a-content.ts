import { z } from "zod";
import type { VisitorPageMedia, VisitorPageSnapshot } from "@/lib/visitor-page-editor";

export const CHICK_FIL_A_ARTWORK_SLOTS = ["mealPass", "driveThru", "freeTicket", "enjoyGame", "map", "restaurant", "partner", "background"] as const;
export type ChickFilAArtworkSlot = typeof CHICK_FIL_A_ARTWORK_SLOTS[number];
export const CHICK_FIL_A_MEDIA_COLUMNS = {
  mealPass: "meal_pass_media_asset_id", driveThru: "drive_thru_media_asset_id",
  freeTicket: "free_ticket_media_asset_id", enjoyGame: "enjoy_game_media_asset_id",
  map: "map_media_asset_id", restaurant: "restaurant_media_asset_id",
  partner: "partner_media_asset_id", background: "background_media_asset_id",
} as const;
export const CHICK_FIL_A_SECTIONS = ["heading", "details", "steps", "map", "match", "restaurant"] as const;
export type ChickFilASection = typeof CHICK_FIL_A_SECTIONS[number];
const heading = z.string().max(120);
const art = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
export const chickFilAContentSchema = z.object({
  title: heading, subtitle: heading, detailsHeading: heading, detailsBody: z.string().max(4000),
  stepLabels: z.tuple([heading, heading, heading]),
  stepNumbers: z.tuple([z.string().max(12), z.string().max(12), z.string().max(12)]),
  sections: z.object({ heading: z.boolean(), details: z.boolean(), steps: z.boolean(), map: z.boolean(), match: z.boolean(), restaurant: z.boolean() }).strict(),
  artwork: z.object(Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => [slot, art])) as Record<ChickFilAArtworkSlot, typeof art>).strict(),
}).strict();
export type ChickFilAContent = z.infer<typeof chickFilAContentSchema>;
export type ChickFilASnapshot = VisitorPageSnapshot<ChickFilAContent>;
export type ChickFilAArtwork = { assetId: string | null; alt: string; url: string | null; width: number | null; height: number | null };
export type ChickFilAPageContent = Omit<ChickFilAContent, "artwork"> & { artwork: Record<ChickFilAArtworkSlot, ChickFilAArtwork> };
export const chickFilASaveSchema = z.object({
  operationId: z.uuid(), expectedRevision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100),
  content: chickFilAContentSchema, retiredMediaAssetIds: z.array(z.uuid()).max(100).default([]),
}).strict();
export type ChickFilASaveRequest = z.infer<typeof chickFilASaveSchema>;
export const chickFilARecoverySchema = z.object({
  content: chickFilAContentSchema, revision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100),
  pending: chickFilASaveSchema.nullable(), retired: z.array(z.uuid()).max(100),
  media: z.array(z.object({ id: z.uuid(), storage_bucket: z.literal("onzio-media"), storage_path: z.string().min(1), width: z.number().positive(), height: z.number().positive() }).strict()),
}).strict().superRefine((value, context) => {
  if (value.pending && (value.pending.expectedRevision !== value.revision || value.pending.designRevision !== value.designRevision || JSON.stringify(value.pending.content) !== JSON.stringify(value.content))) {
    context.addIssue({ code: "custom", message: "The recovered draft must match its exact pending save.", path: ["pending"] });
  }
});
export function chickFilADraftFingerprint(content: ChickFilAContent): string { return JSON.stringify(chickFilAContentSchema.parse(content)); }
export function emptyChickFilAContent(): ChickFilAContent {
  return { title: "Food & Beverage", subtitle: "", detailsHeading: "Details", detailsBody: "", stepLabels: ["", "", ""], stepNumbers: ["1", "2", "3"],
    sections: { heading: true, details: true, steps: true, map: true, match: true, restaurant: true },
    artwork: Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => [slot, { assetId: null, alt: "" }])) as ChickFilAContent["artwork"] };
}
export function hydrateChickFilAContent(content: ChickFilAContent | null, media: VisitorPageMedia[], validate = true): ChickFilAPageContent {
  const parsed = validate ? chickFilAContentSchema.parse(content ?? emptyChickFilAContent()) : content ?? emptyChickFilAContent();
  const assets = new Map(media.map(asset => [asset.id, asset]));
  return { ...parsed, artwork: Object.fromEntries(CHICK_FIL_A_ARTWORK_SLOTS.map(slot => {
    const art = parsed.artwork[slot], asset = art.assetId ? assets.get(art.assetId) : undefined;
    const safePath = asset?.storage_path && !asset.storage_path.split("/").some(segment => !segment || segment === "." || segment === "..");
    const delivered = asset?.storage_bucket === "onzio-media" && safePath && process.env.NEXT_PUBLIC_SUPABASE_URL;
    return [slot, { ...art, url: delivered ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null,
      width: asset?.width ?? null, height: asset?.height ?? null }];
  })) as ChickFilAPageContent["artwork"] };
}
