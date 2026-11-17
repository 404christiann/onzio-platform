/**
 * RC2027-PARTNERS: write Sam's approved Club Partners and Partnership Opportunities copy and the seven
 * partners to the isolated local Rose City rehearsal only. Every logo is an existing published media
 * record (Sponsors carousel, Homepage/branding and Schedule), so nothing is uploaded or copied.
 * MVMNT CULTR has no logo yet and shows the accepted "Original logo pending" label.
 */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { cinematicPartnersContentSchema, starterCinematicPartnersContent } from "../lib/cinematic-partners-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const LOGOS = {
  foothill: "a87a65e8-dc9a-4e95-89f0-f085c1340e07", // branding, horizontal blue Foothill Transit
  nikys: "4a5a42f3-5f93-5f08-aa13-5cae9cf15fe2", // Sponsors carousel
  tepito: "d9d73bca-a45e-5fe0-ad84-403e1dcfe086", // Sponsors carousel
  chickfila: "14448e60-1719-52c2-ad5a-652533e7592d", // Schedule, red Chick-fil-A E. Colorado Blvd
  packshot: "2ff517e3-ac9e-5c73-ae8b-5a3d1a3c7ed4", // Sponsors carousel, white artwork
  woodmen: "e02895ff-bab6-5788-ade2-edb2d5491947", // Sponsors carousel, colour artwork
} as const;
const id = (n: number) => `5c0a7e00-2027-4000-8000-${String(n).padStart(12, "0")}`;
const prompt = "Interested in becoming a sponsor or partner?";

const content = cinematicPartnersContentSchema.parse({
  pages: {
    partners: {
      ...starterCinematicPartnersContent().pages.partners,
      intro: "We are proud to collaborate with amazing partners who share our commitment to excellence, community engagement, and the beautiful game.",
      ctaPrompt: prompt, ctaLabel: "Partnerships",
    },
    opportunities: {
      ...starterCinematicPartnersContent().pages.opportunities,
      intro: "We are proud to collaborate with amazing partners who share our commitment to excellence, community engagement, and the beautiful game. Interested in becoming a sponsor for your business? RCFC has several partnership opportunities and ways to get involved. Whether you’re looking for company activation, having your company logo on our weekly newsletter or on a 20-foot banner, we have something for everyone.",
      ctaPrompt: prompt, ctaLabel: "Partnerships", ctaHref: "",
    },
  },
  partners: [
    { id: id(1), name: "Foothill Transit", role: "Main partner & front of jersey sponsor", logoAssetId: LOGOS.foothill, tone: "original" },
    { id: id(2), name: "Niky’s Sports", role: "Front of short sponsor & official team gear supplier", logoAssetId: LOGOS.nikys, tone: "original" },
    { id: id(3), name: "Tepito Coffee", role: "Sleeve of jersey sponsor & official coffee partner", logoAssetId: LOGOS.tepito, tone: "original" },
    { id: id(4), name: "Chick-fil-A Pasadena", role: "Official gameday food & beverage partner", logoAssetId: LOGOS.chickfila, tone: "original" },
    { id: id(5), name: "The Packshot Agency", role: "Official marketing partner", logoAssetId: LOGOS.packshot, tone: "grey" },
    { id: id(6), name: "Modern Woodmen", role: "Official financial partner", logoAssetId: LOGOS.woodmen, tone: "original" },
    { id: id(7), name: "MVMNT CULTR", role: "Official sports recovery partner", logoAssetId: null, tone: "original" },
  ],
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
    assert(club?.slug === "rose-city" && club.kind === "test", "Expected the isolated Rose City test tenant.");
    const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [clubId])).rows[0];
    assert(design?.template_id === "cinematic" && design.template_version === 2, "Expected a published cinematic@2 design.");
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version='20261112170000'")).rowCount, "Apply the Partners migration first.");
    const logos = (await db.query("select id from onzio.media_assets where club_id=$1 and id=any($2::uuid[]) and status='published' and deleted_at is null and media_kind='graphic'", [clubId, Object.values(LOGOS)])).rows;
    assert.equal(logos.length, Object.values(LOGOS).length, "Every reused logo must be a published local graphic.");
    await db.query("begin");
    try {
      const protectedTables = ["homepage_revamp_content", "site_sponsor_logos", "media_assets", "cinematic_contact_content", "cinematic_shop_content"] as const;
      const capture = async () => {
        const result: string[] = [];
        for (const table of protectedTables) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${table} t where club_id=$1`, [clubId])).rows[0].digest);
        return result;
      };
      const before = await capture();
      const existing = (await db.query("select 1 from onzio.cinematic_partners_content where club_id=$1", [clubId])).rowCount;
      assert(!existing, "Partners content already exists (an owner may have edited it); refusing to overwrite it.");
      await db.query("insert into onzio.cinematic_partners_content(club_id,content) values($1,$2::jsonb)", [clubId, JSON.stringify({ pages: content.pages })]);
      for (const [index, row] of content.partners.entries()) {
        await db.query("insert into onzio.cinematic_partners(club_id,id,sort_order,name,role,logo_media_asset_id,logo_tone) values($1,$2,$3,$4,$5,$6,$7)",
          [clubId, row.id, index, row.name, row.role, row.logoAssetId, row.tone]);
      }
      assert(isDeepStrictEqual(await capture(), before), "Existing content changed during Partners setup.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, partners: content.partners.length, logosReused: logos.length, uploads: 0, existingContentPreserved: true }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local Partners setup failed."); process.exitCode = 1; });
