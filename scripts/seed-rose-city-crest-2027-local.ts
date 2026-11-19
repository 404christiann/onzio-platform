/** Publish only the approved Crest page into the existing isolated rehearsal. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";
import { logoContentSchema } from "@/lib/about-editor/contract";

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "55321") throw new Error("Only the isolated loopback rehearsal on 55321 is allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = client.schema("onzio");
  const existing = await db.from("club_logo_page_content").select("club_id").eq("club_id", clubId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("This rehearsal already has Crest content. Refusing to overwrite an editable page.");
  const club = await db.from("clubs").select("slug,kind").eq("id", clubId).single();
  if (club.error || club.data.slug !== "rose-city" || club.data.kind !== "test") throw new Error("Expected the existing Rose City test tenant.");
  const protectedTables = ["about_page_content", "homepage_revamp_content", "site_branding", "homepage_hero_content"];
  const capture = async () => Object.fromEntries(await Promise.all(protectedTables.map(async table => {
    const result = await db.from(table).select("*").eq("club_id", clubId);
    if (result.error) throw result.error;
    return [table, result.data];
  })));
  const before = await capture();
  const manifest = JSON.parse(await readFile("assets/rose-city-crest-2027/manifest.json", "utf8"));
  const published: Record<string, { assetId: string; url: string; path: string }> = {};
  for (const [key, input] of Object.entries(manifest.assets) as [string, { inputPath: string; sha256: string }][]) {
    const bytes = await readFile(input.inputPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== input.sha256) throw new Error(`Unreviewed input: ${key}`);
    const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/png", size: bytes.length, kind: "graphic" } });
    const hex = createHash("sha256").update(`rose-city-crest-2027:${key}:${digest}`).digest("hex");
    const uploadId = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const stagingPath = buildStoragePath({ clubId, surface: "about", assetId: uploadId, extension: validated.extension });
    const upload = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
    if (upload.error) throw upload.error;
    const result = await publishWithReservation({ version: 1, uploadId, clubId, actorId, surface: "about", kind: "graphic", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
    if (result.idempotent) await client.storage.from("onzio-upload-staging").remove([stagingPath]);
    published[key] = { assetId: result.assetId, url: result.publicUrl, path: result.storagePath };
  }
  const copy: { title: string; description: string; size: number }[] = JSON.parse(await readFile("assets/rose-city-crest-2027/copy.json", "utf8"));
  const labels = ["Rose Parade Red", "12AM Midnight", "Faded White", "Rose Stem Green", "Steel", "Parrot"];
  const content = logoContentSchema.parse({ annotated_image_url: published.diagram.url, map_image_url: published.map.url,
    features: copy.map((f, i) => ({ title: f.title, description: f.description, patch_url: published[`patch${i+1}`].url, icon_url: published[`icon${i+1}`].url, icon_size: f.size, icon_scale: 1 })),
    color_cards: labels.map((label, i) => ({ label, image_url: published[`color${i+1}`].url })),
  });
  const insert = await db.from("club_logo_page_content").insert({ club_id: clubId, ...content, annotated_image_asset_id: published.diagram.assetId, map_image_asset_id: published.map.assetId }).select("*").single();
  if (insert.error) throw insert.error;
  const after = await capture();
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("An unrelated content row changed.");
  await writeFile("assets/rose-city-crest-2027/local-import-receipt.json", JSON.stringify({ localOnly: true, clubId, media: published, content, features: 6, colors: 6, otherContentPreserved: true, hostedWrites: false }, null, 2) + "\n");
  console.log(JSON.stringify({ localOnly: true, publishedMedia: Object.keys(published).length, features: content.features.length, colors: content.color_cards.length, otherContentPreserved: true, hostedWrites: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Crest import failed"); process.exitCode = 1; });
