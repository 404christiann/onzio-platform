import { z } from "zod";

export const shopSurfaceSchema = z.enum(["home", "shop"]);
export const shopVariantSchema = z.enum(["home", "third", "away"]);

const safePageOrExternalUrl = z.string().trim().max(2048).refine(
  (value) => value === "" || /^\/[A-Za-z0-9_/?#=&%.\-]*$/.test(value) || (() => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  })(),
  "Enter a full http or https address.",
);

const safePurchaseUrl = z.string().trim().max(2048).refine((value) => {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Enter a full http or https address.");

export const shopSectionSchema = z.object({
  eyebrow: z.string().max(160),
  title: z.string().max(240),
  description: z.string().max(3000),
  bullet_points: z.array(z.string().max(80)).max(8),
  store_note: z.string().max(180),
  cta_label: z.string().max(100),
  cta_link: safePageOrExternalUrl,
}).strict();

export const shopPhotoSchema = z.object({
  rowId: z.string().uuid().nullable(),
  assetId: z.string().uuid().nullable(),
  order: z.number().int().min(0),
}).strict();

export const shopVariantSaveSchema = z.object({
  section: shopSectionSchema,
  photos: z.array(shopPhotoSchema).min(1).max(6),
}).strict();

export const shopPurchaseSchema = z.object({
  heading: z.string().max(160),
  cards: z.array(z.object({
    label: z.string().max(100),
    title: z.string().max(160),
    body: z.string().max(600),
  }).strict()).max(4),
  cta_eyebrow: z.string().max(120),
  cta_text: z.string().max(600),
  cta_label: z.string().max(100),
  cta_link: safePurchaseUrl,
}).strict();

export const shopSaveRequestSchema = z.object({
  operationId: z.string().uuid(),
  surface: shopSurfaceSchema,
  expectedRevision: z.string().regex(/^\d+$/),
  designRevision: z.string().min(1).max(200),
  variants: z.object({
    home: shopVariantSaveSchema.optional(),
    third: shopVariantSaveSchema.optional(),
    away: shopVariantSaveSchema.optional(),
  }).strict(),
  photoRows: z.object({
    home: z.array(shopPhotoSchema).max(6).optional(),
    third: z.array(shopPhotoSchema).max(6).optional(),
    away: z.array(shopPhotoSchema).max(6).optional(),
  }).strict().optional(),
  purchase: shopPurchaseSchema.optional(),
}).strict().superRefine((request, context) => {
  if (Object.keys(request.variants).length === 0 && !request.photoRows && !request.purchase) {
    context.addIssue({ code: "custom", message: "No Shop changes to save." });
  }
  if (request.surface === "home" && (request.photoRows || request.purchase || Object.keys(request.variants).some((variant) => variant !== "home"))) {
    context.addIssue({ code: "custom", message: "Homepage shop feature accepts its home kit only." });
  }
});

export type ShopSaveRequest = z.infer<typeof shopSaveRequestSchema>;
export type ShopSection = z.infer<typeof shopSectionSchema>;
export type ShopPhoto = z.infer<typeof shopPhotoSchema> & { url: string };
export type ShopSurface = z.infer<typeof shopSurfaceSchema>;
export type ShopVariant = z.infer<typeof shopVariantSchema>;
export type ShopSnapshot = {
  revision: string;
  designRevision: string;
  templateKey: string | null;
  surface: ShopSurface;
  sections: Array<ShopSection & { id: string; kit_variant: ShopVariant }>;
  photos: Array<ShopPhoto & { kit_variant: ShopVariant }>;
  photoRows: Array<ShopPhoto & { kit_variant: ShopVariant }>;
  purchase: z.infer<typeof shopPurchaseSchema> | null;
  media: Array<{ id: string; storage_bucket: string; storage_path: string }>;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: ShopSnapshot };
};
