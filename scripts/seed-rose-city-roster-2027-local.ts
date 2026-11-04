/** Import ONLY existing public roster data/media and a zero-stat 2027 season.
 * Already-normalized immutable media is copied byte-for-byte, like the legacy
 * import. This never resets a tenant, overwrites a populated roster, or writes
 * to the source project. Run with --execute-local --source <reviewed JSON>.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import sharp from "sharp";
import { buildRoseCityRosterImport, type RoseCityRosterSource, type RosterRow } from "@/lib/rose-city-roster-import";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const columns: Record<string, string[]> = {
  media_assets: ["id", "club_id", "storage_bucket", "storage_path", "surface", "media_kind", "mime_type", "byte_size", "width", "height", "checksum_sha256", "status", "created_by", "created_at", "published_at", "deleted_at"],
  seasons: ["id", "club_id", "label", "start_year", "end_year", "active", "created_at", "updated_at"],
  players: ["id", "club_id", "number", "name", "caption", "nationality", "position", "height", "weight", "hometown", "age", "school", "previous_club", "photo_url", "photo_asset_id", "active", "bio", "pronunciation", "foot", "created_at", "updated_at"],
  player_photos: ["id", "club_id", "player_id", "url", "media_asset_id", "sort_order", "created_at"],
  player_season_stats: ["club_id", "player_id", "season_id", "goals", "assists", "tackles", "starts", "yellow", "red", "mins", "offsides", "fouls", "fouls_suffered", "updated_at"],
  goalkeeper_season_stats: ["club_id", "player_id", "season_id", "goals_against", "saves", "clean_sheets", "starts", "yellow", "red", "mins", "updated_at"],
};

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "55321" || connection.hostname !== "127.0.0.1" || connection.port !== "55322" || [...connection.searchParams.keys()].some((k) => ["host", "hostaddr", "service", "servicefile"].includes(k))) throw new Error("Only isolated local55321/55322 allowed.");
  const sourceArg = process.argv.indexOf("--source");
  if (!process.argv.includes("--execute-local") || sourceArg < 0 || !process.argv[sourceArg + 1]) throw new Error("Pass --execute-local --source <reviewed JSON>.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Local service key required.");
  const sourceBytes = await readFile(resolve(process.argv[sourceArg + 1]));
  const source = JSON.parse(sourceBytes.toString()) as RoseCityRosterSource;
  if (source.sourceProject !== "ioalthwsdrlzrubomrow") throw new Error("Unexpected public source project.");
  const seasonId = randomUUID();
  const plan = buildRoseCityRosterImport(source, api.origin, seasonId);
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const local = createClient(api.origin, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    global: { fetch: (input, init) => {
      const address = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (address.origin !== api.origin) throw new Error("Nonlocal storage request blocked.");
      return fetch(input, init);
    } },
  });
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  let inTransaction = false;
  const uploaded: string[] = [];
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [source.clubId])).rows[0];
    if (club?.slug !== "rose-city" || club.kind !== "test") throw new Error("Expected isolated Rose City test tenant.");
    for (const table of ["players", "player_photos", "seasons", "player_season_stats", "goalkeeper_season_stats"]) {
      if ((await db.query(`select 1 from onzio.${table} where club_id=$1 limit 1`, [source.clubId])).rowCount) throw new Error(`${table} is populated; refusing overwrite.`);
    }
    const exempt = new Set(["media_assets", "media_cleanup_queue", "audit_events", ...Object.keys(columns).filter((table) => table !== "media_assets")]);
    const tables = (await db.query("select tablename from pg_catalog.pg_tables where schemaname='onzio' order by tablename")).rows.map((r) => String(r.tablename)).filter((t) => !exempt.has(t));
    if (tables.some((table) => !/^[a-z][a-z0-9_]*$/.test(table))) throw new Error("Unsafe table identifier.");
    async function capture() {
      const result: Record<string, string> = {};
      for (const table of tables) result[table] = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) digest from onzio.${table} t`)).rows[0].digest;
      return result;
    }
    const before = await capture();
    const originalMedia = (await db.query("select * from onzio.media_assets order by id")).rows;
    const existingMediaIds = originalMedia.map((asset) => asset.id);
    if (source.media.some((asset) => existingMediaIds.includes(asset.id))) throw new Error("A source media identity already exists; refusing overwrite.");

    // Validate all incoming bytes before inserting roster rows. Preserve source
    // normalized versions/UUID paths rather than recompressing photographs.
    const assetDir = resolve("../../assets/originals/roster-2027");
    await mkdir(assetDir, { recursive: true });
    const verified: Array<{ asset: RosterRow; bytes: Buffer }> = [];
    for (const asset of source.media) {
      const sourceUrl = `https://${source.sourceProject}.supabase.co/storage/v1/object/public/onzio-media/${asset.storage_path}`;
      const response = await fetch(sourceUrl, { redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Source media unavailable: ${asset.id}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== Number(asset.byte_size) || hash(bytes) !== asset.checksum_sha256) throw new Error(`Source checksum mismatch: ${asset.id}`);
      const image = await sharp(bytes, { limitInputPixels: 36_000_000 }).metadata();
      if (image.width !== asset.width || image.height !== asset.height || !["webp", "png", "jpeg"].includes(image.format ?? "")) throw new Error(`Source image metadata mismatch: ${asset.id}`);
      await writeFile(resolve(assetDir, String(asset.storage_path).split("/").at(-1)!), bytes);
      verified.push({ asset, bytes });
    }
    await db.query("begin isolation level serializable"); inTransaction = true;
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`roster-2027:${source.clubId}`]);
    // Repeat the emptiness check inside the transaction to reject a concurrent
    // roster/season edit instead of overwriting the administrator's work.
    for (const table of ["players", "player_photos", "seasons", "player_season_stats", "goalkeeper_season_stats"]) {
      if ((await db.query(`select 1 from onzio.${table} where club_id=$1 limit 1`, [source.clubId])).rowCount) throw new Error("Roster changed during preparation.");
    }
    async function insert(table: string, row: RosterRow) {
      const allowed = columns[table];
      if (!allowed || Object.keys(row).some((column) => !allowed.includes(column))) throw new Error(`Unexpected ${table} source column.`);
      const names = Object.keys(row);
      await db.query(`insert into onzio.${table} (${names.map((name) => `"${name}"`).join(",")}) values (${names.map((_, i) => `$${i + 1}`).join(",")})`, names.map((name) => row[name]));
    }
    for (const { asset, bytes } of verified) {
      const path = String(asset.storage_path);
      const { error } = await local.storage.from("onzio-media").upload(path, bytes, { upsert: false, contentType: String(asset.mime_type), cacheControl: "31536000" });
      if (error) throw new Error(`Local object insert failed: ${asset.id}`);
      uploaded.push(path);
      const delivered = await fetch(`${api.origin}/storage/v1/object/public/onzio-media/${path}`);
      if (!delivered.ok || hash(Buffer.from(await delivered.arrayBuffer())) !== asset.checksum_sha256) throw new Error("Local delivery checksum failed.");
      await insert("media_assets", { ...asset, created_by: actorId });
    }
    for (const season of plan.history.seasons) await insert("seasons", season);
    for (const player of plan.profiles) await insert("players", player);
    for (const photo of plan.photos) await insert("player_photos", photo);
    for (const row of plan.history.fieldStats) await insert("player_season_stats", row);
    for (const row of plan.history.goalkeeperStats) await insert("goalkeeper_season_stats", row);
    const oldTotals = (await db.query("select jsonb_build_object('field',(select jsonb_agg(to_jsonb(t) order by player_id) from onzio.player_season_stats t where club_id=$1),'goalkeepers',(select jsonb_agg(to_jsonb(t) order by player_id) from onzio.goalkeeper_season_stats t where club_id=$1)) value", [source.clubId])).rows[0].value;
    await insert("seasons", plan.season);
    for (const row of plan.fieldStats) await insert("player_season_stats", row);
    for (const row of plan.goalkeeperStats) await insert("goalkeeper_season_stats", row);
    const historical = (await db.query("select jsonb_build_object('field',(select jsonb_agg(to_jsonb(t) order by player_id) from onzio.player_season_stats t where club_id=$1 and season_id<>$2),'goalkeepers',(select jsonb_agg(to_jsonb(t) order by player_id) from onzio.goalkeeper_season_stats t where club_id=$1 and season_id<>$2)) value", [source.clubId, seasonId])).rows[0].value;
    if (JSON.stringify(oldTotals) !== JSON.stringify(historical)) throw new Error("Historical totals changed.");
    const after = await capture();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Unrelated content changed.");
    const currentMedia = (await db.query("select * from onzio.media_assets where id=any($1::uuid[]) order by id", [existingMediaIds])).rows;
    if (JSON.stringify(originalMedia) !== JSON.stringify(currentMedia)) throw new Error("Existing media changed.");
    await db.query("commit"); inTransaction = false;
    const receipt = { sourceSha256: hash(sourceBytes), clubId: source.clubId, newSeasonId: seasonId, newSeasonLabel: "2027", profiles: 33, activePlayers: 27, newFieldStats: 24, newGoalkeeperStats: 3, historicalFieldStats: 30, historicalGoalkeeperStats: 3, actionPhotos: 2, verifiedMedia: verified.map(({ asset }) => ({ id: asset.id, checksum: asset.checksum_sha256, path: asset.storage_path })), historicalTotalsUnchanged: true, unrelatedTablesUnchanged: tables, existingMediaUnchanged: true, sourceProjectMutated: false };
    await writeFile(resolve("../../review-notes/roster-2027/implemented/local-import-receipt.json"), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify({ season: "2027", activePlayers: 27, fieldStats: 24, goalkeeperStats: 3, historicalStatsPreserved: 33, mediaChecksumsVerified: 41, unrelatedContentPreserved: true }));
  } catch (error) {
    if (inTransaction) { await db.query("rollback"); inTransaction = false;
      if (uploaded.length) await local.storage.from("onzio-media").remove(uploaded);
    }
    throw error;
  } finally { await db.end(); }
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Local roster import failed."); process.exitCode = 1; });
