import { z } from "zod";
import { PROGRAM_MEDIA_LIMITS } from "@/lib/program-content";

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable();

export const programPageSaveRequestSchema = z.object({
  operationId: uuid,
  programId: nullableUuid,
  expected: z.object({
    programUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    gallery: z.array(z.object({ id: uuid, updatedAt: z.string().datetime({ offset: true }) }).strict()).max(PROGRAM_MEDIA_LIMITS.items),
  }).strict(),
  program: z.object({
    slug: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
    nav_label: z.string().max(40),
    display_title: z.string().min(1).max(120),
    kicker: z.string().max(80),
    summary: z.string().max(320),
    body: z.string().max(6000),
    highlights: z.array(z.string().max(320)).max(200),
    layout_variant: z.enum(["statement_band", "detail_focus"]),
    hero_media_asset_id: nullableUuid,
    detail_media_asset_id: nullableUuid,
    external_cta_label: z.string().max(40),
    external_cta_href: z.string().max(2048),
    registration_form_id: nullableUuid,
    registration_enabled: z.boolean(),
    registration_eyebrow: z.string().max(80),
    registration_headline: z.string().max(120),
    registration_body: z.string().max(1200),
    registration_pending_body: z.string().max(1200),
    registration_pending_label: z.string().max(60),
    status: z.enum(["active", "hidden"]),
    sort_order: z.number().int(),
  }).strict(),
  gallery: z.array(z.object({
    id: nullableUuid,
    mediaAssetId: nullableUuid,
    alt: z.string().max(PROGRAM_MEDIA_LIMITS.alt),
    sortOrder: z.number().int().nonnegative(),
  }).strict()).max(PROGRAM_MEDIA_LIMITS.items),
}).strict().superRefine((value, context) => {
  if ((value.programId === null) !== (value.expected.programUpdatedAt === null)) {
    context.addIssue({ code: "custom", path: ["expected", "programUpdatedAt"], message: "The page baseline is missing." });
  }
  const ids = value.gallery.map((item) => item.id).filter((id): id is string => Boolean(id));
  if (ids.length !== new Set(ids).size) context.addIssue({ code: "custom", path: ["gallery"], message: "A gallery image was repeated." });
  for (const [index, item] of value.gallery.entries()) {
    if (item.sortOrder !== index) context.addIssue({ code: "custom", path: ["gallery", index, "sortOrder"], message: "Images must be ordered." });
  }
});

export type ProgramPageSaveRequest = z.infer<typeof programPageSaveRequestSchema>;

export type ProgramPageSnapshot = {
  program: Record<string, unknown> | null;
  gallery: Record<string, unknown>[];
  operationId?: string;
  retiredMediaAssetIds?: string[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: ProgramPageSnapshot };
};
