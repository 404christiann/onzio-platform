/** RC2027-POLICIES: write Sam's Stadium Guidelines and Fan Code of Conduct rows to the isolated local Rose City rehearsal only. */
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { cinematicPolicyContentSchema } from "../lib/cinematic-policies-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const version = "20261105020000";

// Every row in Sam's references, in his order, including his second, empty "Animals" row
// (Christian, 2026-11-04: include all of the sections; the owner edits them in the admin portal).
// Only Accessibility and Animals have answers. Fan Code repeats the rows, as Sam's file does.
const firstSeedRows = [
  { id: "accessibility", heading: "Accessibility", blocks: [
    { kind: "subheading", text: "Parking" },
    { kind: "paragraph", text: "ADA parking is located within Robinson Stadium. Those wishing to park within accessible locations must present a valid ADA placard while parked." },
    { kind: "subheading", text: "Seating" },
    { kind: "paragraph", text: "Accessible seating options are available throughout all areas and price levels of Robinson Stadium." },
  ] },
  { id: "animals", heading: "Animals", blocks: [{ kind: "paragraph", text: "Robinson Stadium has a no-pet policy." }] },
  { id: "bags-and-backpacks", heading: "Bags & Backpacks", blocks: [] },
  { id: "box-office", heading: "Box Office Location & Times", blocks: [] },
  { id: "cameras-and-video", heading: "Cameras/Video Equipment", blocks: [] },
];
const rows = [...firstSeedRows, { id: "animals-2", heading: "Animals", blocks: [] }];
const pages = (pageRows: typeof rows) => cinematicPolicyContentSchema.parse({
  guidelines: { title: "Stadium Guidelines", subtitle: "& FAQ’s", heading: "Guidelines", rows: pageRows },
  fanCode: { title: "Fan Code of Conduct", subtitle: "& FAQ’s", heading: "Code of Conduct", rows: pageRows },
});
const content = pages(rows);
// The five-row seed written earlier on 2026-11-04 is replaced; any other stored content is the owner's.
const firstSeed = pages(firstSeedRows);

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
    assert((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount, "Apply the policies migration first (scripts/apply-rose-city-policies-migration-local.ts).");
    await db.query("begin");
    try {
      const protectedTables = ["homepage_revamp_content", "cinematic_stadium_content", "cinematic_contact_content", "cinematic_tickets_content"] as const;
      const capture = async () => {
        const result: string[] = [];
        for (const table of protectedTables) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${table} t`)).rows[0].digest);
        return result;
      };
      const before = await capture();
      const existing = (await db.query("select content from onzio.cinematic_policy_content where club_id=$1", [clubId])).rows[0];
      const replacesFirstSeed = isDeepStrictEqual(existing?.content, firstSeed);
      assert(!existing || replacesFirstSeed || isDeepStrictEqual(existing.content, content), "Owner policy content differs; refusing to overwrite it.");
      if (!existing) await db.query("insert into onzio.cinematic_policy_content(club_id,content) values($1,$2::jsonb)", [clubId, JSON.stringify(content)]);
      if (replacesFirstSeed) await db.query("update onzio.cinematic_policy_content set content=$2::jsonb where club_id=$1", [clubId, JSON.stringify(content)]);
      assert(isDeepStrictEqual(await capture(), before), "Other content changed during the policies seed.");
      const saved = (await db.query("select content from onzio.cinematic_policy_content where club_id=$1", [clubId])).rows[0];
      assert(isDeepStrictEqual(saved?.content, content), "Policy content did not persist.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, policiesSeeded: !existing || replacesFirstSeed, rowsPerPage: rows.length, otherContentPreserved: true }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local policies seed failed."); process.exitCode = 1; });
