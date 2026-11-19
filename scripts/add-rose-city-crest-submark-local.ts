/** Append Sam's Sub-mark feature (card 7) to the existing local Rose City Crest page. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";
import { logoContentSchema } from "@/lib/about-editor/contract";

const BUNDLE = "assets/rose-city-crest-2027/submark";
const FEATURE = {
  title: "Sub-Mark",
  description: "RCFC is Rose City Futbol Club abbreviated. Rose City FC’s red Rose outline.",
  icon_size: 56,
  icon_scale: 1,
};

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "55321") throw new Error("Only the isolated loopback rehearsal on 55321 is allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
  const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = client.schema("onzio");
  const club = await db.from("clubs").select("slug,kind").eq("id", clubId).single();
  if (club.error || club.data.slug !== "rose-city" || club.data.kind !== "test") throw new Error("Expected the existing Rose City test tenant.");
  const existing = await db.from("club_logo_page_content").select("*").eq("club_id", clubId).single();
  if (existing.error) throw new Error("No Crest content to extend. Run the Crest import first.");
  // Stored image URLs are normalized to site-relative paths, so existing cards are kept as stored.
  const currentFeatures = existing.data.features as { title: string }[];
  if (!Array.isArray(currentFeatures)) throw new Error("Unexpected Crest features shape.");
  if (currentFeatures.some(feature => /sub-?mark/i.test(feature.title))) throw new Error("The Crest page already has a Sub-Mark feature. Edit it in the Logo editor instead.");

  const protectedTables = ["about_page_content", "homepage_revamp_content", "site_branding", "homepage_hero_content"];
  const capture = async () => Object.fromEntries(await Promise.all(protectedTables.map(async table => {
    const result = await db.from(table).select("*").eq("club_id", clubId);
    if (result.error) throw result.error;
    return [table, result.data];
  })));
  const before = await capture();

  const manifest = JSON.parse(await readFile(`${BUNDLE}/manifest.json`, "utf8"));
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

  const added = logoContentSchema.shape.features.element.parse({ ...FEATURE, patch_url: published.patch7.url, icon_url: published.icon7.url });
  const features = [...currentFeatures, added];
  if (features.length > 24) throw new Error("The Crest page allows at most 24 features.");
  // Matching updated_at makes this fail instead of overwriting an editor save made since the read.
  const update = await db.from("club_logo_page_content").update({ features, updated_at: new Date().toISOString() })
    .eq("club_id", clubId).eq("updated_at", existing.data.updated_at).select("features").maybeSingle();
  if (update.error) throw update.error;
  if (!update.data) throw new Error("The Crest page changed while this ran. Nothing was appended; run it again.");

  const after = await capture();
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("An unrelated content row changed.");
  await writeFile(`${BUNDLE}/local-import-receipt.json`, JSON.stringify({ localOnly: true, clubId, media: published, appended: { ...FEATURE, position: features.length }, featuresBefore: currentFeatures.length, featuresAfter: features.length, otherContentPreserved: true, hostedWrites: false }, null, 2) + "\n");
  console.log(JSON.stringify({ localOnly: true, publishedMedia: Object.keys(published).length, featuresBefore: currentFeatures.length, featuresAfter: features.length, otherContentPreserved: true, hostedWrites: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Sub-mark import failed"); process.exitCode = 1; });
