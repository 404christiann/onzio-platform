import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { Client } from "pg";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";
import { cinematicShopContentSchema, APPROVED_SHOP_MAP_CROP, EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { shopSectionSchema, shopPurchaseSchema } from "@/lib/shop-editor/contract";

async function main() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""), connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "55321" || connection.hostname !== "127.0.0.1" || connection.port !== "55322") throw new Error("Only isolated local55321/55322 allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7", actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
  const db = client.schema("onzio"), club = await db.from("clubs").select("slug,kind").eq("id", clubId).single();
  if (club.error || club.data.slug !== "rose-city" || club.data.kind !== "test") throw new Error("Expected Rose City test tenant.");
  const protectedTables = ["homepage_revamp_content", "homepage_hero_content", "homepage_slideshow_photos", "homepage_slideshow_settings", "behind_the_rose_section", "about_page_content", "club_logo_page_content", "site_branding", "site_sponsor_logos", "site_social_links", "matches", "cinematic_tickets_content"];
  const capture = async () => Object.fromEntries(await Promise.all(protectedTables.map(async table => {
    const result = await db.from(table).select("*").eq("club_id", clubId); if (result.error) throw new Error(`Cannot protect ${table}`); return [table, result.data];
  })));
  const before = await capture();
  const beforeHome = await Promise.all(["shop_kit_section", "shop_kit_photos"].map(async table => {
    const result = await db.from(table).select("*").eq("club_id", clubId).eq("surface", "home"); if (result.error) throw new Error("Cannot protect homepage kit"); return result.data;
  }));
  const pg = new Client({ connectionString: connection.href }); await pg.connect();
  const assertEmpty = async () => {
    for (const table of ["shop_kit_section", "shop_kit_photos", "shop_carousel_photos", "shop_purchase_details", "cinematic_shop_content"]) {
      const result = await pg.query(`select count(*)::int as n from onzio.${table} where club_id=$1${["shop_kit_section", "shop_kit_photos"].includes(table) ? " and surface='shop'" : ""}`, [clubId]);
      if (result.rows[0].n !== 0) throw new Error(`Shop content exists in ${table}; refusing overwrite.`);
    }
  };
  await assertEmpty();
  const manifest = JSON.parse(await readFile("assets/rose-city-shop-2027/manifest.json", "utf8"));
  const published: Record<string, { assetId: string; url: string; path: string; checksum: string }> = {};
  try {
    for (const [slot, input] of Object.entries(manifest.assets) as [string, { inputPath: string; sha256: string; mimeType: string; kind: "photo" | "graphic" }][]) {
      const bytes = await readFile(input.inputPath), hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== input.sha256) throw new Error(`Unreviewed source ${slot}`);
      const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: input.mimeType, size: bytes.length, kind: input.kind } });
      const hex = createHash("sha256").update(`rose-city-shop:${slot}:${hash}`).digest("hex"), uploadId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const stagingPath = buildStoragePath({ clubId, surface: "shop", assetId: uploadId, extension: validated.extension });
      const upload = await client.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
      if (upload.error) throw new Error(`Cannot stage ${slot}`);
      const result = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "shop", kind: input.kind, fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
      if (result.idempotent) await client.storage.from("onzio-upload-staging").remove([stagingPath]);
      const response = await fetch(result.publicUrl); if (!response.ok) throw new Error(`Unavailable publication ${slot}`);
      const deliveredHash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
      const asset = await db.from("media_assets").select("checksum_sha256").eq("club_id", clubId).eq("id", result.assetId).single();
      if (asset.error || deliveredHash !== asset.data.checksum_sha256) throw new Error(`Delivered checksum mismatch ${slot}`);
      published[slot] = { assetId: result.assetId, url: result.publicUrl, path: result.storagePath, checksum: deliveredHash };
    }
    const source = JSON.parse(await readFile("../../review-notes/shop-2027/legacy-public-shop.json", "utf8"));
    const sections = Object.fromEntries(["home", "away"].map(variant => {
      const old = source.shop_kit_section.find((item: { surface: string; kit_variant: string }) => item.surface === "shop" && item.kit_variant === variant);
      if (!old) throw new Error(`Missing original ${variant} kit`);
      return [variant, shopSectionSchema.parse({ eyebrow: `Rose City FC match ${variant} 2027`, title: variant === "home" ? "City of Roses" : "Thorn Edition", description: old.description.replace(/\s+/g, " ").trim(), bullet_points: old.bullet_points, store_note: old.store_note, cta_label: "Buy Now", cta_link: old.cta_link })];
    }));
    const purchase = shopPurchaseSchema.parse({ heading: "Jersey details", cards: [
      { label: "What’s included", title: "Match jersey package", body: "Authentic home jersey, any name and number, league patch, sponsor, and raffle ticket entry." },
      { label: "Make it personal", title: "Customize the jersey", body: "Add your favorite name and number or any player on the roster." },
      { label: "Available at", title: "Niky’s Sports Pasadena", body: "Official Soccer Shop of Rose City Futbol Club.\n33 E Colorado Blvd, Pasadena, CA" },
      { label: "Purchase options", title: "Online or in-store", body: "Order through nikys-sports.com or visit the Pasadena location to customize in store." },
    ], cta_eyebrow: "Ready to order", cta_text: "Buy online now or stop by Niky’s Sports in Pasadena.", cta_label: "Buy Now", cta_link: source.shop_purchase_details[0].cta_link });
    const presentation = cinematicShopContentSchema.parse({ ...EMPTY_CINEMATIC_SHOP_CONTENT, mapAssetId: published.map.assetId, mapAlt: "Line 187 on E Colorado Blvd, Niky’s Sports, Chick-fil-A, Pasadena City College, and the walking route along S Bonnie Ave to Robinson Stadium and Parking Lot No. 5", mapVisible: true, mapCrop: APPROVED_SHOP_MAP_CROP, sponsorsHeading: "Powered by our partners", sponsorsVisible: true, galleryLabel: "Rose City jersey views" });
    await pg.query("begin");
    try {
      await pg.query("select pg_advisory_xact_lock(734901281),pg_advisory_xact_lock(734901283)");
      await assertEmpty();
      for (const variant of ["home", "away"]) {
        const section = sections[variant];
        await pg.query("insert into onzio.shop_kit_section(club_id,surface,kit_variant,eyebrow,title,description,bullet_points,store_note,cta_label,cta_link) values($1,'shop',$2,$3,$4,$5,$6,$7,$8,$9)", [clubId, variant, section.eyebrow, section.title, section.description, JSON.stringify(section.bullet_points), section.store_note, section.cta_label, section.cta_link]);
        const lead = published[`${variant}Lead`];
        await pg.query("insert into onzio.shop_kit_photos(club_id,surface,kit_variant,url,media_asset_id,sort_order) values($1,'shop',$2,$3,$4,0)", [clubId, variant, lead.url, lead.assetId]);
        for (let i = 1; i <= 6; i++) { const photo = published[`${variant}Row${i}`]; await pg.query("insert into onzio.shop_carousel_photos(club_id,kit_variant,url,media_asset_id,sort_order) values($1,$2,$3,$4,$5)", [clubId, variant, photo.url, photo.assetId, i - 1]); }
      }
      await pg.query("insert into onzio.shop_purchase_details(club_id,heading,cards,cta_eyebrow,cta_text,cta_label,cta_link) values($1,$2,$3,$4,$5,$6,$7)", [clubId, purchase.heading, JSON.stringify(purchase.cards), purchase.cta_eyebrow, purchase.cta_text, purchase.cta_label, purchase.cta_link]);
      const { mapAssetId, ...content } = presentation;
      await pg.query("insert into onzio.cinematic_shop_content(club_id,content,map_media_asset_id) values($1,$2,$3)", [clubId, JSON.stringify(content), mapAssetId]);
      await pg.query("commit");
    } catch (error) { await pg.query("rollback"); throw error; }
    if (JSON.stringify(await capture()) !== JSON.stringify(before)) throw new Error("Unrelated content changed.");
    const afterHome = await Promise.all(["shop_kit_section", "shop_kit_photos"].map(async table => (await db.from(table).select("*").eq("club_id", clubId).eq("surface", "home")).data));
    if (JSON.stringify(afterHome) !== JSON.stringify(beforeHome)) throw new Error("Homepage shop feature changed.");
    await writeFile("assets/rose-city-shop-2027/local-import-receipt.json", JSON.stringify({ localOnly: true, clubId, media: published, sections, purchase, presentation, protectedContentPreserved: true, homepageKitPreserved: true, hostedWrites: false }, null, 2) + "\n");
    console.log(JSON.stringify({ localOnly: true, publishedMedia: Object.keys(published).length, deliveredChecksums: Object.keys(published).length, protectedContentPreserved: true, homepageKitPreserved: true, hostedWrites: false }));
  } finally { await pg.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Shop import failed"); process.exitCode = 1; });
