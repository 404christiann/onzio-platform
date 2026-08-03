import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildDiverseCityLocalImportRows,
  type DiverseCityLocalImportRows,
} from "@/lib/migration/diverse-city-local-import";
import {
  buildDiverseCityImportPlan,
  DIVERSE_CITY_LOCAL_TENANT_ID,
  DIVERSE_CITY_SOURCE_COMMIT,
  type DiverseCityImportPlan,
  type DiverseCityKnownAssetPath,
} from "@/lib/migration/diverse-city-plan";
import { normalizeGraphic, normalizePhoto } from "@/lib/media-processing";

const PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const TARGET_TENANT_ID = "d88bf71b-9820-49ae-9dc0-7556b0813885";
const TARGET_HOSTNAME = "diverse-city-onzio-staging.vercel.app";
const APPROVED_PLAN_DIGEST =
  "63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36";
const APPROVED_PLAN_FILE_SHA256 =
  "87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b";
const DEFAULT_SOURCE_ROOT =
  "/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site/public";
const DEFAULT_PLAN_PATH = resolve(
  "docs/phase-11/diverse-city/diverse-city-local-import-plan.json",
);

const ASSET_FILES: DiverseCityKnownAssetPath[] = [
  "media/about-team-lineup.webp",
  "media/crest.png",
  "media/hero.webp",
  "media/programs/mens-teams-detail.webp",
  "media/programs/mens-teams-hero.webp",
  "media/programs/special-kickers-hero.webp",
  "media/programs/special-olympics-hero.webp",
  "media/shop/back_jersey.png",
  "media/shop/front_jersey.png",
  "media/sponsors/elsas-bakery.webp",
];

const CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  presentation_documents: ["id"],
  presentation_state: ["club_id"],
  presentation_publications: ["id"],
  media_assets: ["id"],
  site_branding: ["club_id"],
  homepage_hero_content: ["club_id"],
  behind_the_rose_section: ["club_id"],
  about_page_content: ["club_id"],
  programs: ["id"],
  contact_profile: ["club_id"],
  contact_page_content: ["club_id"],
  shop_kit_section: ["id"],
  shop_kit_photos: ["id"],
  shop_carousel_photos: ["id"],
  shop_purchase_details: ["club_id"],
  site_sponsor_logos: ["id"],
  site_social_links: ["club_id", "id"],
};

const JSON_COLUMNS = new Set([
  "about_page_content.story_paragraphs",
  "about_page_content.values",
  "programs.highlights",
  "presentation_documents.configuration",
  "presentation_publications.validation_result",
  "shop_kit_section.bullet_points",
  "shop_purchase_details.cards",
]);

const INSERT_ONLY_TABLES = new Set([
  "presentation_documents",
  "presentation_publications",
]);

type SourceRow = Record<string, unknown>;
type ServiceClient = SupabaseClient<any, any, any, any, any>;

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
    if (
      ["presentation_documents.created_by", "presentation_state.updated_by",
        "presentation_publications.created_by"].includes(`${table}.${column}`)
    ) {
      return "v_owner";
    }
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
    return value.replaceAll(DIVERSE_CITY_LOCAL_TENANT_ID, TARGET_TENANT_ID);
  }
  if (Array.isArray(value)) return value.map(translateValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as SourceRow).map(([key, item]) => [key, translateValue(item)]),
    );
  }
  return value;
}

function stagingRows(rows: DiverseCityLocalImportRows) {
  return translateValue({
    presentationDocument: rows.presentationDocument,
    presentationState: rows.presentationState,
    presentationPublication: rows.presentationPublication,
    mediaAssets: rows.mediaAssets,
    siteBranding: rows.siteBranding,
    homepageHeroContent: rows.homepageHeroContent,
    behindTheRoseSection: rows.behindTheRoseSection,
    aboutPageContent: rows.aboutPageContent,
    programs: rows.programs,
    contactProfile: rows.contactProfile,
    contactPageContent: rows.contactPageContent,
    shopKitSections: rows.shopKitSections,
    shopKitPhotos: rows.shopKitPhotos,
    shopCarouselPhotos: rows.shopCarouselPhotos,
    shopPurchaseDetails: rows.shopPurchaseDetails,
    siteSponsorLogos: rows.siteSponsorLogos,
    siteSocialLinks: rows.siteSocialLinks,
  }) as Omit<DiverseCityLocalImportRows, "club" | "domain" | "subscription" |
    "localMember" | "seasons" | "players" | "staff" | "matches" |
    "leagueStandings" | "tryouts" | "auditEvent">;
}

async function readAssets(sourceRoot: string) {
  return Promise.all(ASSET_FILES.map(async (path) => ({
    path,
    bytes: await readFile(resolve(sourceRoot, path)),
  })));
}

async function verifiedPlan(planPath: string, sourceRoot: string) {
  const manifestBytes = await readFile(planPath);
  if (sha256(manifestBytes) !== APPROVED_PLAN_FILE_SHA256) {
    throw new Error("Checked-in plan file SHA-256 does not match the approved byte digest.");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as DiverseCityImportPlan;
  const fresh = await buildDiverseCityImportPlan({
    sourceCommit: DIVERSE_CITY_SOURCE_COMMIT,
    destinationEnvironment: "local",
    destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
    confirmedDestinationEnvironment: "local",
    dryRun: true,
    generatedAt: "2026-08-01T00:00:00.000Z",
    assets: await readAssets(sourceRoot),
  });
  if (
    manifest.planDigest !== APPROVED_PLAN_DIGEST ||
    fresh.planDigest !== APPROVED_PLAN_DIGEST ||
    JSON.stringify(fresh) !== JSON.stringify(manifest)
  ) {
    throw new Error("Diverse City manifest does not match the approved immutable plan.");
  }
  return manifest;
}

async function assertHostedTarget(service: ServiceClient) {
  const { data: club, error: clubError } = await service
    .schema("onzio")
    .from("clubs")
    .select("id,slug,name,tier,lifecycle,public_access")
    .eq("id", TARGET_TENANT_ID)
    .single();
  if (clubError) throw clubError;
  if (
    club.slug !== "diverse-city" || club.name !== "Diverse City FC" ||
    club.tier !== "starter" || club.lifecycle !== "onboarding" ||
    club.public_access !== "preview"
  ) {
    throw new Error("The hosted tenant no longer matches the approved DCFC-503 target.");
  }
  const { count: domainCount, error: domainError } = await service
    .schema("onzio")
    .from("club_domains")
    .select("id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("hostname", TARGET_HOSTNAME)
    .eq("environment", "staging")
    .eq("active", true)
    .eq("is_primary", true);
  if (domainError) throw domainError;
  if (domainCount !== 1) throw new Error("The approved staging domain is not exact.");
  const { count: ownerCount, error: ownerError } = await service
    .schema("onzio")
    .from("club_members")
    .select("user_id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownerError) throw ownerError;
  if (ownerCount !== 1) throw new Error("The staging tenant must have exactly one active owner.");
}

function buildSql(rows: ReturnType<typeof stagingRows>) {
  const statements = [
    upsertSql("presentation_documents", rows.presentationDocument),
    upsertSql("presentation_state", rows.presentationState),
    upsertSql("presentation_publications", rows.presentationPublication),
    ...rows.mediaAssets.map((row) => upsertSql("media_assets", row)),
    upsertSql("site_branding", rows.siteBranding),
    upsertSql("homepage_hero_content", rows.homepageHeroContent),
    upsertSql("behind_the_rose_section", rows.behindTheRoseSection),
    upsertSql("about_page_content", rows.aboutPageContent),
    ...rows.programs.map((row) => upsertSql("programs", row)),
    upsertSql("contact_profile", rows.contactProfile),
    upsertSql("contact_page_content", rows.contactPageContent),
    ...rows.shopKitSections.map((row) => upsertSql("shop_kit_section", row)),
    ...rows.shopKitPhotos.map((row) => upsertSql("shop_kit_photos", row)),
    ...rows.shopCarouselPhotos.map((row) => upsertSql("shop_carousel_photos", row)),
    upsertSql("shop_purchase_details", rows.shopPurchaseDetails),
    ...rows.siteSponsorLogos.map((row) => upsertSql("site_sponsor_logos", row)),
    ...rows.siteSocialLinks.map((row) => upsertSql("site_social_links", row)),
  ];
  return `do $dcfc503$
declare
  v_owner uuid;
begin
  if not exists (
    select 1 from onzio.clubs
    where id = '${TARGET_TENANT_ID}'::uuid and slug = 'diverse-city'
      and name = 'Diverse City FC' and tier = 'starter'
      and lifecycle = 'onboarding' and public_access = 'preview'
  ) then raise exception 'DCFC-503 target tenant mismatch'; end if;
  if (select count(*) from onzio.club_domains
      where club_id = '${TARGET_TENANT_ID}'::uuid and hostname = '${TARGET_HOSTNAME}'
        and environment = 'staging' and active and is_primary) <> 1
  then raise exception 'DCFC-503 target domain mismatch'; end if;
  if exists (select 1 from onzio.club_subscriptions where club_id = '${TARGET_TENANT_ID}'::uuid)
  then raise exception 'DCFC-503 cannot run after billing projection'; end if;
  select user_id into strict v_owner from onzio.club_members
    where club_id = '${TARGET_TENANT_ID}'::uuid and role = 'owner' and status = 'active';
  ${statements.join("\n  ")}
  if not exists (
    select 1 from onzio.audit_events
    where club_id = '${TARGET_TENANT_ID}'::uuid
      and operation = 'diverse_city_staging_import'
      and payload @> '{"plan_digest":"${APPROVED_PLAN_DIGEST}"}'::jsonb
  ) then
    insert into onzio.audit_events
      (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
    values
      ('${TARGET_TENANT_ID}'::uuid, v_owner, 'migration',
       'diverse_city_staging_import', 'club', '${TARGET_TENANT_ID}',
       '{"plan_digest":"${APPROVED_PLAN_DIGEST}","retained_assets":10,"destination":"staging"}'::jsonb);
  end if;
end
$dcfc503$;
select jsonb_build_object(
  'tenant_id', '${TARGET_TENANT_ID}',
  'plan_digest', '${APPROVED_PLAN_DIGEST}',
  'media_assets', (select count(*) from onzio.media_assets where club_id = '${TARGET_TENANT_ID}'::uuid),
  'programs', (select count(*) from onzio.programs where club_id = '${TARGET_TENANT_ID}'::uuid),
  'tryouts', (select count(*) from onzio.tryouts where club_id = '${TARGET_TENANT_ID}'::uuid),
  'players', (select count(*) from onzio.players where club_id = '${TARGET_TENANT_ID}'::uuid),
  'staff', (select count(*) from onzio.staff where club_id = '${TARGET_TENANT_ID}'::uuid),
  'matches', (select count(*) from onzio.matches where club_id = '${TARGET_TENANT_ID}'::uuid),
  'standings', (select count(*) from onzio.league_standings where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_documents', (select count(*) from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid),
  'presentation_digest', (select configuration_digest from onzio.presentation_documents where club_id = '${TARGET_TENANT_ID}'::uuid and version = 1),
  'published_document_id', (select published_document_id from onzio.presentation_state where club_id = '${TARGET_TENANT_ID}'::uuid),
  'import_audits', (select count(*) from onzio.audit_events where club_id = '${TARGET_TENANT_ID}'::uuid and operation = 'diverse_city_staging_import')
) as dcfc_503_result;
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
  plan: DiverseCityImportPlan,
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
    const sourceBytes = await readFile(resolve(sourceRoot, asset.sourcePath));
    if (sha256(sourceBytes) !== asset.sourceChecksumSha256) {
      throw new Error(`Source checksum mismatch for ${asset.sourcePath}.`);
    }
    const normalized = asset.mediaKind === "photograph"
      ? await normalizePhoto(sourceBytes)
      : await normalizeGraphic(sourceBytes);
    if (
      normalized.checksumSha256 !== asset.normalizedChecksumSha256 ||
      normalized.bytes.length !== asset.normalizedByteSize ||
      normalized.mimeType !== asset.normalizedMimeType
    ) {
      throw new Error(`Normalized artifact mismatch for ${asset.sourcePath}.`);
    }
    const targetPath = asset.destinationPath.replace(
      DIVERSE_CITY_LOCAL_TENANT_ID,
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
    throw new Error("DCFC-503 staging execution requires --confirm-staging.");
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
  });
  await assertHostedTarget(service);
  if (args["prepare-sql"] === true) {
    const sqlOut = typeof args["sql-out"] === "string"
      ? resolve(args["sql-out"])
      : resolve("/private/tmp/dcfc-503-import.sql");
    const sql = buildSql(stagingRows(buildDiverseCityLocalImportRows(plan)));
    await writeFile(sqlOut, sql, { mode: 0o600 });
    console.log(JSON.stringify({
      action: "prepare-sql",
      sqlOut,
      sqlSha256: sha256(sql),
      tenantId: TARGET_TENANT_ID,
      planDigest: APPROVED_PLAN_DIGEST,
      hostedMutations: 0,
    }));
    return;
  }
  const storage = await syncStorage(service, sourceRoot, plan);
  console.log(JSON.stringify({
    action: "sync-storage",
    tenantId: TARGET_TENANT_ID,
    planDigest: APPROVED_PLAN_DIGEST,
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
