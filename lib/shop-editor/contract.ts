import { z } from "zod";
import { cinematicShopContentSchema, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";
import { CINEMATIC_KIT_BULLET_POINTS } from "@/lib/shop-kit";

export const shopSurfaceSchema = z.enum(["home", "shop"]);
export const shopVariantSchema = z.enum(["home", "third", "away"]);

/**
 * An email buy link ("order by email", decision 0008 amended): `mailto:` with
 * one address and an optional query such as `?subject=`. Mirrors the SQL rule
 * in onzio_private.validate_shop_section.
 */
const MAILTO_BUY_LINK = /^mailto:[^\s@?/]+@[^\s@?/]+\.[^\s@?/]+(\?\S*)?$/i;
const PLAIN_EMAIL = /^[^\s@?/:]+@[^\s@?/]+\.[^\s@?/]+$/;

/** Turns a typed email address into an email buy link; leaves anything else as typed. */
export function normalizeKitBuyLink(value: string): string {
  const trimmed = value.trim();
  return PLAIN_EMAIL.test(trimmed) ? `mailto:${trimmed}` : trimmed;
}

const safePageOrExternalUrl = z.string().trim().max(2048).refine(
  (value) => value === "" || /^\/[A-Za-z0-9_/?#=&%.\-]*$/.test(value) || MAILTO_BUY_LINK.test(value) || (() => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  })(),
  "Enter a full http or https address, a page on your site, or an email address.",
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
  // The highest per-template limit; shopSaveRequestSchemaFor applies the club's own (8 except cinematic@2).
  bullet_points: z.array(z.string().max(80)).max(CINEMATIC_KIT_BULLET_POINTS),
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
  presentation: cinematicShopContentSchema.optional(),
}).strict().superRefine((request, context) => {
  if (Object.keys(request.variants).length === 0 && !request.photoRows && !request.purchase && !request.presentation) {
    context.addIssue({ code: "custom", message: "No Shop changes to save." });
  }
  if (request.surface === "home" && (request.photoRows || request.purchase || request.presentation || Object.keys(request.variants).some((variant) => variant !== "home"))) {
    context.addIssue({ code: "custom", message: "Homepage shop feature accepts its home kit only." });
  }
});

/**
 * The save request for a club whose design allows `maxBulletPoints` per kit (10 for cinematic@2, 8 otherwise; the Shop editor picks it).
 * The database applies the same limit in save_shop_page.
 */
export function shopSaveRequestSchemaFor(maxBulletPoints: number) {
  return shopSaveRequestSchema.superRefine((request, context) => {
    for (const variant of shopVariantSchema.options) {
      if ((request.variants[variant]?.section.bullet_points.length ?? 0) > maxBulletPoints) {
        context.addIssue({ code: "custom", path: ["variants", variant, "section", "bullet_points"], message: `Each kit can have up to ${maxBulletPoints} bullet points.` });
      }
    }
  });
}

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
  presentation?: CinematicShopPresentation | null;
  media: Array<{ id: string; storage_bucket: string; storage_path: string; width?: number; height?: number }>;
  operation?: { status: "not-committed" } | { status: "committed"; receipt: ShopSnapshot };
};
