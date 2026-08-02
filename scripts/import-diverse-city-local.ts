import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PostgresClient } from "pg";
import WebSocket from "ws";
import {
  buildDiverseCityLocalImportRows,
  DIVERSE_CITY_LOCAL_HOSTNAME,
  reconcileDiverseCityLocalImportPlan,
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

const DEFAULT_SOURCE_ROOT =
  "/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site/public";
const DEFAULT_PLAN_PATH = resolve(
  "docs/phase-11/diverse-city/diverse-city-local-import-plan.json",
);
const BASELINE_TENANTS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
] as const;

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
  clubs: ["id"],
  club_domains: ["id"],
  club_subscriptions: ["club_id"],
  club_members: ["user_id", "club_id"],
  seasons: ["id"],
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

const STATE_TABLES = [
  "clubs",
  "club_domains",
  "club_subscriptions",
  "club_members",
  "seasons",
  "presentation_documents",
  "presentation_state",
  "presentation_publications",
  "media_assets",
  "site_branding",
  "homepage_hero_content",
  "behind_the_rose_section",
  "about_page_content",
  "programs",
  "contact_profile",
  "contact_page_content",
  "tryouts",
  "players",
  "staff",
  "matches",
  "league_standings",
  "shop_kit_section",
  "shop_kit_photos",
  "shop_carousel_photos",
  "shop_purchase_details",
  "site_sponsor_logos",
  "site_social_links",
] as const;

const RESET_ORDER = [
  "goalkeeper_match_stats",
  "player_match_stats",
  "goalkeeper_season_stats",
  "player_season_stats",
  "player_photos",
  "tryouts",
  "presentation_state",
  "presentation_publications",
  "presentation_documents",
  "programs",
  "contact_page_content",
  "contact_profile",
  "homepage_slideshow_photos",
  "homepage_slideshow_settings",
  "league_standings",
  "league_standings_settings",
  "shop_kit_photos",
  "shop_carousel_photos",
  "shop_kit_section",
  "shop_purchase_details",
  "site_sponsor_logos",
  "site_social_links",
  "site_branding",
  "about_page_content",
  "club_logo_page_content",
  "homepage_hero_content",
  "behind_the_rose_section",
  "media_cleanup_queue",
  "matches",
  "players",
  "staff",
  "seasons",
  "media_assets",
  "stripe_events",
  "club_exports",
  "club_members",
  "club_subscriptions",
  "club_domains",
  "audit_events",
] as const;

type LocalServiceClient = SupabaseClient<any, any, any, any, any>;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}`);
    if (["--execute-local", "--confirm-local", "--rehearse", "--reset-only"].includes(arg)) {
      result[arg.slice(2)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
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

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier ${value}.`);
  return `"${value}"`;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function upsertRow(client: PostgresClient, table: string, row: SourceRow) {
  const conflicts = CONFLICT_COLUMNS[table];
  if (!conflicts) throw new Error(`Unexpected destination table ${table}.`);
  const columns = Object.keys(row).sort();
  const values = columns.map((column) =>
    JSON_COLUMNS.has(`${table}.${column}`) && row[column] !== null
      ? JSON.stringify(row[column])
      : row[column],
  );
  const placeholders = columns.map((column, index) =>
    JSON_COLUMNS.has(`${table}.${column}`) ? `$${index + 1}::jsonb` : `$${index + 1}`,
  );
  const updates = columns.filter((column) => !conflicts.includes(column));
  const updateSql = updates.length === 0 || INSERT_ONLY_TABLES.has(table)
    ? "do nothing"
    : `do update set ${updates.map((column) =>
        `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")}`;
  await client.query(
    `insert into onzio.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) ` +
      `values (${placeholders.join(", ")}) on conflict (${conflicts.map(quoteIdentifier).join(", ")}) ${updateSql}`,
    values,
  );
}

type SourceRow = Record<string, unknown>;

async function readAssets(sourceRoot: string) {
  return Promise.all(ASSET_FILES.map(async (path) => ({
    path,
    bytes: await readFile(resolve(sourceRoot, path)),
  })));
}

async function freshPlan(sourceRoot: string): Promise<DiverseCityImportPlan> {
  return buildDiverseCityImportPlan({
    sourceCommit: DIVERSE_CITY_SOURCE_COMMIT,
    destinationEnvironment: "local",
    destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
    confirmedDestinationEnvironment: "local",
    dryRun: true,
    generatedAt: "2026-08-01T00:00:00.000Z",
    assets: await readAssets(sourceRoot),
  });
}

async function ensureStorageObjects(input: {
  service: LocalServiceClient;
  sourceRoot: string;
  plan: DiverseCityImportPlan;
}) {
  let uploaded = 0;
  let reused = 0;
  for (const asset of input.plan.assets) {
    const sourceBytes = await readFile(resolve(input.sourceRoot, asset.sourcePath));
    if (sha256(sourceBytes) !== asset.sourceChecksumSha256) {
      throw new Error(`Source checksum mismatch for ${asset.sourcePath}.`);
    }
    const normalized = asset.mediaKind === "photograph"
      ? await normalizePhoto(sourceBytes)
      : await normalizeGraphic(sourceBytes);
    if (
      normalized.checksumSha256 !== asset.normalizedChecksumSha256 ||
      normalized.bytes.length !== asset.normalizedByteSize
    ) {
      throw new Error(`Normalized checksum mismatch for ${asset.sourcePath}.`);
    }
    const existing = await input.service.storage.from("onzio-media").download(asset.destinationPath);
    if (!existing.error && existing.data) {
      const bytes = Buffer.from(await existing.data.arrayBuffer());
      if (sha256(bytes) !== asset.normalizedChecksumSha256) {
        throw new Error(`Existing local object checksum mismatch: ${asset.destinationPath}`);
      }
      reused += 1;
      continue;
    }
    const upload = await input.service.storage.from("onzio-media").upload(
      asset.destinationPath,
      normalized.bytes,
      { contentType: normalized.mimeType, cacheControl: "31536000", upsert: false },
    );
    if (upload.error) throw upload.error;
    uploaded += 1;
  }
  return { uploaded, reused };
}

async function applyRows(client: PostgresClient, rows: DiverseCityLocalImportRows, plan: DiverseCityImportPlan) {
  await client.query("begin");
  try {
    await upsertRow(client, "clubs", rows.club);
    await upsertRow(client, "club_domains", rows.domain);
    await upsertRow(client, "club_subscriptions", rows.subscription);
    await upsertRow(client, "club_members", rows.localMember);
    for (const row of rows.seasons) await upsertRow(client, "seasons", row);
    await upsertRow(client, "presentation_documents", rows.presentationDocument);
    await upsertRow(client, "presentation_state", rows.presentationState);
    await upsertRow(client, "presentation_publications", rows.presentationPublication);
    for (const row of rows.mediaAssets) await upsertRow(client, "media_assets", row);
    await upsertRow(client, "site_branding", rows.siteBranding);
    await upsertRow(client, "homepage_hero_content", rows.homepageHeroContent);
    await upsertRow(client, "behind_the_rose_section", rows.behindTheRoseSection);
    await upsertRow(client, "about_page_content", rows.aboutPageContent);
    for (const row of rows.programs) await upsertRow(client, "programs", row);
    await upsertRow(client, "contact_profile", rows.contactProfile);
    await upsertRow(client, "contact_page_content", rows.contactPageContent);
    for (const row of rows.shopKitSections) await upsertRow(client, "shop_kit_section", row);
    for (const row of rows.shopKitPhotos) await upsertRow(client, "shop_kit_photos", row);
    for (const row of rows.shopCarouselPhotos) await upsertRow(client, "shop_carousel_photos", row);
    await upsertRow(client, "shop_purchase_details", rows.shopPurchaseDetails);
    for (const row of rows.siteSponsorLogos) await upsertRow(client, "site_sponsor_logos", row);
    for (const row of rows.siteSocialLinks) await upsertRow(client, "site_social_links", row);
    const audit = await client.query(
      `select 1 from onzio.audit_events where club_id = $1 and operation = 'diverse_city_local_import' and payload @> $2::jsonb limit 1`,
      [DIVERSE_CITY_LOCAL_TENANT_ID, JSON.stringify({ plan_digest: plan.planDigest })],
    );
    if (audit.rowCount === 0) {
      await client.query(
        `insert into onzio.audit_events (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
         values ($1::uuid, null, 'migration', 'diverse_city_local_import', 'club', $1::text, $2::jsonb)`,
        [DIVERSE_CITY_LOCAL_TENANT_ID, JSON.stringify(rows.auditEvent.payload)],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function withoutVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["created_at", "updated_at", "published_at"].includes(key))
      .map(([key, item]) => [key, withoutVolatileFields(item)]),
  );
}

async function tenantStateDigest(client: PostgresClient, tenantId: string): Promise<string> {
  const state: Record<string, unknown[]> = {};
  for (const table of STATE_TABLES) {
    const predicate = table === "clubs" ? "id = $1" : "club_id = $1";
    const result = await client.query(
      `select to_jsonb(t) as row from onzio.${quoteIdentifier(table)} t where ${predicate}`,
      [tenantId],
    );
    state[table] = result.rows
      .map((entry) => withoutVolatileFields(entry.row))
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  }
  return sha256(stableJson(state));
}

async function baselineDigests(client: PostgresClient) {
  return Object.fromEntries(
    await Promise.all(BASELINE_TENANTS.map(async (tenantId) => [
      tenantId,
      await tenantStateDigest(client, tenantId),
    ])),
  );
}

async function databaseCounts(client: PostgresClient) {
  const tables = [
    "media_assets", "programs", "tryouts", "players", "staff", "matches",
    "league_standings", "site_sponsor_logos", "shop_kit_photos",
    "shop_carousel_photos", "presentation_documents",
  ] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const result = await client.query(
      `select count(*)::integer as count from onzio.${quoteIdentifier(table)} where club_id = $1`,
      [DIVERSE_CITY_LOCAL_TENANT_ID],
    );
    counts[table] = Number(result.rows[0].count);
  }
  const expected: Record<string, number> = {
    media_assets: 10,
    programs: 4,
    tryouts: 0,
    players: 0,
    staff: 0,
    matches: 0,
    league_standings: 0,
    site_sponsor_logos: 2,
    shop_kit_photos: 4,
    shop_carousel_photos: 2,
    presentation_documents: 1,
  };
  if (stableJson(counts) !== stableJson(expected)) {
    throw new Error(`Diverse City database reconciliation failed: ${JSON.stringify(counts)}`);
  }
  return counts;
}

async function resetTenant(client: PostgresClient, service: LocalServiceClient) {
  const objects = await client.query(
    "select storage_path from onzio.media_assets where club_id = $1 order by storage_path",
    [DIVERSE_CITY_LOCAL_TENANT_ID],
  );
  const paths = objects.rows.map((row) => String(row.storage_path));
  if (paths.length > 0) {
    const removal = await service.storage.from("onzio-media").remove(paths);
    if (removal.error) throw removal.error;
  }
  await client.query("begin");
  try {
    // Local rehearsal must prove full tenant compensation. Production keeps
    // these append-only triggers enabled; only this loopback superuser reset
    // temporarily disables them inside the rollback transaction.
    await client.query(
      "alter table onzio.presentation_publications disable trigger presentation_publications_immutable",
    );
    await client.query(
      "alter table onzio.presentation_documents disable trigger presentation_documents_immutable",
    );
    for (const table of RESET_ORDER) {
      await client.query(
        `delete from onzio.${quoteIdentifier(table)} where club_id = $1`,
        [DIVERSE_CITY_LOCAL_TENANT_ID],
      );
    }
    await client.query("delete from onzio.clubs where id = $1", [DIVERSE_CITY_LOCAL_TENANT_ID]);
    await client.query(
      "alter table onzio.presentation_documents enable trigger presentation_documents_immutable",
    );
    await client.query(
      "alter table onzio.presentation_publications enable trigger presentation_publications_immutable",
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  const remaining = await client.query("select count(*)::integer as count from onzio.clubs where id = $1", [DIVERSE_CITY_LOCAL_TENANT_ID]);
  if (Number(remaining.rows[0].count) !== 0) throw new Error("Diverse City reset did not remove the local tenant.");
  return { removedObjects: paths.length, removedTenant: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["execute-local"] !== true || args["confirm-local"] !== true) {
    throw new Error("Local execution requires --execute-local and --confirm-local.");
  }
  const supabaseUrl = assertLoopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL");
  const dbUrl = assertLoopbackUrl(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  const sourceRoot = typeof args["source-root"] === "string" ? resolve(args["source-root"]) : DEFAULT_SOURCE_ROOT;
  const planPath = typeof args.plan === "string" ? resolve(args.plan) : DEFAULT_PLAN_PATH;
  const manifest = JSON.parse(await readFile(planPath, "utf8")) as DiverseCityImportPlan;
  const fresh = await freshPlan(sourceRoot);
  if (manifest.planDigest !== fresh.planDigest) {
    throw new Error("Checked-in Diverse City manifest is stale for the approved source snapshot.");
  }
  const rows = buildDiverseCityLocalImportRows(manifest);
  const plan = reconcileDiverseCityLocalImportPlan(manifest, rows);
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const pg = new PostgresClient({ connectionString: dbUrl });
  await pg.connect();
  try {
    const baselineBefore = await baselineDigests(pg);
    if (args["reset-only"] === true) {
      const reset = await resetTenant(pg, service);
      const baselineAfter = await baselineDigests(pg);
      if (stableJson(baselineAfter) !== stableJson(baselineBefore)) {
        throw new Error("Baseline tenant state changed during Diverse City reset.");
      }
      console.log(JSON.stringify({ reset, baselineIsolation: true, hostedMutations: 0 }));
      return;
    }

    const storageFirst = await ensureStorageObjects({ service, sourceRoot, plan: manifest });
    await applyRows(pg, rows, manifest);
    const countsFirst = await databaseCounts(pg);
    const firstDigest = await tenantStateDigest(pg, DIVERSE_CITY_LOCAL_TENANT_ID);

    const storageSecond = await ensureStorageObjects({ service, sourceRoot, plan: manifest });
    await applyRows(pg, rows, manifest);
    const secondDigest = await tenantStateDigest(pg, DIVERSE_CITY_LOCAL_TENANT_ID);
    if (secondDigest !== firstDigest) throw new Error("Idempotent Diverse City replay changed tenant state.");

    let rehearsal: Record<string, unknown> | null = null;
    if (args.rehearse === true) {
      const reset = await resetTenant(pg, service);
      const baselineAfterReset = await baselineDigests(pg);
      if (stableJson(baselineAfterReset) !== stableJson(baselineBefore)) {
        throw new Error("Alpha/Bravo state changed during Diverse City reset.");
      }
      const replayStorage = await ensureStorageObjects({ service, sourceRoot, plan: manifest });
      await applyRows(pg, rows, manifest);
      await databaseCounts(pg);
      const replayDigest = await tenantStateDigest(pg, DIVERSE_CITY_LOCAL_TENANT_ID);
      if (replayDigest !== firstDigest) throw new Error("Reset/replay did not reproduce Diverse City state.");
      rehearsal = { reset, replayStorage, replayDigest, baselineIsolation: true };
    }
    console.log(JSON.stringify({
      tenant: { id: DIVERSE_CITY_LOCAL_TENANT_ID, slug: "diverse-city", localUrl: `http://${DIVERSE_CITY_LOCAL_HOSTNAME}:3000` },
      plan,
      storageFirst,
      storageSecond,
      countsFirst,
      firstDigest,
      idempotentReplay: secondDigest === firstDigest,
      rehearsal,
      hostedMutations: 0,
    }));
  } finally {
    await pg.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
