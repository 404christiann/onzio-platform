import { z } from "zod";
import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";

const imageUrl = z.string().max(2048).refine((value) => value === "" || value.startsWith("/images/") || /^https?:\/\//i.test(value), "Use a published image.");
export const aboutContentSchema = z.object({
  hero_title: z.string().max(500), story_paragraphs: z.array(z.string().max(10000)).max(100),
  feature_image_url: imageUrl, values_heading: z.string().max(500),
  values: z.array(z.object({ title: z.string().max(500), description: z.string().max(10000) }).strict()).max(24),
  closing_text: z.string().max(10000), closing_cta_label: z.string().max(200), closing_cta_href: z.string().max(500),
}).strict();
export const logoContentSchema = z.object({
  annotated_image_url: imageUrl, map_image_url: imageUrl,
  features: z.array(z.object({ title: z.string().max(500), description: z.string().max(10000),
    patch_url: imageUrl, icon_url: imageUrl, icon_size: z.number().min(24).max(140), icon_scale: z.number().min(0.5).max(4),
  }).strict()).max(24),
  color_cards: z.array(z.object({ label: z.string().max(500), image_url: imageUrl }).strict()).max(6),
}).strict();
const operation = { retiredMediaUrls: z.array(imageUrl).max(100).optional(), operationId: z.string().uuid(), expectedRevision: z.string().regex(/^\d+$/).max(20), designRevision: z.string().min(1).max(100) };
export const aboutEditorSaveSchema = z.discriminatedUnion("page", [
  z.object({ ...operation, page: z.literal("about"), content: aboutContentSchema }).strict(),
  z.object({ ...operation, page: z.literal("logo"), content: logoContentSchema }).strict(),
]);
export type AboutEditorSaveRequest = z.infer<typeof aboutEditorSaveSchema>;
export type AboutEditorSnapshot = {
  page: "about" | "logo"; revision: string; designRevision: string;
  content: (DBAboutPageContent | DBClubLogoPageContent) | null;
  retiredMediaAssetIds?: string[]; cleanupPending?: boolean;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: AboutEditorSnapshot };
};
