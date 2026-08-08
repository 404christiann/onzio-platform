import { z } from "zod";
import { isAllowedPublicHref } from "@/lib/public-link";
import {
  isValidPublicEmail,
  isValidPublicPhone,
} from "@/lib/contact-admin";

export const ADMIN_TABLE_FEATURES = {
  about_page_content: "about",
  behind_the_rose_section: "homepage",
  club_logo_page_content: "about",
  contact_page_content: "contact",
  contact_profile: "contact",
  goalkeeper_match_stats: "roster",
  goalkeeper_season_stats: "roster",
  homepage_hero_content: "homepage",
  homepage_slideshow_photos: "homepage",
  homepage_slideshow_settings: "homepage",
  homepage_story_section: "homepage",
  league_standings: "standings",
  league_standings_settings: "standings",
  matches: "schedule",
  player_match_stats: "roster",
  player_photos: "roster",
  player_season_stats: "roster",
  players: "roster",
  program_media: "programs",
  programs: "programs",
  programs_page_content: "programs",
  seasons: "roster",
  shop_carousel_photos: "shop",
  shop_kit_photos: "shop",
  shop_kit_section: "shop",
  shop_purchase_details: "shop",
  site_branding: "branding",
  site_social_links: "branding",
  site_sponsor_logos: "branding",
  staff: "roster",
  tryouts: "tryouts",
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
        !isAllowedPublicHref(fieldValue)
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

const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
const nullableUuid = uuid.nullable();
const optionalText = (maximum: number) => z.string().max(maximum).optional();
const externalHref = z
  .string()
  .max(2_048)
  .refine(isAllowedPublicHref, {
    message: "URL fields require http, https, mailto, or a local path",
  })
  .optional();

const programMutation = z
  .object({
    id: uuid.optional(),
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
    nav_label: optionalText(40),
    display_title: z.string().min(1).max(120).optional(),
    kicker: optionalText(80),
    summary: optionalText(320),
    body: optionalText(6_000),
    highlights: z.array(z.string().max(320)).max(200).optional(),
    layout_variant: z.enum(["statement_band", "detail_focus"]).optional(),
    hero_media_asset_id: nullableUuid.optional(),
    detail_media_asset_id: nullableUuid.optional(),
    external_cta_label: optionalText(40),
    external_cta_href: externalHref,
    // Registration band copy. Ceilings mirror the CHECK constraints added in
    // 20260808020000_dcfc_program_media_registration_content.sql exactly, so a
    // rejection surfaces as a field message instead of a database error.
    registration_enabled: z.boolean().optional(),
    registration_eyebrow: optionalText(80),
    registration_headline: optionalText(120),
    registration_body: optionalText(1_200),
    registration_pending_body: optionalText(1_200),
    registration_pending_label: optionalText(60),
    status: z.enum(["active", "hidden"]).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

// Ordered gallery image belonging to one program. `url` is rendered as an
// image source, so mailto: is meaningless and a protocol-relative `//host/...`
// would resolve to an attacker-controlled origin. Byte-identical to the CHECK
// constraint on onzio.program_media.url, so a rejection surfaces here as a
// field message rather than as a database error.
const PROGRAM_IMAGE_URL_PATTERN = /^(\/[^/\\]|https?:\/\/)/;

const programImageUrl = z
  .string()
  .max(2_048)
  .refine((value) => value === "" || PROGRAM_IMAGE_URL_PATTERN.test(value), {
    message:
      "Program image sources must be a local path or an http(s) URL",
  });

const programMediaMutation = z
  .object({
    id: uuid.optional(),
    program_id: uuid.optional(),
    url: programImageUrl.optional(),
    media_asset_id: nullableUuid.optional(),
    alt: optionalText(200),
    sort_order: z.number().int().optional(),
  })
  .strict();

const contactProfileMutation = z
  .object({
    public_email: z
      .string()
      .max(254)
      .refine(isValidPublicEmail, {
        message: "Public email must be empty or a valid email address",
      })
      .optional(),
    public_phone: z
      .string()
      .max(40)
      .refine(isValidPublicPhone, {
        message: "Public phone must be empty or a valid telephone number",
      })
      .optional(),
    service_area: optionalText(120),
    hours: optionalText(200),
  })
  .strict();

const contactPageMutation = z
  .object({
    eyebrow: optionalText(80),
    headline: optionalText(80),
    intro: optionalText(320),
    hero_media_asset_id: nullableUuid.optional(),
  })
  .strict();

const tryoutMutation = z
  .object({
    id: uuid.optional(),
    program_id: nullableUuid.optional(),
    status: z.enum(["upcoming", "open", "closed"]).optional(),
    eyebrow: optionalText(80),
    headline: optionalText(80),
    intro: optionalText(320),
    hero_media_asset_id: nullableUuid.optional(),
    eligibility_copy: optionalText(2_000),
    what_to_expect_copy: optionalText(2_000),
    preparation_copy: optionalText(2_000),
    event_date: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
      .optional(),
    location: optionalText(160),
    cost_text: optionalText(120),
    cta_label: optionalText(40),
    registration_href: externalHref,
    closed_message: optionalText(320),
    sort_order: z.number().int().optional(),
  })
  .strict();

// academy@1 homepage story band. Ceilings mirror the CHECK constraints in
// 20260808130000_dcfc_homepage_story_programs_page_content.sql exactly, so an
// over-long field surfaces as a form message instead of a database error.
const homepageStoryMutation = z
  .object({
    visible: z.boolean().optional(),
    heading: optionalText(120),
    body_primary: optionalText(1_200),
    body_secondary: optionalText(1_200),
    cta_label: optionalText(40),
  })
  .strict();

// Copy wrapped around the academy@1 programs surfaces. Same mirroring rule.
const programsPageMutation = z
  .object({
    pathway_eyebrow: optionalText(80),
    pathway_heading: optionalText(120),
    pathway_intro: optionalText(320),
    hero_eyebrow: optionalText(80),
    hero_headline_line_one: optionalText(80),
    hero_headline_line_two: optionalText(80),
    hero_intro: optionalText(320),
    closing_heading_line_one: optionalText(80),
    closing_heading_line_two: optionalText(80),
    closing_body: optionalText(320),
    closing_cta_label: optionalText(40),
  })
  .strict();

const NEW_DOMAIN_MUTATION_SCHEMAS = {
  programs: programMutation,
  program_media: programMediaMutation,
  programs_page_content: programsPageMutation,
  homepage_story_section: homepageStoryMutation,
  contact_profile: contactProfileMutation,
  contact_page_content: contactPageMutation,
  tryouts: tryoutMutation,
} as const;

const filter = z.object({
  kind: z.enum(["eq", "neq", "gt", "in"]),
  column: identifier,
  value: jsonValue,
});

export const adminDataRequestSchema = z
  .object({
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
  })
  .superRefine((request, context) => {
    const schema = NEW_DOMAIN_MUTATION_SCHEMAS[
      request.table as keyof typeof NEW_DOMAIN_MUTATION_SCHEMAS
    ];
    const isMutation = ["insert", "update", "upsert"].includes(
      request.operation,
    );
    if (!schema || !isMutation) return;

    if (!request.payload) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: `${request.table} ${request.operation} requires a payload`,
      });
      return;
    }

    const rows = Array.isArray(request.payload)
      ? request.payload
      : [request.payload];
    if (rows.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["payload"],
        message: `${request.table} ${request.operation} requires at least one row`,
      });
      return;
    }

    rows.forEach((payload, index) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            code: "custom",
            path: ["payload", ...(Array.isArray(request.payload) ? [index] : []), ...issue.path],
            message: issue.message,
          });
        }
      }

      if (
        request.table === "programs" &&
        (request.operation === "insert" || request.operation === "upsert")
      ) {
        for (const field of ["slug", "display_title"] as const) {
          if (!(field in payload)) {
            context.addIssue({
              code: "custom",
              path: ["payload", field],
              message: `Program ${request.operation} requires ${field}`,
            });
          }
        }
      }

      // A gallery image is only meaningful attached to a program and pointing
      // at something renderable. Both are database constraints too; asserting
      // them here turns a 23514/23502 into a readable field error.
      if (
        request.table === "program_media" &&
        (request.operation === "insert" || request.operation === "upsert")
      ) {
        if (typeof payload.program_id !== "string") {
          context.addIssue({
            code: "custom",
            path: ["payload", "program_id"],
            message: `Program media ${request.operation} requires program_id`,
          });
        }
        const hasUrl = typeof payload.url === "string" && payload.url !== "";
        const hasAsset = typeof payload.media_asset_id === "string";
        if (!hasUrl && !hasAsset) {
          context.addIssue({
            code: "custom",
            path: ["payload", "url"],
            message:
              "A program image requires an uploaded asset or a source path",
          });
        }
      }
    });
  });

export type AdminDataRequest = z.infer<typeof adminDataRequestSchema>;

export const SINGLETON_TABLES = new Set<AdminTable>([
  "about_page_content",
  "behind_the_rose_section",
  "club_logo_page_content",
  "contact_page_content",
  "contact_profile",
  "homepage_hero_content",
  "homepage_slideshow_settings",
  "homepage_story_section",
  "league_standings_settings",
  "programs_page_content",
  "shop_purchase_details",
  "site_branding",
]);
