import { z } from "zod";
import { PROFILE_LINK, isSafeStoredUrl, linkDestinationError, normalizeLinkDestination, type LinkDestinationOptions } from "@/lib/link-destination";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";
import { matchSummarySchema } from "@/lib/match-summary";
import {
  isValidPublicEmail,
  isValidPublicPhone,
} from "@/lib/contact-admin";
import { FOOTER_TAGLINE_LIMIT } from "@/lib/club-branding";
import { YOUR_CLUB_LIMITS } from "@/lib/your-club";
import { SEASON_ADJUSTMENT_LIMIT } from "@/lib/season-totals";
import { SPONSOR_NAME_LIMIT, SPONSOR_WEBSITE_LIMIT } from "@/lib/sponsor-content";

export const ADMIN_TABLE_FEATURES = {
  about_page_content: "about",
  behind_the_rose_section: "homepage",
  club_logo_page_content: "about",
  contact_page_content: "contact",
  contact_profile: "contact",
  goalkeeper_match_stats: "roster",
  goalkeeper_season_adjustments: "roster",
  goalkeeper_season_stats: "roster",
  goalkeeper_season_totals: "roster",
  homepage_hero_content: "homepage",
  homepage_slideshow_photos: "homepage",
  homepage_slideshow_settings: "homepage",
  homepage_story_section: "homepage",
  league_standings: "standings",
  league_standings_settings: "standings",
  matches: "schedule",
  player_match_stats: "roster",
  player_photos: "roster",
  player_season_adjustments: "roster",
  player_season_stats: "roster",
  player_season_totals: "roster",
  players: "roster",
  program_media: "programs",
  programs: "programs",
  programs_page_content: "programs",
  registrations: "registrations",
  registration_form_fields: "registrations",
  registration_forms: "registrations",
  registration_price_options: "registrations",
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
  tryouts_page_content: "tryouts",
} as const;

export type AdminTable = keyof typeof ADMIN_TABLE_FEATURES;

// ADMIN-RE-11c: views the admin reads but never writes. Season totals are worked
// out by the database (games added up plus adjustments).
export const ADMIN_READ_ONLY_TABLES: ReadonlySet<AdminTable> = new Set([
  "player_season_totals",
  "goalkeeper_season_totals",
]);

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

/**
 * Admin-editable link destinations written through this route, by table. The
 * route validates them here and stores `normalizeAdminLinkFields`'s output, so
 * the database only ever holds normalized links (onzio_private.normalize_link_destination
 * re-checks them).
 */
export const ADMIN_LINK_FIELDS: Partial<Record<string, Record<string, LinkDestinationOptions>>> = {
  site_social_links: { href: PROFILE_LINK },
  site_sponsor_logos: { website_url: {} },
  matches: { sponsor_link: {} },
  programs: { external_cta_href: {} },
  tryouts: { registration_href: {} },
};

const linkField = (table: string, column: string, maximum: number) => {
  const options = ADMIN_LINK_FIELDS[table]?.[column] ?? {};
  return z.string().refine(
    (value) => { const normalized = normalizeLinkDestination(value, options); return normalized !== null && normalized.length <= maximum; },
    { message: linkDestinationError(options) },
  );
};

/** The payload with every admin link column replaced by its normalized form. Run after validation. */
export function normalizeAdminLinkFields<T extends Record<string, unknown> | Record<string, unknown>[] | undefined>(table: string, payload: T): T {
  const fields = ADMIN_LINK_FIELDS[table];
  if (!fields || !payload) return payload;
  const normalize = (row: Record<string, unknown>) => {
    const next = { ...row };
    for (const [column, options] of Object.entries(fields)) {
      const value = next[column];
      if (typeof value === "string") next[column] = normalizeLinkDestination(value, options) ?? value;
    }
    return next;
  };
  return (Array.isArray(payload) ? payload.map(normalize) : normalize(payload)) as T;
}

const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
const nullableUuid = uuid.nullable();
const optionalText = (maximum: number) => z.string().max(maximum).optional();

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
    external_cta_href: linkField("programs", "external_cta_href", 2_048).optional(),
    registration_form_id: nullableUuid.optional(),
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

// ADMIN-RE-14. `href` had no limit in Zod or the database (the break-ui gap):
// 2,048 now, on every write, Branding's included. The link rule is the shared
// profile-link rule (https only). The id is the platform ("instagram"), kept as
// text because the table's key is (club_id, id).
const siteSocialLinkMutation = z
  .object({
    id: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_-]*$/)
      .optional(),
    label: optionalText(40),
    href: linkField("site_social_links", "href", YOUR_CLUB_LIMITS.socialHref).optional(),
    icon: optionalText(200),
    sort_order: z.number().int().min(0).max(100).optional(),
    updated_at: z.string().max(40).optional(),
  })
  .strict();

// ADMIN-RE-14. The footer line ceiling mirrors the CHECK on
// onzio.site_branding.footer_tagline (160), so a rejection is a field message,
// not a database error.
const siteBrandingMutation = z
  .object({
    club_logo_path: z.string().max(2_048).optional(),
    club_logo_asset_id: nullableUuid.optional(),
    inverse_logo_path: z.string().max(2_048).optional(),
    inverse_logo_asset_id: nullableUuid.optional(),
    footer_tagline: optionalText(FOOTER_TAGLINE_LIMIT),
    updated_at: z.string().max(40).optional(),
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
    registration_href: linkField("tryouts", "registration_href", 2_048).optional(),
    registration_form_id: nullableUuid.optional(),
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

// The two /tryouts page intro paragraphs. Ceilings mirror the CHECK
// constraints in 20260809120000_tryouts_page_content.sql exactly, so an
// over-long field surfaces as a form message instead of a database error.
const tryoutsPageMutation = z
  .object({
    intro_with_tryouts: optionalText(320),
    intro_no_tryouts: optionalText(320),
  })
  .strict();

// ADMIN-RE-07: every column of onzio.matches a club admin writes through
// /api/admin/data: the reimagined Add a game page and the classic Games page
// (app/admin/(protected)/schedule/page.tsx via lib/admin-client.ts), whose
// edit form resends every field. Every write must have this shape and these
// types: the text limits (lib/match-text-limits.ts) and whole scores from 0
// to 99. Decision 7's read-only production check (2026-11-09) found no row
// over them, so they hold on every write (ADMIN-RE-07c), and the database
// enforces them too (20261109120000_matches_text_and_score_checks.sql).
const plainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const wallClockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const matchScore = z.number().int().min(0).max(99).nullable();
const nullableString = z.string().nullable().optional();
// Length is checked before trimming: the database CHECK measures what is stored.
const limitedFilledText = (maximum: number) => z.string().max(maximum).trim().min(1);
const limitedNullableText = (maximum: number) => z.string().max(maximum).nullable().optional();

export const matchesMutation = z
  .object({
    id: uuid.optional(),
    season_id: uuid.optional(),
    date: plainDate.optional(),
    time: wallClockTime.optional(),
    opponent: limitedFilledText(MATCH_TEXT_LIMITS.opponent).optional(),
    opponent_short_name: limitedNullableText(MATCH_TEXT_LIMITS.opponent_short_name),
    opponent_logo_url: nullableString,
    opponent_logo_asset_id: nullableUuid.optional(),
    competition: limitedNullableText(MATCH_TEXT_LIMITS.competition),
    // cinematic@2 (Rose City) Schedule fields; replay_video_url and summary are
    // checked in adminDataRequestSchema's superRefine below.
    league_logo_url: nullableString,
    league_logo_asset_id: nullableUuid.optional(),
    replay_video_url: nullableString,
    summary: z.unknown().optional(),
    sponsor_name: nullableString,
    sponsor_logo_url: nullableString,
    sponsor_logo_asset_id: nullableUuid.optional(),
    sponsor_link: linkField("matches", "sponsor_link", 2_048).nullable().optional(),
    home: z.boolean().optional(),
    venue: limitedFilledText(MATCH_TEXT_LIMITS.venue).optional(),
    address: limitedNullableText(MATCH_TEXT_LIMITS.address),
    city: limitedNullableText(MATCH_TEXT_LIMITS.city),
    state: limitedNullableText(MATCH_TEXT_LIMITS.state),
    rose_city_score: matchScore.optional(),
    opponent_score: matchScore.optional(),
    // ADMIN-RE-11b (decision 4): false for friendlies and cups, which never touch the league table.
    league_game: z.boolean().optional(),
    attendance: z.number().int().min(0).nullable().optional(),
    scorers: z.array(jsonValue).max(200).optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .strict();

// ADMIN-RE-11b: a team name holds 60 characters (database CHECK
// league_standings_team_name_length). Counted before trimming, as the CHECK
// measures what is stored. The other columns keep the classic editor's own
// checks, so only what this package changes is pinned here.
export const LEAGUE_TEAM_NAME_LIMIT = 60;
const leagueStandingsMutation = z
  .object({
    team_name: z.string().max(LEAGUE_TEAM_NAME_LIMIT).optional(),
    season_id: uuid.optional(),
  })
  .passthrough();

// ADMIN-RE-15 (decision 0007): one row per sponsor, with a Homepage and a
// Footer switch and an optional website. Both admin portals write through
// here: the one-list page and the classic Sponsors page. The ceilings mirror
// the database CHECKs (20261110150000_sponsors_one_list.sql): a name of 1 to
// 60 characters, counted as the database counts them, and a website that is
// an http(s) address of at most 2,048. `placement` is the old shape, accepted
// so a page loaded before the deploy can still save.
const sponsorName = z
  .string()
  .refine((value) => Array.from(value).length <= SPONSOR_NAME_LIMIT, {
    message: `Sponsor names stop at ${SPONSOR_NAME_LIMIT} characters`,
  })
  .refine((value) => value.trim() !== "", { message: "Give this sponsor a name" });
const sponsorWebsite = linkField("site_sponsor_logos", "website_url", SPONSOR_WEBSITE_LIMIT).nullable();
const siteSponsorLogoMutation = z
  .object({
    id: uuid.optional(),
    placement: z.enum(["carousel", "footer"]).nullable().optional(),
    name: sponsorName.optional(),
    logo_url: z.string().min(1).max(2_048).optional(),
    media_asset_id: nullableUuid.optional(),
    sort_order: z.number().int().min(0).max(10_000).optional(),
    show_on_homepage: z.boolean().optional(),
    show_in_footer: z.boolean().optional(),
    website_url: sponsorWebsite.optional(),
    created_at: z.string().max(40).optional(),
  })
  .strict();

// ADMIN-RE-11c (decision 0001): a player's adjustment, the part of their season
// totals added by hand. It may be negative (2026-11-10, "Keep today's numbers").
// The ceilings mirror the database CHECKs (20261110220000_season_totals_add_up.sql);
// the database also refuses an adjustment that takes a total below 0.
const adjustmentNumber = z.number().int().min(-SEASON_ADJUSTMENT_LIMIT).max(SEASON_ADJUSTMENT_LIMIT);
const playerSeasonAdjustmentMutation = z
  .object({
    player_id: uuid.optional(),
    season_id: uuid.optional(),
    goals: adjustmentNumber.optional(),
    assists: adjustmentNumber.optional(),
    tackles: adjustmentNumber.optional(),
    starts: adjustmentNumber.optional(),
    yellow: adjustmentNumber.optional(),
    red: adjustmentNumber.optional(),
    mins: adjustmentNumber.optional(),
    offsides: adjustmentNumber.optional(),
    fouls: adjustmentNumber.optional(),
    fouls_suffered: adjustmentNumber.optional(),
  })
  .strict();
const goalkeeperSeasonAdjustmentMutation = z
  .object({
    player_id: uuid.optional(),
    season_id: uuid.optional(),
    goals_against: adjustmentNumber.optional(),
    saves: adjustmentNumber.optional(),
    clean_sheets: adjustmentNumber.optional(),
    starts: adjustmentNumber.optional(),
    yellow: adjustmentNumber.optional(),
    red: adjustmentNumber.optional(),
    mins: adjustmentNumber.optional(),
  })
  .strict();

const MATCH_INSERT_REQUIRED = ["season_id", "date", "time", "opponent", "venue"] as const;

const NEW_DOMAIN_MUTATION_SCHEMAS = {
  matches: matchesMutation,
  league_standings: leagueStandingsMutation,
  player_season_adjustments: playerSeasonAdjustmentMutation,
  goalkeeper_season_adjustments: goalkeeperSeasonAdjustmentMutation,
  programs: programMutation,
  program_media: programMediaMutation,
  programs_page_content: programsPageMutation,
  homepage_story_section: homepageStoryMutation,
  contact_profile: contactProfileMutation,
  contact_page_content: contactPageMutation,
  site_branding: siteBrandingMutation,
  site_social_links: siteSocialLinkMutation,
  site_sponsor_logos: siteSponsorLogoMutation,
  tryouts: tryoutMutation,
  tryouts_page_content: tryoutsPageMutation,
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
    // Inclusive row window for paginated reads (PostgREST .range()). Reads
    // that can exceed PostgREST's default row cap must page with an explicit
    // stable order plus this window.
    range: z
      .object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
      })
      .optional(),
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
    if (request.operation !== "select" && ADMIN_READ_ONLY_TABLES.has(request.table)) {
      context.addIssue({
        code: "custom",
        path: ["operation"],
        message: `${request.table} is read-only`,
      });
      return;
    }
    // Every *_url, *_href and *_link column (images and media included) refuses script, data and
    // protocol-relative (`//host`) values. Link destinations get the stricter shared rule below.
    if (request.payload && ["insert", "update", "upsert"].includes(request.operation)) {
      const linkColumns = ADMIN_LINK_FIELDS[request.table] ?? {};
      for (const [index, item] of (Array.isArray(request.payload) ? request.payload : [request.payload]).entries()) {
        for (const [key, value] of Object.entries(item)) {
          if (typeof value === "string" && /(?:url|href|link)$/.test(key) && !(key in linkColumns) && !isSafeStoredUrl(value)) {
            context.addIssue({ code: "custom", path: ["payload", ...(Array.isArray(request.payload) ? [index] : []), key], message: "URL fields require http, https, mailto, or a local path" });
          }
        }
      }
    }
    // A match replay is stored only as the canonical YouTube embed link the
    // Schedule editor produces; the database CHECK mirrors this.
    if (request.table === "matches" && request.payload && ["insert", "update", "upsert"].includes(request.operation)) {
      for (const [index, item] of (Array.isArray(request.payload) ? request.payload : [request.payload]).entries()) {
        const value = item.replay_video_url;
        if (value !== undefined && value !== null && !(typeof value === "string" && (value === "" || MATCH_REPLAY_EMBED_PATTERN.test(value)))) {
          context.addIssue({ code: "custom", path: ["payload", ...(Array.isArray(request.payload) ? [index] : []), "replay_video_url"], message: "Replay video must be a YouTube video link" });
        }
        // The Match Summary (lib/match-summary.ts); the database CHECK mirrors this.
        if (item.summary !== undefined && item.summary !== null && !matchSummarySchema.safeParse(item.summary).success) {
          context.addIssue({ code: "custom", path: ["payload", ...(Array.isArray(request.payload) ? [index] : []), "summary"], message: "Check the match summary fields" });
        }
      }
    }
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

      if (
        request.table === "site_sponsor_logos" &&
        (request.operation === "insert" || request.operation === "upsert")
      ) {
        for (const field of ["name", "logo_url"] as const) {
          if (!(field in payload)) {
            context.addIssue({
              code: "custom",
              path: ["payload", field],
              message: `Sponsor ${request.operation} requires ${field}`,
            });
          }
        }
      }

      if (
        request.table === "matches" &&
        (request.operation === "insert" || request.operation === "upsert")
      ) {
        for (const field of MATCH_INSERT_REQUIRED) {
          if (!(field in payload)) {
            context.addIssue({
              code: "custom",
              path: ["payload", field],
              message: `Match ${request.operation} requires ${field}`,
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

/**
 * Media asset columns the admin data route resolves into delivery URLs on
 * select.
 *
 * A row that references published media stores only the asset UUID; the public
 * site turns that into a URL through `resolveMediaReferences` in
 * `lib/queries.ts`. `/api/admin/data` returned the raw row instead, so
 * /admin/programs had no URL to render and showed "Published media attached"
 * placeholder text in place of hero and detail images a club had already
 * uploaded. The `<field>_media_url` naming matches the hydrated shapes
 * `lib/queries.ts` already produces for the same tables.
 */
export const ADMIN_SELECT_MEDIA_REFERENCES: Partial<
  Record<AdminTable, ReadonlyArray<{ assetId: string; url: string }>>
> = {
  matches: [
    { assetId: "opponent_logo_asset_id", url: "opponent_logo_url" },
    { assetId: "sponsor_logo_asset_id", url: "sponsor_logo_url" },
    { assetId: "league_logo_asset_id", url: "league_logo_url" },
  ],
  programs: [
    { assetId: "hero_media_asset_id", url: "hero_media_url" },
    { assetId: "detail_media_asset_id", url: "detail_media_url" },
  ],
  tryouts: [{ assetId: "hero_media_asset_id", url: "hero_media_url" }],
};

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
  "tryouts_page_content",
]);
