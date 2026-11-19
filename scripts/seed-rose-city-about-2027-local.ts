/** Import only the approved About page into the isolated local rehearsal. */
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { aboutContentSchema } from "@/lib/about-editor/contract";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const sql = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (api.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(api.hostname) || api.port !== "55321" ||
    !["localhost", "127.0.0.1"].includes(sql.hostname) || sql.port !== "55322") throw new Error("Only the isolated loopback rehearsal is allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = client.schema("onzio");
  const club = await db.from("clubs").select("slug,kind").eq("id", clubId).single();
  if (club.error || club.data.slug !== "rose-city" || club.data.kind !== "test") throw new Error("Expected the Rose City test tenant.");
  const existing = await db.from("about_page_content").select("club_id").eq("club_id", clubId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("About already exists; refusing to overwrite an editable page.");
  const protectedTables = ["club_logo_page_content", "homepage_revamp_content", "homepage_hero_content", "site_branding", "seasons", "players", "matches", "shop_kit_section"];
  const capture = async () => Object.fromEntries(await Promise.all(protectedTables.map(async table => {
    const result = await db.from(table).select("*").eq("club_id", clubId);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    return [table, result.data];
  })));
  const before = await capture();
  const bytes = await readFile("assets/rose-city-about-2027/original-photo.webp");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== "00f66a5cab24dbf438831843aa0978f5f76b69d94335271bf80ac3b1ee3b4739") throw new Error("Unreviewed photo bytes.");
  const validated = await validateMediaUpload({ bytes, metadata: { fileName: "original-photo.webp", mimeType: "image/webp", size: bytes.length, kind: "photo" } });
  const uploadId = randomUUID();
  const stagingPath = buildStoragePath({ clubId, surface: "about", assetId: uploadId, extension: validated.extension });
  const staged = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType });
  if (staged.error) throw staged.error;
  const photo = await publishWithReservation({ version: 1, uploadId, clubId, actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", surface: "about", kind: "photo", fileName: "original-photo.webp", mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
  const copy = JSON.parse(await readFile("assets/rose-city-about-2027/copy.json", "utf8"));
  const content = aboutContentSchema.parse({ ...copy, feature_image_url: photo.publicUrl });
  const inserted = await db.from("about_page_content").insert({ club_id: clubId, ...content, feature_image_asset_id: photo.assetId }).select("*").single();
  if (inserted.error) throw inserted.error;
  const after = await capture();
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error("Protected content changed during import.");
  await mkdir("output", { recursive: true });
  await writeFile("output/rose-city-about-local-import.json", JSON.stringify({ localOnly: true, clubId, sourceSha256: sha256, photo, content, protectedContentPreserved: true, hostedWrites: false }, null, 2));
  console.log(JSON.stringify({ localOnly: true, importedAbout: true, publishedPhoto: true, protectedContentPreserved: true, hostedWrites: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error?.message ?? "About import failed")); process.exitCode = 1; });
