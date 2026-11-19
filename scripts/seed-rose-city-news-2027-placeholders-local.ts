/**
 * RC2027-NEWS: add placeholder articles for the four other News categories to the isolated local
 * Rose City rehearsal only, so /news shows all five cards from Sam's reference. The text is
 * placeholder copy (Christian, 2026-11-04) for the owner to replace in Admin → News. Each card uses
 * its own copy of the locker cover, as Sam's reference does.
 */
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
import { publishWithReservation } from "@/scripts/lib/publish-with-reservation";
import { buildStoragePath } from "@/lib/storage-path";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BUNDLE = "assets/rose-city-news-2027";
const FOOTHILL_SLUG = "foothill-transit-becomes-official-front-of-jersey-sponsor-of-rcfc";
const COVER_ALT = "Six Rose City FC lockers, each with a black Foothill Transit home jersey";

/** In Sam's order under the Foothill card. Each is older than the last so the list numbers them 2 to 5. */
const PLACEHOLDERS = [
  {
    key: "community",
    publishedAt: "2026-11-18T20:00:00.000Z",
    content: {
      category: "community",
      cardHeading: "Foothill Transit",
      title: "Win free Foothill Transit bus passes at every RCFC home game",
      subtitle: "A bus pass raffle for fans at Robinson Stadium all season",
      coverAlt: COVER_ALT,
      paragraphs: [
        "Rose City FC and Foothill Transit will raffle free bus passes to fans at every home game of the 2027 season.",
        "Look for the Foothill Transit table on the concourse before kickoff to enter. Winners are announced at halftime.",
        "Taking the bus to Robinson Stadium is an easy way to get to the game, and it helps keep matchday traffic down around the neighborhood.",
      ],
      actionLabel: "See home games",
      actionHref: "/schedule",
    },
  },
  {
    key: "partner",
    publishedAt: "2026-11-16T20:00:00.000Z",
    content: {
      category: "partner",
      cardHeading: "Chick-fil-A",
      title: "Chick-fil-A joins RCFC as an Official Partner",
      subtitle: "Partner for the 2027 Season",
      coverAlt: COVER_ALT,
      paragraphs: [
        "Rose City FC welcomes Chick-fil-A as an Official Partner for the 2027 season.",
        "Fans can look forward to matchday giveaways and family activities at Robinson Stadium throughout the year.",
        "Partnerships within our community help fuel the team and keep RCFC home games free to watch for Pasadena Unified School District students and staff.",
      ],
      actionLabel: "Partner with us",
      actionHref: "/community/partnership",
    },
  },
  {
    key: "news",
    publishedAt: "2026-11-13T20:00:00.000Z",
    content: {
      category: "news",
      cardHeading: "Tepito Coffee",
      title: "Tepito Coffee is brewing at Robinson Stadium this season",
      subtitle: "Matchday coffee from a local favorite",
      coverAlt: COVER_ALT,
      paragraphs: [
        "Tepito Coffee is coming to Robinson Stadium for the 2027 season.",
        "Find their cart near the main entrance on matchdays for coffee before kickoff and at halftime.",
      ],
      actionLabel: "",
      actionHref: "",
    },
  },
  {
    key: "new-player",
    publishedAt: "2026-11-10T20:00:00.000Z",
    content: {
      category: "new-player",
      cardHeading: "Welcome Mendez",
      title: "RCFC Welcomes Nick Mendez",
      subtitle: "A new signing for the 2027 Season",
      coverAlt: COVER_ALT,
      paragraphs: [
        "Rose City FC is excited to welcome Nick Mendez to the First team for the 2027 season.",
        "Mendez joins the squad ahead of preseason training and will be at Robinson Stadium when the season kicks off in March 2027.",
        "Please join us in welcoming Nick to the Rose City family.",
      ],
      actionLabel: "Meet the roster",
      actionHref: "/roster",
    },
  },
] as const;

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const articles = PLACEHOLDERS.map(item => ({ ...item, content: newsArticleContentSchema.parse(item.content), slug: newsSlug(item.content.title) }));
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  try {
    const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the local Rose City test tenant.");
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.club_id=s.club_id and d.id=s.published_document_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Rose City is not on cinematic@2.");
    const slugs = (await db.query("select slug from onzio.cinematic_news_articles where club_id=$1", [clubId])).rows.map(row => row.slug as string);
    assert(isDeepStrictEqual(slugs, [FOOTHILL_SLUG]), "Expected only the Foothill article. Edit articles in Admin → News instead.");

    const manifest = JSON.parse(await readFile(`${BUNDLE}/manifest.json`, "utf8"));
    const input = manifest.assets.foothillCover as { inputPath: string; sha256: string };
    const bytes = await readFile(input.inputPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert(digest === input.sha256, "Unreviewed cover input.");
    const storage = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket } });
    const validated = await validateMediaUpload({ bytes, metadata: { fileName: basename(input.inputPath), mimeType: "image/jpeg", size: bytes.length, kind: "photo" } });

    // One cover asset per article, so replacing one card's photo never retires another card's.
    const covers: Record<string, string> = {};
    for (const article of articles) {
      const hex = createHash("sha256").update(`rose-city-news-2027:placeholder:${article.key}:${digest}`).digest("hex");
      const uploadId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      const stagingPath = buildStoragePath({ clubId, surface: "news", assetId: uploadId, extension: validated.extension });
      const upload = await storage.storage.from("onzio-upload-staging").upload(stagingPath, bytes, { contentType: validated.mimeType, upsert: true });
      if (upload.error) throw upload.error;
      const published = await publishWithReservation({ version: 1, uploadId, clubId, actorId, surface: "news", kind: "photo", fileName: basename(input.inputPath), mimeType: validated.mimeType, claimedSize: bytes.length, stagingPath, expiresAt: Date.now() + 60000 });
      if (published.idempotent) await storage.storage.from("onzio-upload-staging").remove([stagingPath]);
      covers[article.key] = published.assetId;
    }

    const protectedTables = ["homepage_revamp_content", "about_page_content", "cinematic_contact_content", "cinematic_shop_content", "cinematic_stadium_content", "cinematic_tickets_content", "matches", "site_sponsor_logos"] as const;
    const capture = async () => {
      const rows: Record<string, unknown[]> = {};
      for (const table of protectedTables) rows[table] = (await db.query(`select * from onzio.${table} where club_id=$1 order by 1`, [clubId])).rows;
      rows.foothill = (await db.query("select * from onzio.cinematic_news_articles where club_id=$1 and slug=$2", [clubId, FOOTHILL_SLUG])).rows;
      return rows;
    };
    const before = await capture();
    const inserted = [];
    await db.query("begin");
    try {
      for (const article of articles) {
        inserted.push((await db.query(
          "insert into onzio.cinematic_news_articles(club_id,slug,content,cover_media_asset_id,published_at) values($1,$2,$3::jsonb,$4,$5) returning id,slug",
          [clubId, article.slug, JSON.stringify(article.content), covers[article.key], article.publishedAt])).rows[0]);
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
    assert(isDeepStrictEqual(await capture(), before), "An unrelated content row changed.");
    const receipt = {
      localOnly: true, clubId, placeholderText: true,
      articles: inserted.map((row, index) => ({ id: row.id, url: `/news/${row.slug}`, category: articles[index].content.category, publishedAt: articles[index].publishedAt, coverAssetId: covers[articles[index].key] })),
      otherContentPreserved: true, hostedWrites: false,
    };
    await writeFile(`${BUNDLE}/local-placeholder-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "News placeholder seed failed."); process.exitCode = 1; });
