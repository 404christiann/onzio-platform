import { createHash } from "node:crypto";
import {
  open,
  readFile,
  stat,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { Client as PostgresClient, type PoolClient } from "pg";
import WebSocket from "ws";
import {
  materializeMediaTokens,
  type RoseCityImportPlan,
  type SourceRow,
} from "@/lib/migration/rose-city-plan";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const OWNER_EMAIL = "owner@rose-city.localhost";
const ADMIN_EMAIL = "admin@rose-city.localhost";
const MODES = new Set(["apply", "reset"]);
type LocalServiceClient = SupabaseClient<any, any, any, any, any>;

const CONTENT_INSERT_ORDER = [
  "seasons",
  "players",
  "staff",
  "matches",
  "player_photos",
  "player_match_stats",
  "goalkeeper_match_stats",
  "player_season_stats",
  "goalkeeper_season_stats",
  "site_branding",
  "site_social_links",
  "site_sponsor_logos",
  "about_page_content",
  "club_logo_page_content",
  "behind_the_rose_section",
  "homepage_slideshow_settings",
  "homepage_slideshow_photos",
  "league_standings_settings",
  "league_standings",
  "shop_kit_section",
  "shop_kit_photos",
  "shop_carousel_photos",
  "shop_purchase_details",
  "club_subscriptions",
] as const;

const CONTENT_DELETE_ORDER = [...CONTENT_INSERT_ORDER].reverse();

const CONFLICT_COLUMNS: Record<string, readonly string[]> = {
  clubs: ["id"],
  club_domains: ["id"],
  club_members: ["user_id", "club_id"],
  media_assets: ["id"],
  seasons: ["id"],
  players: ["id"],
  staff: ["id"],
  matches: ["id"],
  player_photos: ["id"],
  player_match_stats: ["id"],
  goalkeeper_match_stats: ["id"],
  player_season_stats: ["club_id", "player_id", "season_id"],
  goalkeeper_season_stats: ["club_id", "player_id", "season_id"],
  site_branding: ["club_id"],
  site_social_links: ["club_id", "id"],
  site_sponsor_logos: ["id"],
  about_page_content: ["club_id"],
  club_logo_page_content: ["club_id"],
  behind_the_rose_section: ["club_id"],
  homepage_slideshow_settings: ["club_id"],
  homepage_slideshow_photos: ["id"],
  league_standings_settings: ["club_id"],
  league_standings: ["id"],
  shop_kit_section: ["id"],
  shop_kit_photos: ["id"],
  shop_carousel_photos: ["id"],
  shop_purchase_details: ["club_id"],
  club_subscriptions: ["club_id"],
};

const JSON_COLUMNS = new Set([
  "about_page_content.story_paragraphs",
  "about_page_content.values",
  "club_logo_page_content.features",
  "club_logo_page_content.color_cards",
  "shop_kit_section.bullet_points",
  "shop_purchase_details.cards",
]);

function usage(): string {
  return [
    "Usage:",
    "  npm run migration:import:rose-city -- /absolute/private/plan-directory --mode=apply",
    "  npm run migration:reset:rose-city -- /absolute/private/plan-directory --mode=reset",
    "",
    "Required environment:",
    "  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
    "  SUPABASE_SERVICE_ROLE_KEY=<local service-role JWT>",
    "  SUPABASE_DB_URL=postgresql://...@127.0.0.1:54322/postgres",
    "  ROSE_CITY_LOCAL_PASSWORD=<local-only password, apply mode only>",
  ].join("\n");
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function assertAbsolutePrivateDirectory(rawPath: string): string {
  if (!isAbsolute(rawPath)) throw new Error("Plan directory must be absolute.");
  const path = resolve(rawPath);
  if (isInside(REPOSITORY_ROOT, path)) {
    throw new Error("Refusing a repository-contained import plan.");
  }
  return path;
}

function assertLoopbackUrl(raw: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must use a loopback host.`);
  }
  if (name === "NEXT_PUBLIC_SUPABASE_URL" && url.protocol !== "http:") {
    throw new Error("Local Supabase API must use loopback HTTP.");
  }
  if (
    name === "SUPABASE_DB_URL" &&
    !["postgres:", "postgresql:"].includes(url.protocol)
  ) {
    throw new Error("Local database URL must use PostgreSQL.");
  }
  return url;
}

function parseChecksumLedger(contents: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of contents.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) throw new Error("Invalid private-plan checksum entry.");
    if (result.has(match[2])) throw new Error("Duplicate checksum entry.");
    result.set(match[2], match[1]);
  }
  return result;
}

async function hashFile(path: string): Promise<string> {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function loadVerifiedPlan(planDirectory: string): Promise<RoseCityImportPlan> {
  const directoryStats = await stat(planDirectory);
  if (!directoryStats.isDirectory()) throw new Error("Plan path is not a directory.");
  const ledger = parseChecksumLedger(
    await readFile(resolve(planDirectory, "checksums.sha256"), "utf8"),
  );
  for (const [file, expected] of ledger) {
    if ((await hashFile(resolve(planDirectory, file))) !== expected) {
      throw new Error(`Private import-plan checksum failed: ${file}`);
    }
  }
  const plan = JSON.parse(
    await readFile(resolve(planDirectory, "import-plan.json"), "utf8"),
  ) as RoseCityImportPlan;
  if (
    plan.kind !== "rose-city-local-import-plan" ||
    plan.formatVersion !== 1 ||
    plan.reconciliation.allSourceTablesMapped !== true ||
    plan.reconciliation.relationshipsPreserved !== true ||
    plan.reconciliation.referencedMediaResolved !== true ||
    plan.reconciliation.credentialsEmbedded !== false ||
    plan.mediaSummary.sourceObjectCount !== 557 ||
    plan.mediaSummary.referencedExcludedObjectCount !== 0 ||
    plan.mediaSummary.approvedInputExceptionCount !== 16 ||
    plan.mappings.length !== 24
  ) {
    throw new Error("Import plan does not satisfy the approved rehearsal contract.");
  }
  const serialized = JSON.stringify(plan);
  if (
    /(?:eyJ[a-zA-Z0-9_-]{20,}\.|sb_secret_|sk_live_|service_role)/.test(
      serialized,
    )
  ) {
    throw new Error("Credential-shaped content exists in the import plan.");
  }
  for (const media of plan.media.filter((item) => item.importable)) {
    if (
      !media.outputRelativePath ||
      !media.outputChecksumSha256 ||
      !media.destinationPath ||
      ledger.get(media.outputRelativePath) !== media.outputChecksumSha256
    ) {
      throw new Error("Processed media does not match the import plan.");
    }
  }
  return plan;
}

function guardedLocalFetch(origin: string): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string" || input instanceof URL
        ? new URL(input)
        : new URL(input.url);
    if (url.origin !== origin) {
      throw new Error(`Local importer blocked unexpected origin ${url.origin}.`);
    }
    return fetch(input, init);
  };
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier ${value}.`);
  }
  return `"${value}"`;
}

async function upsertRow(
  client: PostgresClient | PoolClient,
  table: string,
  row: SourceRow,
) {
  const conflicts = CONFLICT_COLUMNS[table];
  if (!conflicts) throw new Error(`Unexpected destination table ${table}.`);
  const columns = Object.keys(row).sort();
  if (columns.length === 0) throw new Error(`${table} contains an empty row.`);
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
    updates.length === 0
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

async function listAllUsers(service: LocalServiceClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureLocalUser(input: {
  service: LocalServiceClient;
  email: string;
  password: string;
  role: "owner" | "admin";
}): Promise<{ user: User; created: boolean }> {
  const existing = (await listAllUsers(input.service)).find(
    (user) => user.email?.toLowerCase() === input.email,
  );
  if (existing) {
    const { data, error } = await input.service.auth.admin.updateUserById(
      existing.id,
      {
        password: input.password,
        email_confirm: true,
        app_metadata: {
          ...(existing.app_metadata ?? {}),
          onzio_local_rehearsal: true,
          onzio_role: input.role,
        },
      },
    );
    if (error || !data.user) throw error ?? new Error("Local Auth update failed.");
    return { user: data.user, created: false };
  }
  const { data, error } = await input.service.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    app_metadata: {
      onzio_local_rehearsal: true,
      onzio_role: input.role,
    },
  });
  if (error || !data.user) throw error ?? new Error("Local Auth creation failed.");
  return { user: data.user, created: true };
}

async function deleteUsers(
  service: LocalServiceClient,
  userIds: readonly string[],
) {
  for (const userId of userIds) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
}

async function ensureStorageObject(input: {
  service: LocalServiceClient;
  planDirectory: string;
  media: RoseCityImportPlan["media"][number];
}): Promise<boolean> {
  const path = input.media.destinationPath!;
  const { data: existing, error: downloadError } = await input.service.storage
    .from("onzio-media")
    .download(path);
  if (!downloadError && existing) {
    const bytes = Buffer.from(await existing.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== input.media.outputChecksumSha256) {
      throw new Error(`Existing local media checksum mismatch: ${path}`);
    }
    return false;
  }
  const bytes = await readFile(
    resolve(input.planDirectory, input.media.outputRelativePath!),
  );
  const { error } = await input.service.storage.from("onzio-media").upload(
    path,
    bytes,
    {
      contentType: input.media.outputMimeType!,
      cacheControl: "31536000",
      upsert: false,
    },
  );
  if (error) throw error;
  return true;
}

async function removeStorageObjects(
  service: LocalServiceClient,
  paths: readonly string[],
) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await service.storage
      .from("onzio-media")
      .remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

function mediaAssetRows(plan: RoseCityImportPlan): SourceRow[] {
  return plan.media
    .filter((media) => media.importable)
    .map((media) => ({
      id: media.id,
      club_id: plan.club.id,
      storage_bucket: "onzio-media",
      storage_path: media.destinationPath,
      surface: media.surface,
      media_kind:
        media.classification === "photograph" ? "photograph" : "graphic",
      mime_type: media.outputMimeType,
      byte_size: media.outputByteSize,
      width: media.outputWidth,
      height: media.outputHeight,
      checksum_sha256: media.outputChecksumSha256,
      status: "published",
      created_by: null,
      created_at: "2026-07-27T00:00:00.000Z",
      published_at: "2026-07-27T00:00:00.000Z",
      deleted_at: null,
    }));
}

async function applyDatabasePlan(input: {
  client: PostgresClient;
  plan: RoseCityImportPlan;
  supabaseUrl: string;
  ownerId: string;
  adminId: string;
}) {
  await input.client.query("begin");
  try {
    await upsertRow(input.client, "clubs", input.plan.club);
    await upsertRow(input.client, "club_domains", input.plan.domain);
    for (const asset of mediaAssetRows(input.plan)) {
      await upsertRow(input.client, "media_assets", asset);
    }
    for (const identity of [
      { user_id: input.ownerId, role: "owner" },
      { user_id: input.adminId, role: "admin" },
    ]) {
      await upsertRow(input.client, "club_members", {
        ...identity,
        club_id: input.plan.club.id,
        status: "active",
        created_at: "2026-07-27T00:00:00.000Z",
        updated_at: "2026-07-27T00:00:00.000Z",
        removed_at: null,
      });
    }
    const materializedTables = materializeMediaTokens(
      input.plan.tables,
      input.supabaseUrl,
    ) as Record<string, SourceRow[]>;
    for (const table of CONTENT_INSERT_ORDER) {
      const rows = materializedTables[table];
      if (!rows) throw new Error(`Import plan is missing ${table}.`);
      for (const row of rows) await upsertRow(input.client, table, row);
    }
    await input.client.query(
      `insert into onzio.audit_events
        (club_id, actor_type, operation, resource_type, resource_id, payload)
       values ($1::uuid, 'migration', 'rose_city_local_import', 'club', $1::text, $2::jsonb)`,
      [
        input.plan.club.id,
        JSON.stringify({
          source_digest: input.plan.sourceDigest,
          plan_digest: input.plan.planDigest,
          source_rows: input.plan.reconciliation.sourceRowCount,
          media_assets: input.plan.mediaSummary.importableObjectCount,
        }),
      ],
    );
    await input.client.query("commit");
  } catch (error) {
    await input.client.query("rollback");
    throw error;
  }
}

async function resetDatabasePlan(
  client: PostgresClient,
  clubId: unknown,
) {
  await client.query("begin");
  try {
    for (const table of CONTENT_DELETE_ORDER) {
      await client.query(
        `delete from onzio.${quoteIdentifier(table)} where club_id = $1`,
        [clubId],
      );
    }
    for (const table of [
      "media_cleanup_queue",
      "club_exports",
      "audit_events",
      "stripe_events",
      "club_members",
      "club_domains",
      "media_assets",
    ]) {
      await client.query(
        `delete from onzio.${quoteIdentifier(table)} where club_id = $1`,
        [clubId],
      );
    }
    await client.query("delete from onzio.clubs where id = $1", [clubId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function reconcileDatabase(
  client: PostgresClient,
  plan: RoseCityImportPlan,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of CONTENT_INSERT_ORDER) {
    const result = await client.query(
      `select count(*)::integer as count from onzio.${quoteIdentifier(table)}
       where club_id = $1`,
      [plan.club.id],
    );
    counts[table] = Number(result.rows[0].count);
    if (counts[table] !== plan.tables[table].length) {
      throw new Error(`Imported row count mismatch for ${table}.`);
    }
  }
  const media = await client.query(
    "select count(*)::integer as count from onzio.media_assets where club_id = $1",
    [plan.club.id],
  );
  counts.media_assets = Number(media.rows[0].count);
  if (counts.media_assets !== plan.mediaSummary.importableObjectCount) {
    throw new Error("Imported media_assets count mismatch.");
  }
  const relationships = await client.query(
    `select
       (select count(*) from onzio.player_photos p
        join onzio.players r on r.club_id = p.club_id and r.id = p.player_id
        where p.club_id = $1) as player_photos,
       (select count(*) from onzio.player_match_stats s
        join onzio.players p on p.club_id = s.club_id and p.id = s.player_id
        join onzio.matches m on m.club_id = s.club_id and m.id = s.match_id
        where s.club_id = $1) as player_match_stats,
       (select count(*) from onzio.goalkeeper_match_stats s
        join onzio.players p on p.club_id = s.club_id and p.id = s.player_id
        join onzio.matches m on m.club_id = s.club_id and m.id = s.match_id
        where s.club_id = $1) as goalkeeper_match_stats`,
    [plan.club.id],
  );
  for (const table of [
    "player_photos",
    "player_match_stats",
    "goalkeeper_match_stats",
  ]) {
    if (Number(relationships.rows[0][table]) !== plan.tables[table].length) {
      throw new Error(`Composite relationship mismatch for ${table}.`);
    }
  }
  return counts;
}

async function main() {
  if (process.argv.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const positional = process.argv
    .slice(2)
    .filter((argument) => !argument.startsWith("--"));
  const modeArgument = process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--mode="));
  const mode = modeArgument?.slice("--mode=".length);
  if (positional.length !== 1 || !mode || !MODES.has(mode)) {
    throw new Error(usage());
  }
  const planDirectory = assertAbsolutePrivateDirectory(positional[0]);
  const plan = await loadVerifiedPlan(planDirectory);
  const supabaseUrl = assertLoopbackUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    "NEXT_PUBLIC_SUPABASE_URL",
  );
  const databaseUrl = assertLoopbackUrl(
    process.env.SUPABASE_DB_URL ?? "",
    "SUPABASE_DB_URL",
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Local service-role key is required.");
  const service = createClient(supabaseUrl.toString().replace(/\/$/, ""), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: guardedLocalFetch(supabaseUrl.origin) },
    realtime: {
      transport: WebSocket as unknown as typeof globalThis.WebSocket,
    },
  });
  const database = new PostgresClient({
    connectionString: databaseUrl.toString(),
    application_name: "onzio-rose-city-local-rehearsal",
  });
  await database.connect();

  try {
    if (mode === "reset") {
      const paths = plan.media
        .filter((media) => media.importable)
        .map((media) => media.destinationPath!);
      await removeStorageObjects(service, paths);
      try {
        await resetDatabasePlan(database, plan.club.id);
      } catch (error) {
        for (const media of plan.media.filter((item) => item.importable)) {
          await ensureStorageObject({ service, planDirectory, media });
        }
        throw error;
      }
      const localUsers = (await listAllUsers(service)).filter((user) =>
        [OWNER_EMAIL, ADMIN_EMAIL].includes(user.email?.toLowerCase() ?? ""),
      );
      await deleteUsers(
        service,
        localUsers.map((user) => user.id),
      );
      process.stdout.write(
        `${JSON.stringify(
          {
            status: "reset",
            clubId: plan.club.id,
            storageObjectsRemoved: paths.length,
            localUsersRemoved: localUsers.length,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const password = process.env.ROSE_CITY_LOCAL_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error("ROSE_CITY_LOCAL_PASSWORD must contain at least 16 characters.");
    }
    const createdUserIds: string[] = [];
    const newlyUploaded: string[] = [];
    try {
      const owner = await ensureLocalUser({
        service,
        email: OWNER_EMAIL,
        password,
        role: "owner",
      });
      const admin = await ensureLocalUser({
        service,
        email: ADMIN_EMAIL,
        password,
        role: "admin",
      });
      if (owner.created) createdUserIds.push(owner.user.id);
      if (admin.created) createdUserIds.push(admin.user.id);

      const importableMedia = plan.media.filter((media) => media.importable);
      for (let index = 0; index < importableMedia.length; index += 8) {
        const batch = importableMedia.slice(index, index + 8);
        const uploaded = await Promise.all(
          batch.map(async (media) => ({
            path: media.destinationPath!,
            created: await ensureStorageObject({
              service,
              planDirectory,
              media,
            }),
          })),
        );
        newlyUploaded.push(
          ...uploaded.filter((item) => item.created).map((item) => item.path),
        );
      }

      await applyDatabasePlan({
        client: database,
        plan,
        supabaseUrl: supabaseUrl.toString().replace(/\/$/, ""),
        ownerId: owner.user.id,
        adminId: admin.user.id,
      });
      const counts = await reconcileDatabase(database, plan);
      process.stdout.write(
        `${JSON.stringify(
          {
            status: "imported",
            clubId: plan.club.id,
            slug: plan.club.slug,
            sourceRows: plan.reconciliation.sourceRowCount,
            mediaAssets: plan.mediaSummary.importableObjectCount,
            approvedInputExceptions:
              plan.mediaSummary.approvedInputExceptionCount,
            ownerEmail: OWNER_EMAIL,
            adminEmail: ADMIN_EMAIL,
            mfaEnrollmentRequired: true,
            planDigest: plan.planDigest,
            counts,
          },
          null,
          2,
        )}\n`,
      );
    } catch (error) {
      if (newlyUploaded.length > 0) {
        await removeStorageObjects(service, newlyUploaded);
      }
      if (createdUserIds.length > 0) {
        await deleteUsers(service, createdUserIds);
      }
      throw error;
    }
  } finally {
    await database.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
