/** RC2027-SHOP-UPDATE: Sam's Oct 28 Shop copy, sections and route map, local Rose City rehearsal only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import WebSocket from "ws";
import { cinematicShopContentSchema } from "@/lib/cinematic-shop-content";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia, retirePublishedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BUNDLE = "assets/rose-city-shop-update-2027";

/** The approved Oct 13 Shop seed. Anything else means an owner already edited the Shop. */
const PREVIOUS_KIT = {
  title: "City of Roses",
  description: "Represent the city of Pasadena with the red Rose City FC “City of Roses” kit. Be part of the team and represent Pasadena with us. Personalize your Rose City FC jersey with your own name and number. You are who we play for!",
  bullet_points: ["Authentic match jersey", "Any name & number", "League patch", "Team sponsor", "Raffle ticket included"],
  store_note: "Sold exclusively at Niky's Sports\n33 E Colorado Blvd, Pasadena, CA",
};
const PREVIOUS_PURCHASE_HEADING = "Jersey details";

/** Sam's Oct 28 Shop copy, transcribed as written. */
const KIT = {
  title: "City of the Roses",
  description: "Represent the city of Pasadena with the Authentic Rose City FC “City of the Roses” edition match home jersey. Be part of team history and personalize your RCFC jersey with any name and number. We are proud to represent the Pasadena community and thank you for your generous support.",
  bullet_points: ["Authentic RCFC match jersey", "RCFC 3D Silicon & Satin Crest", "Any name & number", "Team sponsors", "League patch", "20% off season tickets", "2x home game tickets", "2x halftime raffle tickets", "Custom RCFC x Foothill Transit jersey box"],
  store_note: "",
};
const PURCHASE = {
  heading: "Jersey information",
  cards: [
    { label: "BTS video of your jersey being customized", title: "Watch it come to life", body: "Select the “Record Jersey Being Customized” option during checkout for a detailed personalized behind the scene video of your RCFC jersey being customized from start to finish. We will share it on the team’s official Instagram & Facebook stories + tag you." },
    { label: "Purchase in store", title: "Niky’s Sports Pasadena", body: "Customize your RCFC “City of the Roses” home jersey exclusively at the Niky’s Sports Pasadena location.\n\nAddress: 1726 E Colorado Blvd, Pasadena, CA 91106" },
    { label: "Shipping with care", title: "Front door delivery", body: "We process and handle each order with love and care. You’ll see our shipping options at checkout." },
    { label: "No returns on custom orders", title: "No returns", body: "Unfortunately, we can’t process returns on custom orders. Be sure you look at the size section below to make sure you order the correct size." },
  ],
  cta_eyebrow: "RCFC thanks you from the bottom of our hearts!",
  cta_text: "By purchasing a Rose City FC jersey, you help fund the team and reach our community one jersey at a time.",
};
const SECTIONS = {
  editions: [
    { label: "Authentic jersey", price: "$115", line: "City of the Roses Authentic RCFC Jersey", link: "" },
    { label: "Replica jersey", price: "$95", line: "City of the Roses Replica RCFC Jersey", link: "" },
  ],
  detailsHeading: "Jersey details",
  details: [
    { title: "Player edition", body: "Our Authentic jersey is the same jersey worn by the RCFC first team players wear during matches, with Nike’s most innovative cooling technology." },
    { title: "3D Silicon & Satin crest", body: "The Rose City FC crest is 3D and made from Silicon & Satin, and sits on the jerseys front left chest. It’s premium, lightweight, flexible, and moves naturally with the jerseys in the most intense matches." },
    { title: "RCFC bespoke numbers", body: "A personalized touch with a custom font. Premium matte numbers with gloss details and the RCFC official sub-mark." },
    { title: "Foothill Transit", body: "Rose City FC’s official front of the jersey sponsor for the 2027 season. The logo is 10” inches in length with a thickness of 600 Microns/23.6 Mils to give the jersey a raised ultra premium look and feel when touched." },
    { title: "Performance fabrics", body: "Magna on the front body and sleeves is a Dri-FIT ADV knit fabric, wicking sweat away from the body, offering breathability where athletes need it most." },
    { title: "Peak breathability", body: "Our Authentic match jersey has Nike Aero-FIT technology designed for maximum breathability. It allows airflow against your skin to help you stay cool when temperatures are high." },
  ].map(tile => ({ alt: "", ...tile })),
  cardIcons: ["video", "jersey", "shipping-box", "no-access"],
  attributes: ["Color: Rose Parade Red", "Authentic design", "100% Polyester", "Machine wash cold", "Dry on low or Air-Dry"],
  sizeChart: {
    heading: "Size chart", columns: ["S", "M", "L", "XL", "XXL"], note: "In inches",
    rows: [
      { label: "Chest (in)", values: ["35 - 37.5", "37.5 - 41", "41 - 44", "44 - 48.5", "48.5 - 53.5"] },
      { label: "Waist (in)", values: ["29 - 32", "32 - 35", "35 - 38", "38 - 43", "43 - 47.5"] },
      { label: "Hip (in)", values: ["35 - 37.5", "37.5 - 41", "41 - 44", "44 - 47", "47 - 50.5"] },
      { label: "Height (in)", values: ["5′7″ - 6′0″", "5′7″ - 6′0″", "5′7″ - 6′0″", "5′7″ - 6′0″", "5′7″ - 6′0″"] },
    ],
  },
  mapHeading: "Map view",
  mapAlt: "Map from the Line 187 bus stop on E Colorado Blvd to Niky’s Sports and Chick-fil-A, then along S Bonnie Ave past Parking Lot No. 5 to Robinson Stadium",
  mapCrop: null,
  mapVisible: true,
};

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the local Rose City test tenant.");
    const kit = (await db.query("select id,title,description,bullet_points,store_note from onzio.shop_kit_section where club_id=$1 and surface='shop' and kit_variant='home'", [clubId])).rows[0];
    assert(kit, "The Shop home kit is missing.");
    assert(isDeepStrictEqual({ title: kit.title, description: kit.description, bullet_points: kit.bullet_points, store_note: kit.store_note }, PREVIOUS_KIT), "The Shop kit copy was edited by an owner. Change it in the Shop editor instead.");
    const purchase = (await db.query("select heading,cards from onzio.shop_purchase_details where club_id=$1", [clubId])).rows[0];
    assert(purchase?.heading === PREVIOUS_PURCHASE_HEADING && purchase.cards.length === 4, "The Shop purchase details were edited by an owner.");
    const shop = (await db.query("select content,map_media_asset_id from onzio.cinematic_shop_content where club_id=$1", [clubId])).rows[0];
    assert(shop && !("editions" in shop.content) && !("details" in shop.content), "The Shop sections were already set. Change them in the Shop editor instead.");
    const oldMap: string | null = shop.map_media_asset_id;

    // Publish the route map through the normal validation, staging and media pipeline.
    const manifest = JSON.parse(await readFile(`${BUNDLE}/manifest.json`, "utf8"));
    const input = manifest.assets.routeMap as { inputPath: string; sha256: string };
    const bytes = await readFile(input.inputPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert(digest === input.sha256, "Unreviewed route map input.");
    const storage = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/png", size: bytes.length, kind: "graphic" } });
    const hex = createHash("sha256").update(`rose-city-shop-update-2027:routeMap:${digest}`).digest("hex");
    const uploadId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const stagingPath = buildStoragePath({ clubId, surface: "shop", assetId: uploadId, extension: validated.extension });
    const upload = await storage.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
    if (upload.error) throw upload.error;
    const published = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "shop", kind: "graphic", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
    if (published.idempotent) await storage.storage.from("onzio-upload-staging").remove([stagingPath]);

    const content = { ...shop.content, ...SECTIONS };
    cinematicShopContentSchema.parse({ ...content, mapAssetId: published.assetId, details: SECTIONS.details.map(tile => ({ assetId: null, ...tile })) });

    const protectedRows = [
      ["homepage_revamp_content", ""], ["about_page_content", ""], ["club_logo_page_content", ""], ["site_branding", ""],
      ["homepage_hero_content", ""], ["matches", ""], ["shop_kit_section", " and not (surface='shop' and kit_variant='home')"], ["shop_carousel_photos", ""], ["shop_kit_photos", ""],
    ] as const;
    const capture = async () => {
      const rows: Record<string, unknown[]> = {};
      for (const [table, filter] of protectedRows) rows[table] = (await db.query(`select * from onzio.${table} where club_id=$1${filter} order by 1`, [clubId])).rows;
      return rows;
    };
    const before = await capture();
    await db.query("begin");
    try {
      const kitUpdate = await db.query(
        "update onzio.shop_kit_section set title=$1,description=$2,bullet_points=$3::jsonb,store_note=$4,updated_at=now() where id=$5 and club_id=$6 and title=$7 and description=$8 returning id",
        [KIT.title, KIT.description, JSON.stringify(KIT.bullet_points), KIT.store_note, kit.id, clubId, PREVIOUS_KIT.title, PREVIOUS_KIT.description]);
      assert(kitUpdate.rowCount === 1, "The Shop kit changed concurrently.");
      const purchaseUpdate = await db.query(
        "update onzio.shop_purchase_details set heading=$1,cards=$2::jsonb,cta_eyebrow=$3,cta_text=$4,updated_at=now() where club_id=$5 and heading=$6 and cards=$7::jsonb returning club_id",
        [PURCHASE.heading, JSON.stringify(PURCHASE.cards), PURCHASE.cta_eyebrow, PURCHASE.cta_text, clubId, PREVIOUS_PURCHASE_HEADING, JSON.stringify(purchase.cards)]);
      assert(purchaseUpdate.rowCount === 1, "The Shop purchase details changed concurrently.");
      const shopUpdate = await db.query(
        "update onzio.cinematic_shop_content set content=$1::jsonb,map_media_asset_id=$2,updated_at=now() where club_id=$3 and content=$4::jsonb and map_media_asset_id is not distinct from $5 returning club_id",
        [JSON.stringify(content), published.assetId, clubId, JSON.stringify(shop.content), oldMap]);
      assert(shopUpdate.rowCount === 1, "The Shop sections changed concurrently.");
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
    assert(isDeepStrictEqual(await capture(), before), "An unrelated content row changed.");
    // The replaced Bus Route crop is no longer referenced; retire it the same way a Shop save does.
    const retired = oldMap && oldMap !== published.assetId ? await retirePublishedMedia({ clubId, actorId, assetId: oldMap }) : null;
    const receipt = {
      localOnly: true, clubId,
      routeMap: { assetId: published.assetId, url: published.publicUrl, path: published.storagePath, replacedMapAssetId: oldMap, replacedMapRetirement: retired },
      kitCopyUpdated: true, jerseyInformationUpdated: true, sectionsAdded: ["editions", "details (no photos)", "cardIcons", "attributes", "sizeChart", "mapHeading"],
      otherContentPreserved: true, hostedWrites: false,
    };
    await writeFile(`${BUNDLE}/local-import-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Shop update seed failed."); process.exitCode = 1; });
