/** RC2027-HOME-UPDATE: Sam's Oct 31 footer sub-mark and Home jersey copy, local Rose City rehearsal only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import WebSocket from "ws";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BUNDLE = "assets/rose-city-home-update-2027";
/** The approved 2027 Home seed copy; anything else means an owner already edited it. */
const PREVIOUS_JERSEY = {
  description: "Represent the city of Pasadena with the red Rose City FC “City of Roses” jersey. Be part of the team and represent Pasadena with us. Personalize your Rose City FC jersey with your own name and number. You are who we play for!",
  bullet_points: ["Authentic match jersey", "Any name & number", "League patch", "Team sponsor", "Raffle ticket included"],
  store_note: "Sold exclusively at Niky’s Sports\n33 E Colorado Blvd, Pasadena, CA",
};
/** Sam's Oct 31 Home copy as written ("City of the Roses" awaits Sam's confirmation). */
const JERSEY = {
  description: "Represent the city of Pasadena with the Authentic Rose City FC “City of the Roses” edition match home jersey. Be part of team history and personalize your RCFC jersey with any name and number. We are proud to represent the Pasadena community and thank you for your generous support.",
  bullet_points: ["Authentic RCFC match jersey", "RCFC 3D Silicon & Satin Crest", "Any name & number", "Team sponsors", "League patch", "20% off season tickets", "2x home game tickets", "2x halftime raffle tickets", "Custom RCFC x Foothill Transit jersey box"],
  store_note: "",
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
    const revamp = (await db.query("select content,footer_logo_media_asset_id from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0];
    assert(revamp, "Rose City homepage content is missing.");
    assert(revamp.footer_logo_media_asset_id === null, "A footer logo is already set. Change it in the Homepage editor instead.");
    const jersey = (await db.query("select id,description,bullet_points,store_note from onzio.shop_kit_section where club_id=$1 and surface='home' and kit_variant='home'", [clubId])).rows[0];
    assert(jersey, "The Home jersey section is missing.");
    const jerseyNow = { description: jersey.description, bullet_points: jersey.bullet_points, store_note: jersey.store_note };
    const jerseyAlready = isDeepStrictEqual(jerseyNow, JERSEY);
    assert(jerseyAlready || isDeepStrictEqual(jerseyNow, PREVIOUS_JERSEY), "The Home jersey copy was edited by an owner. Change it in the Shop editor instead.");

    // Publish through the normal validation, staging and media pipeline.
    const manifest = JSON.parse(await readFile(`${BUNDLE}/manifest.json`, "utf8"));
    const input = manifest.assets.footerLogo as { inputPath: string; sha256: string };
    const bytes = await readFile(input.inputPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert(digest === input.sha256, "Unreviewed footer logo input.");
    const storage = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/png", size: bytes.length, kind: "graphic" } });
    const hex = createHash("sha256").update(`rose-city-home-update-2027:footerLogo:${digest}`).digest("hex");
    const uploadId = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const stagingPath = buildStoragePath({ clubId, surface: "homepage", assetId: uploadId, extension: validated.extension });
    const upload = await storage.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
    if (upload.error) throw upload.error;
    const published = await publishWithReservation({ version: 1, uploadId, clubId, actorId, surface: "homepage", kind: "graphic", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
    if (published.idempotent) await storage.storage.from("onzio-upload-staging").remove([stagingPath]);

    const protectedTables = ["about_page_content", "club_logo_page_content", "site_branding", "homepage_hero_content", "matches"];
    const capture = async () => {
      const rows: Record<string, unknown[]> = {};
      for (const table of protectedTables) rows[table] = (await db.query(`select * from onzio.${table} where club_id=$1 order by 1`, [clubId])).rows;
      return rows;
    };
    const before = await capture();
    await db.query("begin");
    try {
      const updated = await db.query(
        "update onzio.homepage_revamp_content set content=content||jsonb_build_object('footerLogo',jsonb_build_object('alt','RCFC')),footer_logo_media_asset_id=$1 where club_id=$2 and footer_logo_media_asset_id is null and content=$3::jsonb returning content",
        [published.assetId, clubId, JSON.stringify(revamp.content)]);
      assert(updated.rowCount === 1, "Homepage content changed concurrently.");
      const afterContent = structuredClone(updated.rows[0].content); delete afterContent.footerLogo;
      const beforeContent = structuredClone(revamp.content); delete beforeContent.footerLogo;
      assert(isDeepStrictEqual(afterContent, beforeContent), "Other homepage content changed.");
      if (!jerseyAlready) {
        const jerseyUpdate = await db.query(
          "update onzio.shop_kit_section set description=$1,bullet_points=$2::jsonb,store_note=$3 where id=$4 and club_id=$5 and description=$6 and store_note=$7 returning id",
          [JERSEY.description, JSON.stringify(JERSEY.bullet_points), JERSEY.store_note, jersey.id, clubId, PREVIOUS_JERSEY.description, PREVIOUS_JERSEY.store_note]);
        assert(jerseyUpdate.rowCount === 1, "The Home jersey section changed concurrently.");
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
    assert(isDeepStrictEqual(await capture(), before), "An unrelated content row changed.");
    const receipt = { localOnly: true, clubId, footerLogo: { assetId: published.assetId, url: published.publicUrl, path: published.storagePath, alt: "RCFC" }, jerseyCopyUpdated: !jerseyAlready, otherContentPreserved: true, hostedWrites: false };
    await writeFile(`${BUNDLE}/local-import-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Home update seed failed."); process.exitCode = 1; });
