// Lions FC hosted-PRODUCTION content + media import.
//
// Derived from scripts/import-lions-media-staging.ts, but with the guard
// direction inverted to match scripts/import-diverse-city-production.ts
// (DCFC-802). The staging script CREATES the club and therefore refuses to
// run if it already exists. Production is the opposite case: Lions was
// provisioned on 2026-08-15 by scripts/provision-lions-production.ts, so the
// club, its club_domains row and its club_members owner row all exist
// already. This script asserts their exact presence and imports content into
// them; it never creates a tenant.
//
// Two-mode split, unchanged:
//   --prepare-sql   generates a single reviewable `do $$ ... $$` SQL file.
//                    Never executed by this script. A human applies it.
//                    Zero hosted mutations.
//   --sync-storage  performs real, idempotent, checksum-verified Storage
//                    writes only (no onzio content rows at all).
//
// FOUR row sets from buildLionsLocalImportRows are deliberately DROPPED here,
// each for a distinct reason. Getting any of these wrong is silent damage to
// a live tenant, so they are enumerated rather than left implicit:
//
//   `club`          The builder emits lifecycle "active", public_access
//                   "live", tier "pro". Upserting that would publish Lions to
//                   the world and promote its tier without a cent of billing
//                   -- the lifecycle/public_access flip is supposed to come
//                   from real Stripe checkout via apply_stripe_projection.
//                   Only the three colour columns are wanted, so they are
//                   applied as a targeted UPDATE below, never an upsert.
//   `domain`        The builder emits hostname "lions.localhost" with
//                   environment "staging". On production this does NOT
//                   conflict -- the unique index is
//                   club_domains_one_active_primary_per_environment, scoped
//                   per environment -- so it would silently attach a junk
//                   localhost domain to the live tenant.
//   `subscription`  Fake Stripe ids (cus_lions_local_only, status "active",
//                   paid_through 2027). Writing it would corrupt billing
//                   state ahead of a real checkout.
//   club_members    Not emitted by the builder at all; the staging script
//                   synthesises one because staging had no owner. Production
//                   already has exactly one active owner, which this script
//                   reads rather than writes.
//
// Roster and staff are also replaced rather than imported. The builder's 32
// players and 6 staff are prospect-mockup placeholders with invented human
// names (Marcus Hale, Elena Torres, ...). Publishing invented people under a
// real club's name is not acceptable, so this script substitutes neutral,
// obviously-editable scaffolding: 22 players named "Player 1".."Player 22"
// and 4 staff slots labelled by job title. Christian's call, 2026-08-15.
// player_season_stats and goalkeeper_season_stats are dropped along with
// them -- they are foreign-keyed to the original player ids and editorial@1
// has no stats module, so they would be both broken and invisible.
//
// presentation_documents.created_by, presentation_state.updated_by, and
// presentation_publications.created_by are `not null references
// auth.users(id)`. The local rows fill them with a seed-only actor that
// exists on no hosted project. Unlike the staging script -- which needs an
// explicit --owner-user-id because the club did not exist yet -- production
// resolves the real owner inside the transaction with
// `select user_id into strict v_owner from onzio.club_members`, the DCFC-802
// pattern. `into strict` raises on zero or multiple rows, so the
// exactly-one-owner invariant is enforced in the database, not just by the
// TypeScript pre-flight.
//
// KNOWN GAP, deliberately out of scope: league_standings and
// league_standings_settings are not produced by the importer at all. They
// are seeded by scripts/seed-lions-standings-local.ts, which is loopback-only
// by design. Production Lions will render an empty standings table until a
// separate, reviewed hosted-standings script exists.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  buildLionsLocalImportRows,
  LIONS_LOCAL_TENANT_ID,
  type LionsLocalImportRows,
} from "@/lib/migration/lions-media-local-import";
import {
  buildLionsMediaImportPlan,
  LIONS_SOURCE_BUCKET,
  LIONS_SOURCE_PREFIX,
  LIONS_SOURCE_PROJECT_REF,
  type LionsKnownAssetName,
  type LionsMediaImportPlan,
  type LionsSourceAssetInput,
} from "@/lib/migration/lions-media-plan";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { normalizeGraphic, normalizePhoto } from "@/lib/media-processing";

// `ioalthwsdrlzrubomrow` is "Onzio Platform Production" -- the same single
// production project Diverse City FC and Rose City live in. There is one
// production project for the whole platform, not one per tenant. Hardcoded
// into PROJECT_URL rather than read from env, so there is no way to point
// this script at a different project by mistake.
const PROJECT_REF = "ioalthwsdrlzrubomrow";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

// The real production Lions tenant, created 2026-08-15 by
// scripts/provision-lions-production.ts and verified read-only immediately
// afterwards. Distinct from LIONS_LOCAL_TENANT_ID
// (9d292f0a-6f93-54b1-b21c-ce2d0af3afa7) and from the staging tenant
// (8d82bb47-c10b-4823-8ec7-c4de87d34b0a).
const TARGET_TENANT_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";
const TARGET_HOSTNAME = "lions-fc-private.vercel.app";

// The exact state provisioning left behind. Asserted before anything is
// generated and again inside the transaction, so this script fails closed if
// the tenant has already been promoted, billed, or otherwise moved on.
const EXPECTED_CLUB_NAME = "Lions Football Club";
const EXPECTED_CLUB_KIND = "customer";
const EXPECTED_CLUB_TIER = "starter";
const EXPECTED_CLUB_LIFECYCLE = "onboarding";
const EXPECTED_CLUB_PUBLIC_ACCESS = "preview";

// Colour columns are the only part of the builder's `clubs` row that should
// reach production. accent_color drives the editorial@1 theme
// (--club-accent / --surface / --on-dark); provisioning leaves all three
// NULL, and a NULL accent is a visible theme regression. Pinned by
// docs/lions-fc-launch-plan.md.
const CLUB_PRIMARY_COLOR = "#1B2958";
const CLUB_SECONDARY_COLOR = "#AD3234";
const CLUB_ACCENT_COLOR = "#F0F0F0";

// Neutral roster/staff scaffolding that replaces the mockup's invented
// people. See the header note. Numbers 1..22 are the shirt numbers; the
// position spread mirrors a conventional squad so the roster page groups
// sensibly instead of listing 22 undifferentiated rows.
const PLACEHOLDER_PLAYER_COUNT = 22;
// onzio.players.age is `integer not null` with `players_age_check`
// (age >= 14 and age <= 80), so it cannot be null and cannot be 0. Verified
// against the production schema. 18 is the lowest plausible senior age, and
// giving all 22 the SAME value is deliberate: a uniform column reads as an
// unfilled default, where the mockup's varied 19-27 spread reads as real
// data. Same reasoning for the empty strings on the other not-null text
// columns (nationality, height, weight, hometown, photo_url).
const PLACEHOLDER_PLAYER_AGE = 18;
const PLACEHOLDER_POSITIONS: readonly string[] = [
  "Goalkeeper", "Goalkeeper",
  "Defender", "Defender", "Defender", "Defender", "Defender", "Defender", "Defender",
  "Midfielder", "Midfielder", "Midfielder", "Midfielder", "Midfielder", "Midfielder",
  "Forward", "Forward", "Forward", "Forward", "Forward", "Forward", "Forward",
];
const PLACEHOLDER_STAFF: ReadonlyArray<{ slot: string; role: string }> = [
  { slot: "1", role: "Head Coach" },
  { slot: "2", role: "Assistant Coach" },
  { slot: "3", role: "Goalkeeper Coach" },
  { slot: "4", role: "Team Manager" },
];

// docs/phase-9/lions-media-import-plan.json describes only the
// source-Storage-to-normalized-asset transformation (checksums, dimensions,
// mime types) plus a `destination.tenantId` that is baked into each asset's
// `assetId` and `destinationPath`. It is therefore reusable byte-for-byte as
// the approved plan for staging: buildLionsLocalImportRows requires that
// baked-in tenant id to equal LIONS_LOCAL_TENANT_ID regardless of where the
// content is ultimately headed, and every club-id-shaped string in the
// resulting rows (destinationPath, storage_path, club_id, ...) gets
// translated from LIONS_LOCAL_TENANT_ID to TARGET_TENANT_ID below, the same
// way DCFC-503 translates DIVERSE_CITY_LOCAL_TENANT_ID. A staging-specific
// plan would only be needed if the plan encoded a real destination
// environment concern (bucket policy, delivery host, etc.) -- it does not.
const APPROVED_PLAN_DIGEST =
  "883305c9509827ac1a2f43ee6d5ec5f1e2d9c91903c1331183dd3e6e01593715";
const APPROVED_PLAN_FILE_SHA256 =
  "4060cd73c13eccba68fcc19a9bf3e2b547227a16f4956a9f02b9a99a62e268b7";
const APPROVED_PLAN_GENERATED_AT = "2026-07-30T02:12:43.814Z";
const DEFAULT_SOURCE_ROOT = "/Users/christianalcala/Downloads/lionsFCAssets";
const DEFAULT_PLAN_PATH = resolve("docs/phase-9/lions-media-import-plan.json");

const ASSET_FILES: Record<LionsKnownAssetName, string> = {
  "crest.png": "Logos/crest.png",
  "crest-white.png": "Logos/crest-white.png",
  "491417483_17927675355024475_5496002634953332765_n.jpg":
    "Slideshow/491417483_17927675355024475_5496002634953332765_n.jpg",
  "491499458_17927675328024475_7356353145949999522_n.jpg":
    "Slideshow/491499458_17927675328024475_7356353145949999522_n.jpg",
  "490753204_17927675316024475_6690706346505779685_n.jpg":
    "Slideshow/490753204_17927675316024475_6690706346505779685_n.jpg",
  "491452867_17927675298024475_4413570856070124753_n.jpg":
    "Slideshow/491452867_17927675298024475_4413570856070124753_n.jpg",
  "491413366_17927675394024475_4053105668658067411_n.jpg":
    "Slideshow/491413366_17927675394024475_4053105668658067411_n.jpg",
  "blue-jersey-transparent.png": "Jersey/blue-jersey-transparent.png",
  "red-jersey-transparent.png": "Jersey/red-jersey-transparent.png",
  "white-jersey-transparent.png": "Jersey/white-jersey-transparent.png",
};

const FROZEN_NOW = "2026-07-29T00:00:00.000Z";

// `clubs`, `club_domains`, `club_members`, `club_subscriptions`,
// `player_season_stats` and `goalkeeper_season_stats` are deliberately ABSENT
// from this map. upsertSql() throws `Unexpected destination table` on any
// table it does not find here, so their omission is an active guard, not an
// oversight: if a future edit reintroduces a statement for one of them, the
// script fails at generation time rather than silently damaging a live
// tenant. The clubs colour update below is hand-written SQL for the same
// reason -- it must never go through the generic upsert path.
const CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  seasons: ["id"],
  matches: ["id"],
  players: ["id"],
  staff: ["id"],
  presentation_documents: ["id"],
  presentation_state: ["club_id"],
  presentation_publications: ["id"],
  media_assets: ["id"],
  site_branding: ["club_id"],
  homepage_hero_content: ["club_id"],
  homepage_slideshow_settings: ["club_id"],
  homepage_slideshow_photos: ["id"],
  shop_kit_section: ["id"],
  shop_kit_photos: ["id"],
  shop_carousel_photos: ["id"],
  shop_purchase_details: ["club_id"],
  about_page_content: ["club_id"],
  site_sponsor_logos: ["id"],
  site_social_links: ["club_id", "id"],
  club_identity: ["club_id"],
  contact_profile: ["club_id"],
  contact_page_content: ["club_id"],
  tryouts: ["id"],
  tryouts_page_content: ["club_id"],
};

const JSON_COLUMNS = new Set([
  "about_page_content.story_paragraphs",
  "about_page_content.values",
  "presentation_documents.configuration",
  "presentation_publications.validation_result",
  "shop_kit_section.bullet_points",
  "shop_purchase_details.cards",
  "club_identity.highlights",
]);

const INSERT_ONLY_TABLES = new Set([
  "presentation_documents",
  "presentation_publications",
]);

// Columns whose value must come from the SQL-verified owner variable rather
// than a client-supplied literal. `club_members.user_id` is absent from the
// staging version of this set: production never writes a membership row, it
// reads the existing owner into v_owner instead.
const OWNER_SUBSTITUTED_COLUMNS = new Set([
  "presentation_documents.created_by",
  "presentation_state.updated_by",
  "presentation_publications.created_by",
]);

type SourceRow = Record<string, unknown>;
type ServiceClient = SupabaseClient<any, any, any, any, any>;

// Everything the tenant already owns (club, domain, subscription) plus the
// mockup people (players, staff and their season stats) is omitted; the
// people come back as generated placeholders.
type LionsProductionRows = Omit<
  LionsLocalImportRows,
  | "club"
  | "domain"
  | "subscription"
  | "auditEvent"
  | "players"
  | "staff"
  | "playerSeasonStats"
  | "goalkeeperSeasonStats"
> & {
  players: SourceRow[];
  staff: SourceRow[];
};

// Both flag sets are explicit whitelists. The staging script only whitelists
// booleans, so any unrecognised `--flag` silently falls through to the
// value-flag branch: a renamed boolean reports the confusing "Missing value
// for --x" instead of "unknown flag", and a typo'd value flag like
// `--source-roots` is accepted and ignored, silently using the default path.
// Both are covered by tests/contracts/lions-production-import.test.ts.
const BOOLEAN_FLAGS = new Set(["confirm-production", "prepare-sql", "sync-storage"]);
const VALUE_FLAGS = new Set(["source-root", "plan", "sql-out"]);

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}.`);
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      result[key] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(
        `Unknown flag ${arg}. Booleans: ${[...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(", ")}. Value flags: ${[...VALUE_FLAGS].map((flag) => `--${flag}`).join(", ")}.`,
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier ${value}.`);
  }
  return `"${value}"`;
}

function sqlLiteral(table: string, column: string, value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Unsafe number for ${table}.${column}.`);
    return String(value);
  }
  if (typeof value !== "string" && !JSON_COLUMNS.has(`${table}.${column}`)) {
    throw new Error(`Unexpected non-JSON value for ${table}.${column}.`);
  }
  const serialized = JSON_COLUMNS.has(`${table}.${column}`)
    ? JSON.stringify(value)
    : String(value);
  return `'${serialized.replaceAll("'", "''")}'${
    JSON_COLUMNS.has(`${table}.${column}`) ? "::jsonb" : ""
  }`;
}

function upsertSql(table: string, row: SourceRow): string {
  const conflicts = CONFLICT_COLUMNS[table];
  if (!conflicts) throw new Error(`Unexpected destination table ${table}.`);
  const columns = Object.keys(row).sort();
  const values = columns.map((column) => {
    if (OWNER_SUBSTITUTED_COLUMNS.has(`${table}.${column}`)) return "v_owner";
    return sqlLiteral(table, column, row[column]);
  });
  const updates = columns.filter((column) => !conflicts.includes(column));
  const conflictSql = conflicts.map(quoteIdentifier).join(", ");
  if (updates.length === 0 || INSERT_ONLY_TABLES.has(table)) {
    return `insert into onzio.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) values (${values.join(", ")}) on conflict (${conflictSql}) do nothing;`;
  }
  const assignments = updates.map(
    (column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`,
  ).join(", ");
  const currentTuple = updates.map(
    (column) => `target.${quoteIdentifier(column)}`,
  ).join(", ");
  const incomingTuple = updates.map(
    (column) => `excluded.${quoteIdentifier(column)}`,
  ).join(", ");
  return `insert into onzio.${quoteIdentifier(table)} as target (${columns.map(quoteIdentifier).join(", ")}) values (${values.join(", ")}) on conflict (${conflictSql}) do update set ${assignments} where (${currentTuple}) is distinct from (${incomingTuple});`;
}

function translateValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replaceAll(LIONS_LOCAL_TENANT_ID, TARGET_TENANT_ID);
  }
  if (Array.isArray(value)) return value.map(translateValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SourceRow).map(([key, item]) => [key, translateValue(item)]),
    );
  }
  return value;
}

// Neutral roster scaffolding. Ids are deterministic and namespaced with
// ":placeholder:" so they can never collide with the mockup roster's
// `onzio:lions:player:<mockupId>` ids -- if the real people are ever imported
// later, these remain separately identifiable and deletable.
function placeholderPlayers(clubId: string, now: string): SourceRow[] {
  return Array.from({ length: PLACEHOLDER_PLAYER_COUNT }, (_unused, index) => {
    const number = index + 1;
    return {
      id: deterministicUuid(`onzio:lions:placeholder:player:${number}`),
      club_id: clubId,
      number,
      name: `Player ${number}`,
      caption: null,
      nationality: "",
      position: PLACEHOLDER_POSITIONS[index],
      height: "",
      weight: "",
      hometown: "",
      age: PLACEHOLDER_PLAYER_AGE,
      school: null,
      previous_club: null,
      photo_url: "",
      photo_asset_id: null,
      active: true,
      bio: "",
      pronunciation: null,
      foot: null,
      created_at: now,
      updated_at: now,
    };
  });
}

// Staff slots are labelled by job title rather than by an invented person's
// name: the role tells the club what the slot is for, and `name` carries the
// same title so nothing renders blank before they edit it.
function placeholderStaff(clubId: string, now: string): SourceRow[] {
  return PLACEHOLDER_STAFF.map((member) => ({
    id: deterministicUuid(`onzio:lions:placeholder:staff:${member.slot}`),
    club_id: clubId,
    initials: "",
    name: member.role,
    role: member.role,
    hometown: "",
    nationality: "",
    bio: null,
    photo_url: "",
    photo_asset_id: null,
    active: true,
    created_at: now,
    updated_at: now,
  }));
}

function productionRows(rows: LionsLocalImportRows): LionsProductionRows {
  const translated = translateValue({
    seasons: rows.seasons,
    matches: rows.matches,
    presentationDocument: rows.presentationDocument,
    presentationState: rows.presentationState,
    presentationPublication: rows.presentationPublication,
    mediaAssets: rows.mediaAssets,
    siteBranding: rows.siteBranding,
    homepageHeroContent: rows.homepageHeroContent,
    homepageSlideshowSettings: rows.homepageSlideshowSettings,
    homepageSlideshowPhotos: rows.homepageSlideshowPhotos,
    shopKitSections: rows.shopKitSections,
    shopKitPhotos: rows.shopKitPhotos,
    shopCarouselPhotos: rows.shopCarouselPhotos,
    shopPurchaseDetails: rows.shopPurchaseDetails,
    aboutPageContent: rows.aboutPageContent,
    siteSponsorLogos: rows.siteSponsorLogos,
    siteSocialLinks: rows.siteSocialLinks,
    clubIdentity: rows.clubIdentity,
    contactProfile: rows.contactProfile,
    contactPageContent: rows.contactPageContent,
    tryouts: rows.tryouts,
    tryoutsPageContent: rows.tryoutsPageContent,
  }) as Omit<
    LionsLocalImportRows,
    | "club" | "domain" | "subscription" | "auditEvent"
    | "players" | "staff" | "playerSeasonStats" | "goalkeeperSeasonStats"
  >;

  // No `club`, `domain`, `subscription` or `clubMembers` here, by design --
  // see the four-row-set note in this file's header. The tenant already owns
  // all four, and the builder's versions of the first three are actively
  // wrong for production.
  return {
    ...translated,
    players: placeholderPlayers(TARGET_TENANT_ID, FROZEN_NOW),
    staff: placeholderStaff(TARGET_TENANT_ID, FROZEN_NOW),
  } as unknown as LionsProductionRows;
}

async function readAssets(sourceRoot: string): Promise<LionsSourceAssetInput[]> {
  return Promise.all(
    (Object.entries(ASSET_FILES) as Array<[LionsKnownAssetName, string]>).map(
      async ([name, relativePath]) => ({
        name,
        bytes: await readFile(resolve(sourceRoot, relativePath)),
      }),
    ),
  );
}

async function verifiedPlan(planPath: string, sourceRoot: string) {
  const manifestBytes = await readFile(planPath);
  if (sha256(manifestBytes) !== APPROVED_PLAN_FILE_SHA256) {
    throw new Error("Checked-in Lions plan file SHA-256 does not match the approved byte digest.");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as LionsMediaImportPlan;
  const fresh = await buildLionsMediaImportPlan({
    sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
    sourceBucket: LIONS_SOURCE_BUCKET,
    sourcePrefix: LIONS_SOURCE_PREFIX,
    destinationEnvironment: "staging",
    destinationTenantId: LIONS_LOCAL_TENANT_ID,
    dryRun: true,
    confirmedDestinationEnvironment: "staging",
    generatedAt: APPROVED_PLAN_GENERATED_AT,
    assets: await readAssets(sourceRoot),
  });
  if (
    manifest.planDigest !== APPROVED_PLAN_DIGEST ||
    fresh.planDigest !== APPROVED_PLAN_DIGEST ||
    JSON.stringify(fresh) !== JSON.stringify(manifest)
  ) {
    throw new Error("Lions media manifest does not match the approved immutable plan.");
  }
  return manifest;
}

// Both modes assert the SAME thing, and it is the opposite of what the
// staging script asserts. Staging creates the club, so it refuses to run if
// the club exists. Production imports into a club that must already exist,
// so it refuses to run unless the tenant is present AND still in exactly the
// state provisioning left it in. A drifted tenant -- already promoted to a
// paid tier, already flipped live, already billed -- means someone has moved
// on past this step, and re-running an import over that is a data-loss
// event, not a retry.
async function assertHostedTarget(service: ServiceClient) {
  const { data: club, error: clubError } = await service
    .schema("onzio")
    .from("clubs")
    .select("id, slug, name, kind, tier, lifecycle, public_access")
    .eq("id", TARGET_TENANT_ID)
    .single();
  if (clubError) throw clubError;
  if (
    club.slug !== "lions" ||
    club.name !== EXPECTED_CLUB_NAME ||
    club.kind !== EXPECTED_CLUB_KIND ||
    club.tier !== EXPECTED_CLUB_TIER ||
    club.lifecycle !== EXPECTED_CLUB_LIFECYCLE ||
    club.public_access !== EXPECTED_CLUB_PUBLIC_ACCESS
  ) {
    throw new Error(
      `Production club ${TARGET_TENANT_ID} no longer matches the provisioned Lions target ` +
        `(expected slug "lions", name "${EXPECTED_CLUB_NAME}", kind "${EXPECTED_CLUB_KIND}", ` +
        `tier "${EXPECTED_CLUB_TIER}", lifecycle "${EXPECTED_CLUB_LIFECYCLE}", ` +
        `public_access "${EXPECTED_CLUB_PUBLIC_ACCESS}"; found slug "${club.slug}", ` +
        `name "${club.name}", kind "${club.kind}", tier "${club.tier}", ` +
        `lifecycle "${club.lifecycle}", public_access "${club.public_access}").`,
    );
  }

  // Scoped to this club_id as well as the hostname: a same-hostname row on
  // some other tenant must not satisfy this.
  const { count: domainCount, error: domainError } = await service
    .schema("onzio")
    .from("club_domains")
    .select("id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("hostname", TARGET_HOSTNAME)
    .eq("environment", "production")
    .eq("active", true)
    .eq("is_primary", true);
  if (domainError) throw domainError;
  if (domainCount !== 1) {
    throw new Error(
      `Expected exactly one active primary production club_domains row for ${TARGET_HOSTNAME} on club ${TARGET_TENANT_ID}; found ${domainCount}.`,
    );
  }

  // The client-side half of the SQL's `into strict v_owner`. Checked here too
  // so a missing or duplicated owner fails before any SQL is generated,
  // rather than halfway through applying it.
  const { count: ownerCount, error: ownerError } = await service
    .schema("onzio")
    .from("club_members")
    .select("user_id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownerError) throw ownerError;
  if (ownerCount !== 1) {
    throw new Error(
      `The production Lions tenant must have exactly one active owner; found ${ownerCount}.`,
    );
  }

  // Ordering guard, mirroring DCFC-802: this import must land before real
  // billing. Once checkout has run, apply_stripe_projection owns
  // lifecycle/public_access and a bulk content import is no longer a safe
  // operation to replay.
  const { count: subscriptionCount, error: subscriptionError } = await service
    .schema("onzio")
    .from("club_subscriptions")
    .select("club_id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID);
  if (subscriptionError) throw subscriptionError;
  if (subscriptionCount !== 0) {
    throw new Error(
      "Refusing to run: the production Lions tenant already has a club_subscriptions row. This import must precede real Stripe checkout.",
    );
  }
}

function buildSql(rows: LionsProductionRows, planDigest: string): string {
  const statements = [
    // Colour-only, hand-written, and never routed through upsertSql -- the
    // generic upsert would carry lifecycle/public_access/tier along with it.
    // Guarded on the same fingerprint asserted above so a concurrent
    // promotion between pre-flight and apply cannot slip through.
    `update onzio.clubs set primary_color = ${sqlLiteral("clubs", "primary_color", CLUB_PRIMARY_COLOR)}, secondary_color = ${sqlLiteral("clubs", "secondary_color", CLUB_SECONDARY_COLOR)}, accent_color = ${sqlLiteral("clubs", "accent_color", CLUB_ACCENT_COLOR)}, updated_at = now() where id = '${TARGET_TENANT_ID}'::uuid and lifecycle = '${EXPECTED_CLUB_LIFECYCLE}' and public_access = '${EXPECTED_CLUB_PUBLIC_ACCESS}' and (primary_color, secondary_color, accent_color) is distinct from (${sqlLiteral("clubs", "primary_color", CLUB_PRIMARY_COLOR)}, ${sqlLiteral("clubs", "secondary_color", CLUB_SECONDARY_COLOR)}, ${sqlLiteral("clubs", "accent_color", CLUB_ACCENT_COLOR)});`,
    ...rows.seasons.map((row) => upsertSql("seasons", row)),
    ...rows.matches.map((row) => upsertSql("matches", row)),
    ...rows.players.map((row) => upsertSql("players", row)),
    ...rows.staff.map((row) => upsertSql("staff", row)),
    upsertSql("presentation_documents", rows.presentationDocument),
    upsertSql("presentation_state", rows.presentationState),
    upsertSql("presentation_publications", rows.presentationPublication),
    ...rows.mediaAssets.map((row) => upsertSql("media_assets", row)),
    upsertSql("site_branding", rows.siteBranding),
    upsertSql("homepage_hero_content", rows.homepageHeroContent),
    upsertSql("homepage_slideshow_settings", rows.homepageSlideshowSettings),
    ...rows.homepageSlideshowPhotos.map((row) => upsertSql("homepage_slideshow_photos", row)),
    ...rows.shopKitSections.map((row) => upsertSql("shop_kit_section", row)),
    ...rows.shopKitPhotos.map((row) => upsertSql("shop_kit_photos", row)),
    ...rows.shopCarouselPhotos.map((row) => upsertSql("shop_carousel_photos", row)),
    upsertSql("shop_purchase_details", rows.shopPurchaseDetails),
    upsertSql("about_page_content", rows.aboutPageContent),
    ...rows.siteSponsorLogos.map((row) => upsertSql("site_sponsor_logos", row)),
    ...rows.siteSocialLinks.map((row) => upsertSql("site_social_links", row)),
    upsertSql("club_identity", rows.clubIdentity),
    upsertSql("contact_profile", rows.contactProfile),
    upsertSql("contact_page_content", rows.contactPageContent),
    ...rows.tryouts.map((row) => upsertSql("tryouts", row)),
    upsertSql("tryouts_page_content", rows.tryoutsPageContent),
  ];
  return `do $lions_prod$
declare
  v_owner uuid;
begin
  if not exists (
    select 1 from onzio.clubs
    where id = '${TARGET_TENANT_ID}'::uuid
      and slug = 'lions'
      and name = '${EXPECTED_CLUB_NAME}'
      and kind = '${EXPECTED_CLUB_KIND}'
      and tier = '${EXPECTED_CLUB_TIER}'
      and lifecycle = '${EXPECTED_CLUB_LIFECYCLE}'
      and public_access = '${EXPECTED_CLUB_PUBLIC_ACCESS}'
  ) then
    raise exception 'Lions production target tenant mismatch';
  end if;
  if (
    select count(*) from onzio.club_domains
    where club_id = '${TARGET_TENANT_ID}'::uuid
      and hostname = '${TARGET_HOSTNAME}'
      and environment = 'production'
      and active
      and is_primary
  ) <> 1 then
    raise exception 'Lions production target domain mismatch';
  end if;
  if exists (select 1 from onzio.club_subscriptions where club_id = '${TARGET_TENANT_ID}'::uuid) then
    raise exception 'Lions production import cannot run after billing projection';
  end if;
  select user_id into strict v_owner from onzio.club_members
    where club_id = '${TARGET_TENANT_ID}'::uuid and role = 'owner' and status = 'active';
  ${statements.join("\n  ")}
  if not exists (
    select 1 from onzio.audit_events
    where club_id = '${TARGET_TENANT_ID}'::uuid
      and operation = 'lions_production_import'
      and payload @> '{"plan_digest":"${planDigest}"}'::jsonb
  ) then
    insert into onzio.audit_events
      (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
    values
      ('${TARGET_TENANT_ID}'::uuid, v_owner, 'migration',
       'lions_production_import', 'club', '${TARGET_TENANT_ID}',
       '{"plan_digest":"${planDigest}","destination":"production","hostname":"${TARGET_HOSTNAME}","placeholder_players":${PLACEHOLDER_PLAYER_COUNT},"placeholder_staff":${PLACEHOLDER_STAFF.length}}'::jsonb);
  end if;
end
$lions_prod$;
select jsonb_build_object(
  'tenant_id', '${TARGET_TENANT_ID}',
  'hostname', '${TARGET_HOSTNAME}',
  'plan_digest', '${planDigest}',
  'lifecycle', (select lifecycle from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid),
  'public_access', (select public_access from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid),
  'tier', (select tier from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid),
  'accent_color', (select accent_color from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid),
  'club_domains', (select count(*) from onzio.club_domains where club_id = '${TARGET_TENANT_ID}'::uuid),
  'club_members', (select count(*) from onzio.club_members where club_id = '${TARGET_TENANT_ID}'::uuid),
  'club_subscriptions', (select count(*) from onzio.club_subscriptions where club_id = '${TARGET_TENANT_ID}'::uuid),
  'media_assets', (select count(*) from onzio.media_assets where club_id = '${TARGET_TENANT_ID}'::uuid),
  'players', (select count(*) from onzio.players where club_id = '${TARGET_TENANT_ID}'::uuid),
  'staff', (select count(*) from onzio.staff where club_id = '${TARGET_TENANT_ID}'::uuid),
  'seasons', (select count(*) from onzio.seasons where club_id = '${TARGET_TENANT_ID}'::uuid),
  'matches', (select count(*) from onzio.matches where club_id = '${TARGET_TENANT_ID}'::uuid),
  'tryouts', (select count(*) from onzio.tryouts where club_id = '${TARGET_TENANT_ID}'::uuid),
  'club_identity', (select count(*) from onzio.club_identity where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_documents', (select count(*) from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_template', (select template_id from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid and version = 1),
  'presentation_digest', (select configuration_digest from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid and version = 1),
  'published_document_id', (select published_document_id from onzio.presentation_state where club_id = '${TARGET_TENANT_ID}'::uuid),
  'import_audits', (select count(*) from onzio.audit_events where club_id = '${TARGET_TENANT_ID}'::uuid and operation = 'lions_production_import')
) as lions_production_result;
`;
}

async function objectExists(service: ServiceClient, bucket: string, path: string) {
  const folder = dirname(path);
  const file = basename(path);
  const { data, error } = await service.storage.from(bucket).list(folder, {
    search: file,
    limit: 100,
  });
  if (error) throw error;
  return data.some((item) => item.name === file);
}

async function downloadVerified(
  service: ServiceClient,
  bucket: string,
  path: string,
  expectedChecksum: string,
) {
  const { data, error } = await service.storage.from(bucket).download(path);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (sha256(bytes) !== expectedChecksum) {
    throw new Error(`Checksum mismatch for ${bucket}/${path}.`);
  }
  return bytes.length;
}

async function ensureObject(input: {
  service: ServiceClient;
  bucket: string;
  path: string;
  bytes: Buffer;
  mimeType: string;
  checksum: string;
  cacheControl: string;
}) {
  if (await objectExists(input.service, input.bucket, input.path)) {
    await downloadVerified(input.service, input.bucket, input.path, input.checksum);
    return "reused" as const;
  }
  const { error } = await input.service.storage.from(input.bucket).upload(
    input.path,
    input.bytes,
    {
      contentType: input.mimeType,
      cacheControl: input.cacheControl,
      upsert: false,
    },
  );
  if (error) throw error;
  await downloadVerified(input.service, input.bucket, input.path, input.checksum);
  return "uploaded" as const;
}

async function syncStorage(
  service: ServiceClient,
  sourceRoot: string,
  plan: LionsMediaImportPlan,
) {
  const { data: buckets, error: bucketError } = await service.storage.listBuckets();
  if (bucketError) throw bucketError;
  const staging = buckets.find((bucket) => bucket.id === "onzio-upload-staging");
  const published = buckets.find((bucket) => bucket.id === "onzio-media");
  if (!staging || staging.public || !published || !published.public) {
    throw new Error("Storage bucket privacy does not match the approved media boundary.");
  }
  const totals = {
    stagedUploaded: 0,
    stagedReused: 0,
    publishedUploaded: 0,
    publishedReused: 0,
    stagingRemoved: 0,
    verifiedBytes: 0,
  };
  for (const asset of plan.assets) {
    const relativePath =
      ASSET_FILES[asset.sourcePath.slice(LIONS_SOURCE_PREFIX.length + 1) as LionsKnownAssetName];
    if (!relativePath) throw new Error(`No local source mapping for ${asset.sourcePath}.`);
    const sourceBytes = await readFile(resolve(sourceRoot, relativePath));
    if (sha256(sourceBytes) !== asset.sourceChecksumSha256) {
      throw new Error(`Source checksum mismatch for ${relativePath}.`);
    }
    const normalized = asset.mediaKind === "photograph"
      ? await normalizePhoto(sourceBytes)
      : await normalizeGraphic(sourceBytes);
    if (
      normalized.checksumSha256 !== asset.normalizedChecksumSha256 ||
      normalized.bytes.length !== asset.normalizedByteSize ||
      normalized.mimeType !== asset.normalizedMimeType
    ) {
      throw new Error(`Normalized artifact mismatch for ${relativePath}.`);
    }
    const targetPath = asset.destinationPath.replace(
      LIONS_LOCAL_TENANT_ID,
      TARGET_TENANT_ID,
    );
    const staged = await ensureObject({
      service,
      bucket: "onzio-upload-staging",
      path: targetPath,
      bytes: normalized.bytes,
      mimeType: normalized.mimeType,
      checksum: normalized.checksumSha256,
      cacheControl: "3600",
    });
    totals[staged === "uploaded" ? "stagedUploaded" : "stagedReused"] += 1;
    await downloadVerified(
      service,
      "onzio-upload-staging",
      targetPath,
      normalized.checksumSha256,
    );
    const final = await ensureObject({
      service,
      bucket: "onzio-media",
      path: targetPath,
      bytes: normalized.bytes,
      mimeType: normalized.mimeType,
      checksum: normalized.checksumSha256,
      cacheControl: "31536000",
    });
    totals[final === "uploaded" ? "publishedUploaded" : "publishedReused"] += 1;
    totals.verifiedBytes += await downloadVerified(
      service,
      "onzio-media",
      targetPath,
      normalized.checksumSha256,
    );
    const removal = await service.storage.from("onzio-upload-staging").remove([targetPath]);
    if (removal.error) throw removal.error;
    if (await objectExists(service, "onzio-upload-staging", targetPath)) {
      throw new Error(`Staging cleanup failed for ${targetPath}.`);
    }
    totals.stagingRemoved += 1;
  }
  return totals;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["confirm-production"] !== true) {
    throw new Error("Lions production execution requires --confirm-production.");
  }
  if ((args["prepare-sql"] === true) === (args["sync-storage"] === true)) {
    throw new Error("Choose exactly one of --prepare-sql or --sync-storage.");
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret?.startsWith("sb_secret_")) {
    throw new Error("The active production sb_secret key is required in process memory.");
  }
  const sourceRoot = typeof args["source-root"] === "string"
    ? resolve(args["source-root"])
    : DEFAULT_SOURCE_ROOT;
  const planPath = typeof args.plan === "string" ? resolve(args.plan) : DEFAULT_PLAN_PATH;
  const plan = await verifiedPlan(planPath, sourceRoot);
  const service = createClient(PROJECT_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });

  // No --owner-user-id here, unlike the staging script: the production club
  // already has exactly one active owner, asserted below and resolved inside
  // the transaction via `into strict v_owner`.
  await assertHostedTarget(service);

  if (args["prepare-sql"] === true) {
    const rows = productionRows(buildLionsLocalImportRows(plan));
    const sql = buildSql(rows, plan.planDigest);
    const sqlOut = typeof args["sql-out"] === "string"
      ? resolve(args["sql-out"])
      : resolve("/private/tmp/lions-production-import.sql");
    await writeFile(sqlOut, sql, { mode: 0o600 });
    console.log(JSON.stringify({
      action: "prepare-sql",
      sqlOut,
      // Print so the reviewer can confirm the file they are about to apply is
      // byte-identical to the one this run generated.
      sqlSha256: sha256(sql),
      tenantId: TARGET_TENANT_ID,
      hostname: TARGET_HOSTNAME,
      planDigest: plan.planDigest,
      placeholderPlayers: rows.players.length,
      placeholderStaff: rows.staff.length,
      mediaAssets: rows.mediaAssets.length,
      hostedMutations: 0,
    }));
    return;
  }

  const storage = await syncStorage(service, sourceRoot, plan);
  console.log(JSON.stringify({
    action: "sync-storage",
    tenantId: TARGET_TENANT_ID,
    planDigest: plan.planDigest,
    storage,
    sourceCount: plan.assets.length,
    normalizedChecksumCount: new Set(
      plan.assets.map((asset) => asset.normalizedChecksumSha256),
    ).size,
    bunnyMutations: 0,
  }));
}

// Deliberate divergence from scripts/import-lions-media-staging.ts, which
// calls main() unconditionally at import time. This SQL lands on a live
// customer tenant, so it needs a contract test
// (tests/contracts/lions-production-import.test.ts) that can import
// productionRows/buildSql and assert what the generated SQL does and does not
// contain. Importing a module whose top level runs main() would fire a real
// hosted pre-flight during the test run, so the entrypoint is gated on this
// file actually being the process entry.
const isDirectInvocation =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith("import-lions-production.ts");

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { productionRows, buildSql, placeholderPlayers, placeholderStaff, parseArgs };
