import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import WebSocket from "ws";
import {
  buildLionsLocalImportRows,
  LIONS_LOCAL_TENANT_ID,
  reconcileLionsLocalImportPlan,
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
import {
  normalizeGraphic,
  normalizePhoto,
  type NormalizedMedia,
} from "@/lib/media-processing";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const DEFAULT_PLAN_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/phase-9/lions-media-import-plan.json",
);
const DEFAULT_SOURCE_ROOT = "/Users/christianalcala/Downloads/lionsFCAssets";
const REQUIRED_FLAGS = new Set(["--execute-local", "--confirm-local"]);

type LocalServiceClient = SupabaseClient<any, any, any, any, any>;

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

const CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  clubs: ["id"],
  club_domains: ["id"],
  club_subscriptions: ["club_id"],
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
};

const JSON_COLUMNS = new Set([
  "about_page_content.story_paragraphs",
  "about_page_content.values",
  "presentation_documents.configuration",
  "presentation_publications.validation_result",
  "shop_kit_section.bullet_points",
  "shop_purchase_details.cards",
]);

const INSERT_ONLY_TABLES = new Set([
  "presentation_documents",
  "presentation_publications",
]);

function usage(): string {
  return [
    "Usage:",
    "  npm run migration:import:lions-media:local -- --execute-local --confirm-local",
    "",
    "Optional:",
    "  --source-root /Users/christianalcala/Downloads/lionsFCAssets",
    "  --plan docs/phase-9/lions-media-import-plan.json",
    "",
    "The importer accepts only loopback Supabase environment values and performs no hosted mutations.",
  ].join("\n");
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`);
    if (REQUIRED_FLAGS.has(arg)) {
      result[arg.slice(2)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    result[arg.slice(2)] = value;
    index += 1;
  }
  return result;
}

function assertLoopbackUrl(raw: string | undefined, name: string): string {
  if (!raw) throw new Error(`${name} is required.`);
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must use a loopback host.`);
  }
  return raw.replace(/\/$/, "");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier ${value}.`);
  }
  return `"${value}"`;
}

async function upsertRow(
  client: PostgresClient,
  table: string,
  row: Record<string, unknown>,
) {
  const conflicts = CONFLICT_COLUMNS[table];
  if (!conflicts) throw new Error(`Unexpected destination table ${table}.`);
  const columns = Object.keys(row).sort();
  const values = columns.map((column) => {
    const value = row[column];
    return JSON_COLUMNS.has(`${table}.${column}`) && value !== null
      ? JSON.stringify(value)
      : value;
  });
  const placeholders = columns.map((column, index) =>
    JSON_COLUMNS.has(`${table}.${column}`)
      ? `$${index + 1}::jsonb`
      : `$${index + 1}`,
  );
  const updates = columns.filter((column) => !conflicts.includes(column));
  const conflictSql = conflicts.map(quoteIdentifier).join(", ");
  const updateSql =
    updates.length === 0 || INSERT_ONLY_TABLES.has(table)
      ? "do nothing"
      : `do update set ${updates
          .map(
            (column) =>
              `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`,
          )
          .join(", ")}`;
  await client.query(
    `insert into onzio.${quoteIdentifier(table)} (${columns
      .map(quoteIdentifier)
      .join(", ")}) values (${placeholders.join(", ")}) ` +
      `on conflict (${conflictSql}) ${updateSql}`,
    values,
  );
}

async function readAssets(sourceRoot: string): Promise<LionsSourceAssetInput[]> {
  return Promise.all(
    Object.entries(ASSET_FILES).map(async ([name, relativePath]) => ({
      name: name as LionsKnownAssetName,
      bytes: await readFile(resolve(sourceRoot, relativePath)),
    })),
  );
}

async function loadManifest(path: string): Promise<LionsMediaImportPlan> {
  return JSON.parse(await readFile(path, "utf8")) as LionsMediaImportPlan;
}

async function buildFreshPlan(sourceRoot: string): Promise<LionsMediaImportPlan> {
  return buildLionsMediaImportPlan({
    sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
    sourceBucket: LIONS_SOURCE_BUCKET,
    sourcePrefix: LIONS_SOURCE_PREFIX,
    destinationEnvironment: "staging",
    destinationTenantId: LIONS_LOCAL_TENANT_ID,
    dryRun: true,
    confirmedDestinationEnvironment: "staging",
    generatedAt: "2026-07-29T00:00:00.000Z",
    assets: await readAssets(sourceRoot),
  });
}

async function normalizedBytesFor(
  assetName: LionsKnownAssetName,
  bytes: Buffer,
): Promise<NormalizedMedia> {
  return assetName.endsWith(".jpg")
    ? normalizePhoto(bytes)
    : normalizeGraphic(bytes);
}

async function ensureStorageObjects(input: {
  service: LocalServiceClient;
  sourceRoot: string;
  plan: LionsMediaImportPlan;
}): Promise<{ uploaded: number; reused: number }> {
  let uploaded = 0;
  let reused = 0;
  for (const [name, relativePath] of Object.entries(ASSET_FILES) as Array<
    [LionsKnownAssetName, string]
  >) {
    const asset = input.plan.assets.find((item) =>
      item.sourcePath.endsWith(`/${name}`),
    );
    if (!asset) throw new Error(`Plan missing asset ${name}.`);
    const sourceBytes = await readFile(resolve(input.sourceRoot, relativePath));
    if (sha256(sourceBytes) !== asset.sourceChecksumSha256) {
      throw new Error(`Source checksum mismatch for ${relativePath}.`);
    }
    const normalized = await normalizedBytesFor(name, sourceBytes);
    if (
      normalized.checksumSha256 !== asset.normalizedChecksumSha256 ||
      normalized.bytes.length !== asset.normalizedByteSize
    ) {
      throw new Error(`Normalized checksum mismatch for ${relativePath}.`);
    }

    const existing = await input.service.storage
      .from("onzio-media")
      .download(asset.destinationPath);
    if (!existing.error && existing.data) {
      const existingBytes = Buffer.from(await existing.data.arrayBuffer());
      if (sha256(existingBytes) !== asset.normalizedChecksumSha256) {
        throw new Error(`Existing local object checksum mismatch: ${asset.destinationPath}`);
      }
      reused += 1;
      continue;
    }
    const { error } = await input.service.storage
      .from("onzio-media")
      .upload(asset.destinationPath, normalized.bytes, {
        contentType: normalized.mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (error) throw error;
    uploaded += 1;
  }
  return { uploaded, reused };
}

async function applyRows(
  client: PostgresClient,
  rows: LionsLocalImportRows,
  plan: LionsMediaImportPlan,
) {
  await client.query("begin");
  try {
    await upsertRow(client, "clubs", rows.club);
    await upsertRow(client, "club_domains", rows.domain);
    await upsertRow(client, "club_subscriptions", rows.subscription);
    for (const row of rows.seasons) await upsertRow(client, "seasons", row);
    for (const row of rows.matches) await upsertRow(client, "matches", row);
    for (const row of rows.players) await upsertRow(client, "players", row);
    for (const row of rows.playerSeasonStats) {
      await upsertRow(client, "player_season_stats", row);
    }
    for (const row of rows.goalkeeperSeasonStats) {
      await upsertRow(client, "goalkeeper_season_stats", row);
    }
    for (const row of rows.staff) await upsertRow(client, "staff", row);
    await upsertRow(client, "presentation_documents", rows.presentationDocument);
    await upsertRow(client, "presentation_state", rows.presentationState);
    await upsertRow(client, "presentation_publications", rows.presentationPublication);
    for (const row of rows.mediaAssets) await upsertRow(client, "media_assets", row);
    await upsertRow(client, "site_branding", rows.siteBranding);
    await upsertRow(client, "homepage_hero_content", rows.homepageHeroContent);
    await upsertRow(
      client,
      "homepage_slideshow_settings",
      rows.homepageSlideshowSettings,
    );
    for (const row of rows.homepageSlideshowPhotos) {
      await upsertRow(client, "homepage_slideshow_photos", row);
    }
    for (const row of rows.shopKitSections) {
      await upsertRow(client, "shop_kit_section", row);
    }
    for (const row of rows.shopKitPhotos) await upsertRow(client, "shop_kit_photos", row);
    for (const row of rows.shopCarouselPhotos) {
      await upsertRow(client, "shop_carousel_photos", row);
    }
    await upsertRow(client, "shop_purchase_details", rows.shopPurchaseDetails);
    await upsertRow(client, "about_page_content", rows.aboutPageContent);
    for (const row of rows.siteSponsorLogos) {
      await upsertRow(client, "site_sponsor_logos", row);
    }
    for (const row of rows.siteSocialLinks) {
      await upsertRow(client, "site_social_links", row);
    }

    const auditExists = await client.query(
      `select 1 from onzio.audit_events
       where club_id = $1 and operation = 'lions_media_local_import'
         and payload @> $2::jsonb
       limit 1`,
      [plan.destination.tenantId, JSON.stringify({ plan_digest: plan.planDigest })],
    );
    if (auditExists.rowCount === 0) {
      await client.query(
        `insert into onzio.audit_events
          (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
         values ($1::uuid, null, 'migration', 'lions_media_local_import', 'club', $1::text, $2::jsonb)`,
        [plan.destination.tenantId, JSON.stringify(rows.auditEvent.payload)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function reconcileDatabase(
  client: PostgresClient,
  plan: LionsMediaImportPlan,
) {
  const checks: Record<string, number> = {};
  for (const [label, table] of [
    ["mediaAssets", "media_assets"],
    ["homepageHeroContent", "homepage_hero_content"],
    ["homepageSlideshowPhotos", "homepage_slideshow_photos"],
    ["shopKitPhotos", "shop_kit_photos"],
    ["shopCarouselPhotos", "shop_carousel_photos"],
    ["matches", "matches"],
    ["players", "players"],
    ["playerSeasonStats", "player_season_stats"],
    ["goalkeeperSeasonStats", "goalkeeper_season_stats"],
    ["staff", "staff"],
    ["presentationDocuments", "presentation_documents"],
    ["presentationState", "presentation_state"],
    ["presentationPublications", "presentation_publications"],
    ["siteSponsorLogos", "site_sponsor_logos"],
  ] as const) {
    const result = await client.query(
      `select count(*)::integer as count
       from onzio.${quoteIdentifier(table)}
       where club_id = $1`,
      [plan.destination.tenantId],
    );
    checks[label] = Number(result.rows[0].count);
  }
  const forbidden = await client.query(
    `select count(*)::integer as count
     from (
       select club_logo_path as value from onzio.site_branding where club_id = $1
       union all
       select inverse_logo_path as value from onzio.site_branding where club_id = $1
       union all
       select url from onzio.homepage_slideshow_photos where club_id = $1
       union all
       select url from onzio.shop_kit_photos where club_id = $1
       union all
       select url from onzio.shop_carousel_photos where club_id = $1
       union all
       select feature_image_url from onzio.about_page_content where club_id = $1
     ) links
     where value like '%ydvggllbrswfchgjhjhr%'
        or value like '%/storage/v1/render/image/%'
        or value like '%/_next/image%'`,
    [plan.destination.tenantId],
  );
  checks.forbiddenUrlReferences = Number(forbidden.rows[0].count);
  if (
    checks.mediaAssets !== 10 ||
    checks.homepageHeroContent !== 1 ||
    checks.homepageSlideshowPhotos !== 5 ||
    checks.shopKitPhotos !== 3 ||
    checks.shopCarouselPhotos !== 3 ||
    checks.matches !== 4 ||
    checks.players !== 32 ||
    checks.playerSeasonStats !== 28 ||
    checks.goalkeeperSeasonStats !== 4 ||
    checks.staff !== 6 ||
    checks.presentationDocuments !== 1 ||
    checks.presentationState !== 1 ||
    checks.presentationPublications !== 1 ||
    checks.siteSponsorLogos !== 6 ||
    checks.forbiddenUrlReferences !== 0
  ) {
    throw new Error(`Lions database reconciliation failed: ${JSON.stringify(checks)}`);
  }
  return checks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["execute-local"] !== true || args["confirm-local"] !== true) {
    throw new Error("Local execution requires --execute-local and --confirm-local.");
  }
  const supabaseUrl = assertLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const dbUrl = assertLoopbackUrl(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }

  const sourceRoot =
    typeof args["source-root"] === "string"
      ? args["source-root"]
      : DEFAULT_SOURCE_ROOT;
  const planPath =
    typeof args.plan === "string" ? resolve(args.plan) : DEFAULT_PLAN_PATH;
  const [manifestPlan, freshPlan] = await Promise.all([
    loadManifest(planPath),
    buildFreshPlan(sourceRoot),
  ]);
  if (manifestPlan.planDigest !== freshPlan.planDigest) {
    throw new Error("Checked-in Lions manifest is stale for the organized local source folder.");
  }
  const rows = buildLionsLocalImportRows(manifestPlan);
  const planReconciliation = reconcileLionsLocalImportPlan(manifestPlan, rows);
  const service = createClient(supabaseUrl, serviceRoleKey, {
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
  const storage = await ensureStorageObjects({
    service,
    sourceRoot,
    plan: manifestPlan,
  });
  const pg = new PostgresClient({ connectionString: dbUrl });
  await pg.connect();
  try {
    await applyRows(pg, rows, manifestPlan);
    const database = await reconcileDatabase(pg, manifestPlan);
    console.log(
      JSON.stringify({
        tenant: {
          id: LIONS_LOCAL_TENANT_ID,
          slug: "lions",
          localUrl: "http://lions.localhost:3000",
        },
        storage,
        plan: planReconciliation,
        database,
        hostedMutations: 0,
      }),
    );
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage());
  process.exitCode = 1;
});
