/**
 * RC2027-ROBINSON-EDITOR: store Christian's confirmed Robinson Stadium copy and images as the page's starting
 * content in the isolated local Rose City rehearsal only. Each image currently served by the static page
 * (public/rose-city/robinson) is published through the normal media pipeline. The 8978px seating diagram is
 * first resized to the 3000px graphic limit. The partner logo reuses the published logo the page shows today.
 * Re-running is a no-op; owner-edited content is never overwritten.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import sharp from "sharp";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";
import { ROBINSON_IMAGE_SLOTS, robinsonContentSchema, type RobinsonContent, type RobinsonImageSlot } from "@/lib/cinematic-robinson-content";
import { ROBINSON_IMAGE_COLUMNS } from "@/lib/cinematic-robinson-query";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", version = "20261105050000";
const SOURCES: Record<Exclude<RobinsonImageSlot, "partner">, { file: string; sha256: string }> = {
  seating: { file: "seating.jpg", sha256: "809585a4ffa24dee414ab397cc7333feb1e480451ee49d13b7eab8446e9cfcb9" },
  lockers: { file: "lockers.png", sha256: "da057bdc855e605213f78555f5ddd6426d53b2519826661de094673912ca8048" },
  mealPass: { file: "meal-pass.png", sha256: "f364ca694ff24d4bd8e6df061114fa9d2aa2b27dc8d11d09e3f83a97b9913431" },
  step1: { file: "drive-thru.png", sha256: "d54de3bf647f64698c1555e56c228d558835599c6607a2b2010c49f3f8cc1292" },
  step2: { file: "free-ticket.png", sha256: "3d94409b6a6d45cb1bb8f5b5cf39ea390ee3f62cecb27f14dff8f7c00792908b" },
  step3: { file: "enjoy-game.png", sha256: "a4a96dcc8dfdf82752a46d83721e2a4d485fced350304ed7d335a96d2b18399c" },
  bus: { file: "bus.png", sha256: "1af70e9fd4a68946075691f331ac5485397c2941a3f6ff91ccc23ed0b283ddfa" },
  routeMap: { file: "route-map.png", sha256: "d261039b64d7cfc41edcc055121615a42f02c3cdf92847f16e6dd3f5cbdadadf" },
};
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const storage = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the isolated Rose City test tenant.");
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Expected a published cinematic@2 design.");
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount, "Apply the Robinson migration first (scripts/apply-rose-city-robinson-migration-local.ts).");

    const partner = (await db.query("select s.partner_media_asset_id as id from onzio.cinematic_stadium_content s join onzio.media_assets m on m.club_id=s.club_id and m.id=s.partner_media_asset_id where s.club_id=$1 and m.status='published' and m.deleted_at is null and m.surface='homepage' and m.media_kind='graphic'", [clubId])).rows[0]?.id as string | undefined;
    assert(partner, "Expected the published partner logo the page shows today.");
    const assets = { partner } as Record<RobinsonImageSlot, string>;
    const published: Record<string, { width: number; height: number; reused: boolean }> = {};
    for (const [slot, source] of Object.entries(SOURCES) as [Exclude<RobinsonImageSlot, "partner">, { file: string; sha256: string }][]) {
      const original = await readFile(`public/rose-city/robinson/${source.file}`);
      assert.equal(hash(original), source.sha256, `Unreviewed source image for ${slot}.`);
      // The graphic pipeline accepts PNG or WebP up to 3000px; only the seating diagram needs resizing.
      const bytes = slot === "seating" ? await sharp(original).resize({ width: 3000, height: 3000, fit: "inside" }).png({ compressionLevel: 9 }).toBuffer() : original;
      const validated = await validateMediaUpload({ bytes, metadata: { fileName: source.file.replace(/\.jpg$/, ".png"), mimeType: "image/png", size: bytes.length, kind: "graphic" } });
      const hex = hash(`rose-city-robinson-2027:${slot}:${source.sha256}`);
      const uploadId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const stagingPath = buildStoragePath({ clubId, surface: "homepage", assetId: uploadId, extension: validated.extension });
      const already = (await db.query("select 1 from onzio.media_assets where club_id=$1 and id=$2 and status='published'", [clubId, uploadId])).rowCount;
      if (!already) {
        const upload = await storage.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
        if (upload.error) throw upload.error;
      }
      const result = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "homepage", kind: "graphic", fileName: source.file.replace(/\.jpg$/, ".png"), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
      const ledger = (await db.query("select checksum_sha256 from onzio.media_assets where club_id=$1 and id=$2", [clubId, result.assetId])).rows[0];
      const delivered = await fetch(result.publicUrl);
      assert(delivered.ok && hash(Buffer.from(await delivered.arrayBuffer())) === ledger.checksum_sha256, `Delivered bytes do not match the ledger for ${slot}.`);
      assets[slot] = result.assetId;
      published[slot] = { width: result.width, height: result.height, reused: result.idempotent };
    }

    const content: RobinsonContent = structuredClone(robinsonReferenceContent);
    for (const slot of ROBINSON_IMAGE_SLOTS) content.images[slot].assetId = assets[slot];
    robinsonContentSchema.parse(content);
    const stored = { ...content, images: Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => [slot, { alt: content.images[slot].alt }])) };

    await db.query("begin");
    try {
      const protectedTables = ["homepage_revamp_content", "cinematic_stadium_content", "cinematic_chick_fil_a_content", "cinematic_tickets_content", "cinematic_policy_content", "cinematic_partners_content"] as const;
      const capture = async () => {
        const result: string[] = [];
        for (const table of protectedTables) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${table} t`)).rows[0].digest);
        return result;
      };
      const before = await capture();
      const columns = ROBINSON_IMAGE_SLOTS.map(slot => ROBINSON_IMAGE_COLUMNS[slot]);
      const existing = (await db.query(`select content,${columns.join(",")} from onzio.cinematic_robinson_content where club_id=$1`, [clubId])).rows[0];
      const same = existing && isDeepStrictEqual(existing.content, stored) && ROBINSON_IMAGE_SLOTS.every(slot => existing[ROBINSON_IMAGE_COLUMNS[slot]] === assets[slot]);
      assert(!existing || same, "Saved Robinson content differs (owner edits); refusing to overwrite it.");
      if (!existing) {
        const params = [clubId, JSON.stringify(stored), ...ROBINSON_IMAGE_SLOTS.map(slot => assets[slot])];
        await db.query(`insert into onzio.cinematic_robinson_content(club_id,content,${columns.join(",")}) values(${params.map((_, i) => `$${i + 1}`).join(",")})`, params);
      }
      assert(isDeepStrictEqual(await capture(), before), "Other content changed during the Robinson seed.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, robinsonSeeded: !existing, images: published, partnerReused: partner, otherContentPreserved: true, hostedWrites: false }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local Robinson seed failed."); process.exitCode = 1; });
