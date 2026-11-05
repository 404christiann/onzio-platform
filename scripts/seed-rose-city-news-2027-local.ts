/** RC2027-NEWS: publish Sam's Foothill Transit article to the isolated local Rose City rehearsal only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import WebSocket from "ws";
import { newsArticleContentSchema, newsSlug } from "@/lib/cinematic-news";
import { validateMediaUpload } from "@/lib/media-validation";
import { publishAuthorizedMedia } from "@/lib/media-processing";
import { buildStoragePath } from "@/lib/storage-path";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BUNDLE = "assets/rose-city-news-2027";

/** Sam's article, word for word. Friday, Nov 20, 2026 at 12:00 PM Pacific (Christian, 2026-11-04). */
const PUBLISHED_AT = "2026-11-20T20:00:00.000Z";
const FOOTHILL = newsArticleContentSchema.parse({
  category: "sponsor-partner",
  cardHeading: "Foothill Transit",
  title: "Foothill Transit becomes Official Front of Jersey Sponsor of RCFC",
  subtitle: "Official Front of Jersey Sponsor for the 2027 Season",
  coverAlt: "Six Rose City FC lockers, each with a black Foothill Transit home jersey",
  paragraphs: [
    "Rose City FC announce sponsorship with Foothill Transit, becoming the new 'Official Front of Jersey Partner of RCFC' for the 2027 Season.",
    "\"We are grateful for the support and the involvement in our Club and Community that Foothill Transit has shown,\" said RCFC GM Samuel Whitworth. \"We are excited for this amazing partnership and look forward to doing great things together in 2027. Partnerships within our community not only help fuel the team, but also make RCFC home games free to watch for Pasadena Unified School District (PUSD) students and staff.”",
    "The First team’s home jersey, away jersey, and training kit will feature the Foothill Transit logo front and center. The updated home jersey, away jersey and training kit will debut next season before the club's season kickoff March 2027. In addition, all players and technical staff will wear it during official team training sessions and pre-game warm-ups throughout the 2027 Season.",
    "Foothill Transit will be presenting partner on select RCFC content. Together, will be raffling off free bus passes every home game in-stadium to fans throughout the season. Commuting with Foothill Transit.",
  ],
  actionLabel: "Partner with us",
  actionHref: "/community/partnership",
});

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
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.club_id=s.club_id and d.id=s.published_document_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Rose City is not on cinematic@2.");
    const existing = (await db.query("select count(*)::int as count from onzio.cinematic_news_articles where club_id=$1", [clubId])).rows[0].count;
    assert(existing === 0, "News already has articles. Edit them in Admin → News instead.");

    // Publish the cover through the normal validation, staging and media pipeline.
    const manifest = JSON.parse(await readFile(`${BUNDLE}/manifest.json`, "utf8"));
    const input = manifest.assets.foothillCover as { inputPath: string; sha256: string };
    const bytes = await readFile(input.inputPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert(digest === input.sha256, "Unreviewed cover input.");
    const storage = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/jpeg", size: bytes.length, kind: "photo" } });
    const hex = createHash("sha256").update(`rose-city-news-2027:foothillCover:${digest}`).digest("hex");
    const uploadId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const stagingPath = buildStoragePath({ clubId, surface: "news", assetId: uploadId, extension: validated.extension });
    const upload = await storage.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
    if (upload.error) throw upload.error;
    const published = await publishAuthorizedMedia({ version: 1, uploadId, clubId, actorId, surface: "news", kind: "photo", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
    if (published.idempotent) await storage.storage.from("onzio-upload-staging").remove([stagingPath]);

    const protectedTables = ["homepage_revamp_content", "about_page_content", "cinematic_contact_content", "cinematic_shop_content", "cinematic_stadium_content", "cinematic_tickets_content", "matches", "site_sponsor_logos"] as const;
    const capture = async () => {
      const rows: Record<string, unknown[]> = {};
      for (const table of protectedTables) rows[table] = (await db.query(`select * from onzio.${table} where club_id=$1 order by 1`, [clubId])).rows;
      return rows;
    };
    const before = await capture();
    const slug = newsSlug(FOOTHILL.title);
    const article = (await db.query(
      "insert into onzio.cinematic_news_articles(club_id,slug,content,cover_media_asset_id,published_at) values($1,$2,$3::jsonb,$4,$5) returning id,slug,revision",
      [clubId, slug, JSON.stringify(FOOTHILL), published.assetId, PUBLISHED_AT])).rows[0];
    assert(isDeepStrictEqual(await capture(), before), "An unrelated content row changed.");
    const receipt = {
      localOnly: true, clubId,
      article: { id: article.id, slug: article.slug, url: `/news/${article.slug}`, publishedAt: PUBLISHED_AT },
      cover: { assetId: published.assetId, url: published.publicUrl, path: published.storagePath },
      otherContentPreserved: true, hostedWrites: false,
    };
    await writeFile(`${BUNDLE}/local-import-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "News seed failed."); process.exitCode = 1; });
