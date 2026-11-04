/** Narrow publication and atomic insert of the two accepted pages, never hosted. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";
import { chickFilAContentSchema, CHICK_FIL_A_MEDIA_COLUMNS, CHICK_FIL_A_ARTWORK_SLOTS } from "@/lib/chick-fil-a-content";
import { stadiumContentSchema, STADIUM_ARTWORK_SLOTS } from "@/lib/stadium-content";

type Input = { slot?: string; inputPath: string; sha256: string; kind?: "photo" | "graphic"; reuseTicketsSlot?: string };
type Publication = { assetId: string; path: string; checksum: string; width: number; height: number; reused: boolean };
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const pages = [
  { key: "chick-fil-a", folder: "rose-city-chick-fil-a-2027", table: "cinematic_chick_fil_a_content", slots: CHICK_FIL_A_ARTWORK_SLOTS, columns: CHICK_FIL_A_MEDIA_COLUMNS, schema: chickFilAContentSchema, copy: "copy.json" },
  { key: "stadium", folder: "rose-city-stadium-2027", table: "cinematic_stadium_content", slots: STADIUM_ARTWORK_SLOTS, columns: { bus: "bus_media_asset_id", map: "map_media_asset_id", partner: "partner_media_asset_id" }, schema: stadiumContentSchema, copy: "content.json" },
] as const;

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "55321" || connection.hostname !== "127.0.0.1" || connection.port !== "55322" || [...connection.searchParams.keys()].some(k => ["host", "hostaddr", "service", "servicefile"].includes(k))) throw new Error("Only isolated local55321/55322 allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = new Client({ connectionString: connection.href }); await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    if (club?.slug !== "rose-city" || club?.kind !== "test") throw new Error("Expected Rose City test tenant.");
    for (const p of pages) if ((await db.query(`select 1 from onzio.${p.table} where club_id=$1`, [clubId])).rowCount) throw new Error(`${p.key} content exists; refusing overwrite.`);
    const excluded = ["media_assets", "media_cleanup_queue", "audit_events", ...pages.map(p => p.table)];
    const tables: string[] = (await db.query("select tablename from pg_catalog.pg_tables where schemaname='onzio' order by tablename")).rows.map(r => r.tablename).filter(t => !excluded.includes(t));
    if (tables.some(t => !/^[a-z0-9_]+$/.test(t))) throw new Error("Unexpected table identifier.");
    async function capture() {
      const result: Record<string, string> = {};
      for (const t of tables) result[t] = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${t} t`)).rows[0].digest;
      return result;
    }
    const before = await capture();
    const originalMedia = (await db.query("select id,status,deleted_at,checksum_sha256,storage_path from onzio.media_assets order by id")).rows;
    const tickets = (await db.query("select * from onzio.cinematic_tickets_content where club_id=$1", [clubId])).rows[0];
    const ticketsManifest = JSON.parse(await readFile("assets/rose-city-tickets-2027/manifest.json", "utf8"));
    const publications: Record<string, Record<string, Publication>> = {}, contents: Record<string, unknown> = {};
    for (const p of pages) {
      const manifest = JSON.parse(await readFile(`assets/${p.folder}/manifest.json`, "utf8"));
      const inputs: Record<string, Input> = Array.isArray(manifest.assets) ? Object.fromEntries(manifest.assets.map((i: Input) => [i.slot, i])) : manifest.assets;
      publications[p.key] = {};
      for (const slot of p.slots) {
        const input = inputs[slot];
        if (!input || !resolve(input.inputPath).startsWith(resolve(`assets/${p.folder}/inputs`) + "/")) throw new Error("Unexpected page input path.");
        const bytes = await readFile(input.inputPath);
        if (hash(bytes) !== input.sha256) throw new Error(`Unreviewed ${p.key} input ${slot}`);
        const kind = slot === "restaurant" ? "photo" : "graphic";
        const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/png", size: bytes.length, kind } });
        const reuseSlot = input.reuseTicketsSlot ?? (slot === "partner" ? "partner" : null);
        const reuseId = reuseSlot && ticketsManifest.assets[reuseSlot]?.sha256 === input.sha256 ? tickets?.[reuseSlot + "_media_asset_id"] : null;
        const existing = reuseId ? (await db.query("select id,storage_path,checksum_sha256,width,height from onzio.media_assets where id=$1 and club_id=$2 and status='published' and deleted_at is null and storage_bucket='onzio-media' and surface='homepage' and media_kind=$3", [reuseId, clubId, kind === "photo" ? "photograph" : "graphic"])).rows[0] : null;
        if (existing) {
          const delivered = await fetch(`${api.origin}/storage/v1/object/public/onzio-media/${existing.storage_path}`);
          if (!delivered.ok || hash(Buffer.from(await delivered.arrayBuffer())) !== existing.checksum_sha256) throw new Error("Existing publication bytes do not match ledger.");
          publications[p.key][slot] = { assetId: existing.id, path: existing.storage_path, checksum: existing.checksum_sha256, width: existing.width, height: existing.height, reused: true };
          continue;
        }
        const hex = hash(`rose-city-visitor:${p.key}:${slot}:${input.sha256}`);
        const uploadId = hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-5" + hex.slice(13, 16) + "-a" + hex.slice(17, 20) + "-" + hex.slice(20, 32);
        const stagingPath = buildStoragePath({ clubId, surface: "homepage", assetId: uploadId, extension: validated.extension });
        const upload = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
        if (upload.error) throw upload.error;
        const result = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "homepage", kind, fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
        if (result.idempotent) await client.storage.from("onzio-upload-staging").remove([stagingPath]);
        const asset = (await db.query("select checksum_sha256,width,height from onzio.media_assets where club_id=$1 and id=$2", [clubId, result.assetId])).rows[0];
        const delivered = await fetch(result.publicUrl);
        if (!delivered.ok || hash(Buffer.from(await delivered.arrayBuffer())) !== asset.checksum_sha256) throw new Error(`Delivered checksum mismatch ${p.key}/${slot}`);
        publications[p.key][slot] = { assetId: result.assetId, path: result.storagePath, checksum: asset.checksum_sha256, width: asset.width, height: asset.height, reused: false };
      }
      const content = p.schema.parse(JSON.parse(await readFile(`assets/${p.folder}/${p.copy}`, "utf8")));
      for (const slot of p.slots) (content.artwork as Record<string, { assetId: string | null }>)[slot].assetId = publications[p.key][slot].assetId;
      contents[p.key] = p.schema.parse(content);
    }
    await db.query("begin");
    try {
      if (JSON.stringify(before) !== JSON.stringify(await capture())) throw new Error("Existing content changed; refusing insertion.");
      for (const p of pages) {
        const content = structuredClone(contents[p.key]) as { artwork: Record<string, { assetId?: string | null; alt: string }> };
        for (const slot of p.slots) delete content.artwork[slot].assetId;
        const columns = p.slots.map(s => (p.columns as Record<string, string>)[s]);
        const params = [clubId, JSON.stringify(content), ...p.slots.map(s => publications[p.key][s].assetId)];
        await db.query(`insert into onzio.${p.table}(club_id,content,${columns.join(",")}) values(${params.map((_, i) => "$" + (i + 1)).join(",")})`, params);
      }
      if (JSON.stringify(before) !== JSON.stringify(await capture())) throw new Error("Unrelated content changed.");
      const currentMedia = (await db.query("select id,status,deleted_at,checksum_sha256,storage_path from onzio.media_assets where id=any($1::uuid[]) order by id", [originalMedia.map(m => m.id)])).rows;
      if (JSON.stringify(originalMedia) !== JSON.stringify(currentMedia)) throw new Error("Existing media identities changed.");
      await db.query("commit");
    } catch (e) { await db.query("rollback"); throw e; }
    await writeFile("/private/tmp/rose-city-visitor-pages-import-receipt.json", JSON.stringify({ localOnly: true, clubId, media: publications, content: contents, protectedExistingTables: before, existingMediaPreserved: true }, null, 2));
    console.log(JSON.stringify({ localOnly: true, references: Object.values(publications).reduce((n, p) => n + Object.keys(p).length, 0), newlyPublished: Object.values(publications).flatMap(p => Object.values(p)).filter(a => !a.reused).length, existingContentAndMediaPreserved: true }));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : "Visitor page publication failed"); process.exitCode = 1; });
