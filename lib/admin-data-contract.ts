import { z } from "zod";

export const ADMIN_TABLE_FEATURES = {
  about_page_content: "about",
  behind_the_rose_section: "homepage",
  club_logo_page_content: "about",
  goalkeeper_match_stats: "roster",
  goalkeeper_season_stats: "roster",
  homepage_slideshow_photos: "homepage",
  homepage_slideshow_settings: "homepage",
  league_standings: "standings",
  league_standings_settings: "standings",
  matches: "schedule",
  player_match_stats: "roster",
  player_photos: "roster",
  player_season_stats: "roster",
  players: "roster",
  seasons: "roster",
  shop_carousel_photos: "shop",
  shop_kit_photos: "shop",
  shop_kit_section: "shop",
  shop_purchase_details: "shop",
  site_branding: "branding",
  site_social_links: "branding",
  site_sponsor_logos: "branding",
  staff: "roster",
} as const;

export type AdminTable = keyof typeof ADMIN_TABLE_FEATURES;

const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
const scalar = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    scalar,
    z.array(jsonValue).max(200),
    z.record(z.string().max(100), jsonValue),
  ]),
);
const row = z
  .record(identifier, jsonValue)
  .refine(
    (value) =>
      !Object.prototype.hasOwnProperty.call(value, "club_id") &&
      !Object.prototype.hasOwnProperty.call(value, "clubId"),
    { message: "Client payload cannot contain tenant identity" },
  )
  .superRefine((value, context) => {
    for (const [key, fieldValue] of Object.entries(value)) {
      if (
        typeof fieldValue === "string" &&
        /(?:url|href|link)$/.test(key) &&
        fieldValue !== "" &&
        !fieldValue.startsWith("/") &&
        !/^(?:https?:|mailto:)/i.test(fieldValue)
      ) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "URL fields require http, https, mailto, or a local path",
        });
      }
      if (
        typeof fieldValue === "string" &&
        /color/i.test(key) &&
        !/^#[0-9a-f]{6}$/i.test(fieldValue)
      ) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Color fields require a six-digit hexadecimal value",
        });
      }
      if (
        fieldValue !== null &&
        key.endsWith("_asset_id") &&
        (typeof fieldValue !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            fieldValue,
          ))
      ) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Media references require a UUID asset ID",
        });
      }
    }
  });

const filter = z.object({
  kind: z.enum(["eq", "neq", "gt", "in"]),
  column: identifier,
  value: jsonValue,
});

export const adminDataRequestSchema = z.object({
  table: z.enum(
    Object.keys(ADMIN_TABLE_FEATURES) as [AdminTable, ...AdminTable[]],
  ),
  operation: z.enum(["select", "insert", "update", "upsert", "delete"]),
  columns: z.string().max(2_000).default("*"),
  payload: z.union([row, z.array(row).max(500)]).optional(),
  filters: z.array(filter).max(20).default([]),
  order: z
    .object({
      column: identifier,
      ascending: z.boolean().default(true),
    })
    .optional(),
  limit: z.number().int().positive().max(1_000).optional(),
  single: z.enum(["single", "maybeSingle"]).optional(),
  count: z.enum(["exact"]).optional(),
  head: z.boolean().optional(),
  onConflict: z
    .string()
    .regex(/^[a-z0-9_,]+$/)
    .max(200)
    .optional(),
});

export type AdminDataRequest = z.infer<typeof adminDataRequestSchema>;

export const SINGLETON_TABLES = new Set<AdminTable>([
  "about_page_content",
  "behind_the_rose_section",
  "club_logo_page_content",
  "homepage_slideshow_settings",
  "league_standings_settings",
  "shop_purchase_details",
  "site_branding",
]);
