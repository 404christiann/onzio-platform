/** Update only the approved episode poster in the isolated loopback rehearsal. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "55321") throw new Error("Only the isolated loopback rehearsal is allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = client.schema("onzio");
  const before = await db.from("homepage_revamp_content").select("*").eq("club_id", clubId).single();
  if (before.error) throw before.error;
  const manifest = JSON.parse(await readFile("assets/rose-city-2027/manifest.json", "utf8"));
  const input = manifest.assets.episodePoster;
  const bytes = await readFile(input.inputPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== input.sha256 || input.width !== 1280 || input.height !== 720) throw new Error("Unreviewed episode poster.");
  const hex = createHash("sha256").update(`rose-city-2027:asset:episodePoster:${digest}`).digest("hex");
  const uploadId = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
  if (!["30107597-a875-5e4e-a40b-00f330512bf0", uploadId].includes(before.data.episode_poster_media_asset_id)) throw new Error("Poster changed since the reviewed baseline.");
  const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: input.mimeType, size: bytes.length, kind: "photo" } });
  const stagingPath = buildStoragePath({ clubId, surface: "homepage", assetId: uploadId, extension: validated.extension });
  const upload = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
  if (upload.error) throw upload.error;
  const published = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "homepage", kind: "photo", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
  if (published.idempotent) await client.storage.from("onzio-upload-staging").remove([stagingPath]);
  const update = await db.from("homepage_revamp_content").update({ episode_poster_media_asset_id: published.assetId }).eq("club_id", clubId).eq("episode_poster_media_asset_id", before.data.episode_poster_media_asset_id).select("*").single();
  if (update.error) throw update.error;
  for (const key of Object.keys(before.data)) {
    if (["episode_poster_media_asset_id", "updated_at"].includes(key)) continue;
    if (JSON.stringify(before.data[key]) !== JSON.stringify(update.data[key])) throw new Error(`Unexpected content change: ${key}`);
  }
  const receiptPath = "assets/rose-city-2027/local-import-receipt.json";
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.media.episodePoster = { assetId: published.assetId, url: published.publicUrl, path: published.storagePath };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ localOnly: true, scope: "episodePoster", width: published.width, height: published.height, otherContentPreserved: true, hostedWrites: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Poster update failed"); process.exitCode = 1; });
