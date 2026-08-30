// Lions FC hosted-staging content + media import.
//
// Structural twin of scripts/import-diverse-city-staging.ts (DCFC-503), with
// one deliberate difference: DCFC-503's target tenant was already provisioned
// on hosted staging before that script ran, so its pre-flight assertion
// confirms an exact existing identity match. Lions has never been created on
// real hosted staging at all -- no `clubs` row, no `club_domains` row,
// nothing -- so this script's pre-flight assertion is the INVERSE: it
// refuses to run if a club with the target id, a club with slug "lions", or
// a club_domains row for the target hostname already exists. That is a
// from-scratch creation, not an idempotent content sync, so the generated
// SQL can only be applied successfully once against a given project; a
// second run against the same (now-populated) project is expected to fail
// the assertion by design.
//
// Same two-mode split as DCFC-503:
//   --prepare-sql   generates a single reviewable `do $$ ... $$` SQL file.
//                    Never executed by this script. A human applies it.
//   --sync-storage  performs real, idempotent, checksum-verified Storage
//                    writes only (no clubs/onzio content rows).
//
// presentation_documents.created_by, presentation_state.updated_by, and
// presentation_publications.created_by all have a `not null references
// auth.users(id)` constraint. Local Lions content satisfies that with a
// seed-only actor id (supabase/seed.sql) that does not exist on any hosted
// project. Because the Lions staging club does not exist yet, there is no
// pre-existing club_members owner to source a real user id from either (the
// DCFC-503 pattern of `select ... from onzio.club_members where role =
// 'owner'` has nothing to select from here). This script therefore requires
// an explicit `--owner-user-id <uuid>` for --prepare-sql: a Supabase Auth
// user that must already exist on the target project (created through the
// platform's normal auth flow, never by this script -- AGENTS.md reserves
// account/session creation for that flow). The generated SQL verifies that
// id resolves in `auth.users` before using it, and also creates the
// club_members owner row for it so the new club is never ownerless.
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

// Verified against HANDOFF.md: `fxefqnoqxbezeccjvrsw` is "Onzio Platform
// Staging" (see e.g. the entries recording its region and the isolated
// staging project confirmation), the same shared staging Supabase project
// DCFC-503 targeted. Lions lands in the same project -- there is one
// staging project for the whole platform, not one per tenant.
const PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

// A freshly generated UUID, distinct from LIONS_LOCAL_TENANT_ID
// (9d292f0a-6f93-54b1-b21c-ce2d0af3afa7) and from any deterministicUuid(...)
// value seeded with a ":local:" string. Grepped for collisions across the
// repository before hardcoding.
const TARGET_TENANT_ID = "8d82bb47-c10b-4823-8ec7-c4de87d34b0a";
const TARGET_HOSTNAME = "lions-onzio-staging.vercel.app";

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

const CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  clubs: ["id"],
  club_domains: ["id"],
  club_members: ["club_id", "user_id"],
  seasons: ["id"],
  matches: ["id"],
  players: ["id"],
  player_season_stats: ["club_id", "player_id", "season_id"],
  goalkeeper_season_stats: ["club_id", "player_id", "season_id"],
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
// than a client-supplied literal, mirroring DCFC-503's v_owner substitution.
const OWNER_SUBSTITUTED_COLUMNS = new Set([
  "presentation_documents.created_by",
  "presentation_state.updated_by",
  "presentation_publications.created_by",
  "club_members.user_id",
]);

type SourceRow = Record<string, unknown>;
type ServiceClient = SupabaseClient<any, any, any, any, any>;

type LionsStagingRows = Omit<
  LionsLocalImportRows,
  "subscription" | "auditEvent"
> & {
  clubMembers: SourceRow;
};

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}.`);
    const key = arg.slice(2);
    if (["confirm-staging", "prepare-sql", "sync-storage"].includes(key)) {
      result[key] = true;
      continue;
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

function stagingRows(
  rows: LionsLocalImportRows,
  ownerUserId: string,
): LionsStagingRows {
  const translated = translateValue({
    club: rows.club,
    seasons: rows.seasons,
    matches: rows.matches,
    players: rows.players,
    playerSeasonStats: rows.playerSeasonStats,
    goalkeeperSeasonStats: rows.goalkeeperSeasonStats,
    staff: rows.staff,
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
  }) as Omit<LionsLocalImportRows, "domain" | "subscription" | "auditEvent">;

  // Local content hardcodes lifecycle "active" / public_access "live",
  // correct for a fully-billed local dev tenant. Real staging has no Stripe
  // subscription (club_subscriptions is deliberately not created below, the
  // same way DCFC-503 asserts none exists) -- AGENTS.md: "Private preview
  // before active billing; trialing is unsupported." lifecycle "onboarding"
  // resolves to public_access "preview" via
  // onzio_private.subscription_public_access, and middleware only blocks
  // `runtimeAccess === "suspended"`, so "preview" still renders normally for
  // Christian's staging visit. tier stays "pro" and store_enabled stays
  // true (unlike DCFC-503's "starter" target) because the whole point of
  // this preview is showing the finished pro-tier editorial@1 experience,
  // store included.
  const club = {
    ...(translated.club as SourceRow),
    lifecycle: "onboarding",
    public_access: "preview",
  };

  const domain: SourceRow = {
    id: deterministicUuid(`onzio:lions:staging-domain:${TARGET_HOSTNAME}`),
    club_id: TARGET_TENANT_ID,
    hostname: TARGET_HOSTNAME,
    is_primary: true,
    verified_at: FROZEN_NOW,
    environment: "staging",
    active: true,
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
  };

  const clubMembers: SourceRow = {
    club_id: TARGET_TENANT_ID,
    user_id: ownerUserId,
    role: "owner",
    status: "active",
    created_at: FROZEN_NOW,
    updated_at: FROZEN_NOW,
  };

  return { ...translated, club, domain, clubMembers } as unknown as LionsStagingRows;
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

// --prepare-sql runs BEFORE the club exists: refuse if id/slug/hostname are
// already taken. --sync-storage runs AFTER the prepare-sql-generated SQL has
// been applied by hand: refuse unless the exact expected club/domain already
// exists, so storage uploads can never land against the wrong project or a
// club that was never actually created. Same function name, opposite
// direction, on purpose -- this is the one guard standing between a media
// sync and a mistargeted hosted project.
async function assertHostedTarget(
  service: ServiceClient,
  mode: "create" | "sync",
  ownerUserId: string | undefined,
) {
  if (mode === "create") {
    const { data: idConflict, error: idError } = await service
      .schema("onzio")
      .from("clubs")
      .select("id")
      .eq("id", TARGET_TENANT_ID)
      .maybeSingle();
    if (idError) throw idError;
    if (idConflict) {
      throw new Error(
        `A club with id ${TARGET_TENANT_ID} already exists on this project; refusing to run the from-scratch Lions staging import.`,
      );
    }

    const { data: slugConflict, error: slugError } = await service
      .schema("onzio")
      .from("clubs")
      .select("id")
      .eq("slug", "lions")
      .maybeSingle();
    if (slugError) throw slugError;
    if (slugConflict) {
      throw new Error(
        `A club with slug "lions" already exists (id ${slugConflict.id}); refusing to run the from-scratch Lions staging import.`,
      );
    }

    const { count: domainCount, error: domainError } = await service
      .schema("onzio")
      .from("club_domains")
      .select("id", { count: "exact", head: true })
      .eq("hostname", TARGET_HOSTNAME);
    if (domainError) throw domainError;
    if (domainCount !== 0) {
      throw new Error(
        `A club_domains row already exists for hostname ${TARGET_HOSTNAME}; refusing to run the from-scratch Lions staging import.`,
      );
    }

    if (ownerUserId) {
      const { data: owner, error: ownerError } = await service.auth.admin.getUserById(ownerUserId);
      if (ownerError || !owner?.user) {
        throw new Error(
          `--owner-user-id ${ownerUserId} does not resolve to an existing Supabase Auth user on this project. This script never creates Auth users -- provision one through the platform's normal flow first.`,
        );
      }
    }
    return;
  }

  // mode === "sync": the inverse checks. Confirm the exact expected tenant,
  // by id AND slug together (not either alone), and the exact expected
  // domain row scoped to that same club_id -- so storage uploads only ever
  // proceed against precisely the club this script created, never a
  // same-slug club on some other project or a stale/reused id.
  const { data: club, error: clubError } = await service
    .schema("onzio")
    .from("clubs")
    .select("id, slug")
    .eq("id", TARGET_TENANT_ID)
    .maybeSingle();
  if (clubError) throw clubError;
  if (!club || club.slug !== "lions") {
    throw new Error(
      `Expected club ${TARGET_TENANT_ID} with slug "lions" to already exist before --sync-storage. Run --prepare-sql, apply the generated SQL, then retry.`,
    );
  }

  const { count: domainCount, error: domainError } = await service
    .schema("onzio")
    .from("club_domains")
    .select("id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("hostname", TARGET_HOSTNAME);
  if (domainError) throw domainError;
  if (domainCount !== 1) {
    throw new Error(
      `Expected exactly one club_domains row for ${TARGET_HOSTNAME} on club ${TARGET_TENANT_ID} before --sync-storage; found ${domainCount}.`,
    );
  }
}

function buildSql(rows: LionsStagingRows, ownerUserId: string, planDigest: string): string {
  const statements = [
    upsertSql("clubs", rows.club),
    upsertSql("club_domains", rows.domain),
    upsertSql("club_members", rows.clubMembers),
    ...rows.seasons.map((row) => upsertSql("seasons", row)),
    ...rows.matches.map((row) => upsertSql("matches", row)),
    ...rows.players.map((row) => upsertSql("players", row)),
    ...rows.playerSeasonStats.map((row) => upsertSql("player_season_stats", row)),
    ...rows.goalkeeperSeasonStats.map((row) => upsertSql("goalkeeper_season_stats", row)),
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
  return `do $lions_stg$
declare
  v_owner uuid;
begin
  if exists (select 1 from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid) then
    raise exception 'Lions staging target tenant id already exists.';
  end if;
  if exists (select 1 from onzio.clubs where slug = 'lions') then
    raise exception 'A club with slug lions already exists on this project.';
  end if;
  if exists (select 1 from onzio.club_domains where hostname = '${TARGET_HOSTNAME}') then
    raise exception 'The Lions staging hostname is already attached to a club.';
  end if;
  select id into strict v_owner from auth.users where id = '${ownerUserId}'::uuid;
  ${statements.join("\n  ")}
  if not exists (
    select 1 from onzio.audit_events
    where club_id = '${TARGET_TENANT_ID}'::uuid
      and operation = 'lions_staging_import'
      and payload @> '{"plan_digest":"${planDigest}"}'::jsonb
  ) then
    insert into onzio.audit_events
      (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
    values
      ('${TARGET_TENANT_ID}'::uuid, v_owner, 'migration',
       'lions_staging_import', 'club', '${TARGET_TENANT_ID}',
       '{"plan_digest":"${planDigest}","destination":"staging","hostname":"${TARGET_HOSTNAME}"}'::jsonb);
  end if;
end
$lions_stg$;
select jsonb_build_object(
  'tenant_id', '${TARGET_TENANT_ID}',
  'hostname', '${TARGET_HOSTNAME}',
  'plan_digest', '${planDigest}',
  'clubs', (select count(*) from onzio.clubs where id = '${TARGET_TENANT_ID}'::uuid),
  'club_domains', (select count(*) from onzio.club_domains where club_id = '${TARGET_TENANT_ID}'::uuid),
  'club_members', (select count(*) from onzio.club_members where club_id = '${TARGET_TENANT_ID}'::uuid),
  'media_assets', (select count(*) from onzio.media_assets where club_id = '${TARGET_TENANT_ID}'::uuid),
  'players', (select count(*) from onzio.players where club_id = '${TARGET_TENANT_ID}'::uuid),
  'staff', (select count(*) from onzio.staff where club_id = '${TARGET_TENANT_ID}'::uuid),
  'matches', (select count(*) from onzio.matches where club_id = '${TARGET_TENANT_ID}'::uuid),
  'tryouts', (select count(*) from onzio.tryouts where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_documents', (select count(*) from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_digest', (select configuration_digest from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid and version = 1),
  'published_document_id', (select published_document_id from onzio.presentation_state where club_id = '${TARGET_TENANT_ID}'::uuid),
  'import_audits', (select count(*) from onzio.audit_events where club_id = '${TARGET_TENANT_ID}'::uuid and operation = 'lions_staging_import')
) as lions_staging_result;
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
  if (args["confirm-staging"] !== true) {
    throw new Error("Lions staging execution requires --confirm-staging.");
  }
  if ((args["prepare-sql"] === true) === (args["sync-storage"] === true)) {
    throw new Error("Choose exactly one of --prepare-sql or --sync-storage.");
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret?.startsWith("sb_secret_")) {
    throw new Error("The active staging sb_secret key is required in process memory.");
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

  const ownerUserId = typeof args["owner-user-id"] === "string" ? args["owner-user-id"] : undefined;
  if (args["prepare-sql"] === true && (!ownerUserId || !isUuid(ownerUserId))) {
    throw new Error(
      "--prepare-sql requires --owner-user-id <uuid>: a Supabase Auth user id that already exists on the target project and will own the new Lions staging club.",
    );
  }

  await assertHostedTarget(
    service,
    args["prepare-sql"] === true ? "create" : "sync",
    args["prepare-sql"] === true ? ownerUserId : undefined,
  );

  if (args["prepare-sql"] === true) {
    const rows = stagingRows(buildLionsLocalImportRows(plan), ownerUserId!);
    const sql = buildSql(rows, ownerUserId!, plan.planDigest);
    const sqlOut = typeof args["sql-out"] === "string"
      ? resolve(args["sql-out"])
      : resolve("/private/tmp/lions-staging-import.sql");
    await writeFile(sqlOut, sql, { mode: 0o600 });
    console.log(JSON.stringify({
      action: "prepare-sql",
      sqlOut,
      sqlSha256: sha256(sql),
      tenantId: TARGET_TENANT_ID,
      hostname: TARGET_HOSTNAME,
      ownerUserId,
      planDigest: plan.planDigest,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
