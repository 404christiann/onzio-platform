import { z } from "zod";

const text = z.string().max(20_000);
const href = text.regex(/^(?:|\/[-A-Za-z0-9_/?#=&%.]*)$/);
export const homepageHeroSchema = z.object({
  eyebrow: text,
  headline_line_one: z.string().max(80),
  headline_line_two: z.string().max(80),
  intro: z.string().max(320),
  primary_cta_label: text,
  primary_cta_href: href,
  secondary_cta_label: text,
  secondary_cta_href: href,
}).strict();
export const homepageStorySchema = z.object({
  visible: z.boolean(), heading: z.string().max(120),
  bodyPrimary: z.string().max(1200), bodySecondary: z.string().max(1200),
  ctaLabel: z.string().max(40),
}).strict();
export const homepageVideoSchema = z.object({
  visible: z.boolean(), eyebrow: text, title: text, description: text,
  video_title: text, caption: text,
}).strict();

const photo = z.object({
  clientId: z.string().min(1).max(200),
  rowId: z.uuid().nullable(), assetId: z.uuid().nullable(),
  alt: text, order: z.number().int().min(0).max(5),
}).strict().refine(p => p.rowId !== null || p.assetId !== null, "A photo needs a saved row or prepared asset.");

export const homepagePhotosSchema = z.object({
  seasonLabel: text.optional(),
  items: z.array(photo).max(6),
}).strict().superRefine(({ items }, ctx) => {
  for (const field of ["clientId", "rowId", "assetId"] as const) {
    const ids = items.map(p => p[field]).filter(id => id !== null);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: `Duplicate ${field}` });
  }
  if (items.some((p, i) => p.order !== i)) ctx.addIssue({ code: "custom", message: "Photo order must be contiguous." });
});

export const homepageSaveRequestSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: z.string().min(1).max(200),
  designRevision: z.string().min(1).max(200),
  sections: z.object({
    hero: homepageHeroSchema.partial().refine(v => Object.keys(v).length > 0).optional(),
    photos: homepagePhotosSchema.optional(),
    story: homepageStorySchema.optional(),
    video: homepageVideoSchema.optional(),
  }).strict().refine(v => Object.keys(v).length > 0, "No sections supplied."),
}).strict();

export type HomepageSaveRequest = z.infer<typeof homepageSaveRequestSchema>;
