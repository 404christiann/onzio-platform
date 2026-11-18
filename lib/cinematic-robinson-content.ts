import { z } from "zod";
import type { VisitorPageSnapshot } from "@/lib/visitor-page-editor";

/** Mirrors onzio_private.check_robinson_content. Image identities live in tenant FK columns. */
export const ROBINSON_IMAGE_SLOTS = ["seating", "lockers", "mealPass", "step1", "step2", "step3", "bus", "routeMap", "partner"] as const;
export type RobinsonImageSlot = typeof ROBINSON_IMAGE_SLOTS[number];
export const MAX_ROBINSON_PARAGRAPHS = 8;
export const MAX_ROBINSON_INFO_ROWS = 12;
export const MAX_ROBINSON_BLOCKS = 12;
export const MAX_ROBINSON_BULLETS = 20;

const short = z.string().max(120);
const long = z.string().max(4000);
const visible = z.boolean();
const image = z.object({ assetId: z.uuid().nullable(), alt: z.string().max(1000) }).strict();
export const robinsonBlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,60}$/), heading: short,
  paragraphs: z.array(long).max(MAX_ROBINSON_PARAGRAPHS), note: long,
  bullets: z.array(long).max(MAX_ROBINSON_BULLETS), closing: long,
}).strict();
export type RobinsonBlock = z.infer<typeof robinsonBlockSchema>;

export const robinsonContentSchema = z.object({
  heading: z.object({ visible, title: short, subtitle: short }).strict(),
  seating: z.object({ visible, caption: short, expandLabel: short }).strict(),
  story: z.object({ visible, paragraphs: z.array(long).max(MAX_ROBINSON_PARAGRAPHS), quote: long, attribution: short }).strict(),
  info: z.object({ visible, heading: short, note: short,
    rows: z.array(z.object({ label: short, available: z.boolean() }).strict()).max(MAX_ROBINSON_INFO_ROWS) }).strict(),
  match: z.object({ visible }).strict(),
  lockers: z.object({ visible }).strict(),
  food: z.object({ visible, heading: short, body: long,
    steps: z.array(z.object({ label: short }).strict()).length(3) }).strict(),
  route: z.object({ visible, heading: short, subheading: short }).strict(),
  directions: z.object({ visible,
    blocks: z.array(robinsonBlockSchema).max(MAX_ROBINSON_BLOCKS)
      .refine(blocks => new Set(blocks.map(block => block.id)).size === blocks.length, "Each Directions block needs its own ID.") }).strict(),
  images: z.object(Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => [slot, image])) as Record<RobinsonImageSlot, typeof image>).strict(),
}).strict();
export type RobinsonContent = z.infer<typeof robinsonContentSchema>;

export const robinsonSaveSchema = z.object({
  operationId: z.uuid(), expectedRevision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100),
  content: robinsonContentSchema, retiredMediaAssetIds: z.array(z.uuid()).max(100).default([]),
}).strict();
export type RobinsonSaveRequest = z.infer<typeof robinsonSaveSchema>;
export type RobinsonSnapshot = VisitorPageSnapshot<RobinsonContent>;
export type RobinsonImage = RobinsonContent["images"][RobinsonImageSlot] & { url: string | null; width: number | null; height: number | null };
export type RobinsonPageContent = Omit<RobinsonContent, "images"> & { images: Record<RobinsonImageSlot, RobinsonImage> };

/** Tenant-neutral page for a club that has never saved Robinson Stadium. */
export function emptyRobinsonContent(): RobinsonContent {
  return {
    heading: { visible: true, title: "Stadium", subtitle: "" },
    seating: { visible: false, caption: "", expandLabel: "View stadium map full size" },
    story: { visible: false, paragraphs: [], quote: "", attribution: "" },
    info: { visible: false, heading: "Stadium Info", note: "", rows: [] },
    match: { visible: false },
    lockers: { visible: false },
    food: { visible: false, heading: "", body: "", steps: [{ label: "" }, { label: "" }, { label: "" }] },
    route: { visible: false, heading: "", subheading: "" },
    directions: { visible: false, blocks: [] },
    images: Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => [slot, { assetId: null, alt: "" }])) as RobinsonContent["images"],
  };
}

export function robinsonDraftFingerprint(content: RobinsonContent): string { return JSON.stringify(robinsonContentSchema.parse(content)); }

export function hydrateRobinsonContent(content: RobinsonContent | null, media: RobinsonSnapshot["media"]): RobinsonPageContent {
  const parsed = robinsonContentSchema.parse(content ?? emptyRobinsonContent());
  const assets = new Map(media.map(asset => [asset.id, asset]));
  return { ...parsed, images: Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => {
    const stored = parsed.images[slot], asset = stored.assetId ? assets.get(stored.assetId) : undefined;
    const url = asset?.storage_bucket === "onzio-media" && process.env.NEXT_PUBLIC_SUPABASE_URL 
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` : null;
    return [slot, { ...stored, url, width: url ? asset!.width : null, height: url ? asset!.height : null }];
  })) as RobinsonPageContent["images"] };
}
