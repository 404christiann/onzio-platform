/**
 * RC2027-INJURY-REPORT: write the Injury Report's local sample content to the isolated local Rose City
 * rehearsal only. Christian decided (2026-11-04) that the entries are made-up samples tied to three
 * Roster players; they are local seed data only and the owner replaces them in Admin → Injury Report.
 * The photo band reuses Home's "match photograph 3" record, so nothing is uploaded or copied. The MVMNT
 * CULTR logo file is missing, so the logo slot stays empty and the page shows the partner's name.
 */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { cinematicInjuryReportContentSchema, starterCinematicInjuryReportContent } from "../lib/cinematic-injury-report-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const BAND = "02d0a76d-cd50-57da-a3d1-201da376c2be"; // Home slideshow, "Rose City FC match photograph 3" (Sam's band photo)
const id = (n: number) => `1a0e7e00-2027-4000-8000-${String(n).padStart(12, "0")}`;
const SAMPLES = [
  { number: 4, name: "Chris Martinez", injury: "Hamstring strain", timeline: "2–3 weeks", note: "Felt tightness in training and was rested as a precaution." },
  { number: 7, name: "Edgardo Artero", injury: "Ankle sprain", timeline: "Day-to-day", note: "Will be assessed before the next home match." },
  { number: 9, name: "Aidan Apodaca", injury: "Groin tightness", timeline: "1 week", note: "" },
] as const;

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
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the isolated Rose City test tenant.");
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Expected a published cinematic@2 design.");
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version='20261112180000'")).rowCount, "Apply the Injury Report migration first.");
    assert((await db.query("select 1 from onzio.media_assets where club_id=$1 and id=$2 and status='published' and deleted_at is null and media_kind='photograph'", [clubId, BAND])).rowCount,
      "The reused band photo must be a published local photograph.");
    const players: string[] = [];
    for (const sample of SAMPLES) {
      const row = (await db.query("select id from onzio.players where club_id=$1 and number=$2 and name=$3 and active", [clubId, sample.number, sample.name])).rows;
      assert.equal(row.length, 1, `Expected one active Roster player #${sample.number} ${sample.name}.`);
      players.push(row[0].id as string);
    }
    const starter = starterCinematicInjuryReportContent();
    const content = cinematicInjuryReportContentSchema.parse({
      ...starter,
      page: {
        ...starter.page,
        quote: "Our goal at MVMNT CULTR is to get every athlete back on the field stronger than before. Sample quote: the owner replaces this text in the admin portal.",
        quoteAttribution: "MVMNT CULTR rehab team",
        bandAlt: "Rose City FC player dribbling the ball during a night match",
      },
      bandAssetId: BAND,
      entries: SAMPLES.map((sample, index) => ({ id: id(index + 1), playerId: players[index], injury: sample.injury, timeline: sample.timeline, note: sample.note })),
    });

    await db.query("begin");
    try {
      const protectedTables = ["homepage_revamp_content", "homepage_slideshow_photos", "players", "media_assets", "cinematic_partners_content", "cinematic_news_articles"] as const;
      const capture = async () => {
        const result: string[] = [];
        for (const table of protectedTables) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${table} t where club_id=$1`, [clubId])).rows[0].digest);
        return result;
      };
      const before = await capture();
      assert(!(await db.query("select 1 from onzio.cinematic_injury_report_content where club_id=$1", [clubId])).rowCount,
        "Injury Report content already exists (an owner may have edited it); refusing to overwrite it.");
      await db.query("insert into onzio.cinematic_injury_report_content(club_id,content,presenter_logo_media_asset_id,band_media_asset_id) values($1,$2::jsonb,$3,$4)",
        [clubId, JSON.stringify(content.page), content.presenterLogoAssetId, content.bandAssetId]);
      for (const [index, entry] of content.entries.entries()) {
        await db.query("insert into onzio.cinematic_injury_entries(club_id,id,sort_order,player_id,injury,timeline,note) values($1,$2,$3,$4,$5,$6,$7)",
          [clubId, entry.id, index, entry.playerId, entry.injury, entry.timeline, entry.note]);
      }
      assert(isDeepStrictEqual(await capture(), before), "Existing content changed during Injury Report setup.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, sampleEntries: content.entries.length, bandReused: BAND, logo: null, uploads: 0, existingContentPreserved: true }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local Injury Report setup failed."); process.exitCode = 1; });
