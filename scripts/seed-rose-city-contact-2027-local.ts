import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";
import { cinematicContactContentSchema } from "../lib/cinematic-contact-content";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const version = "20261112080000";
const name = "cinematic_contact_page";
const content = cinematicContactContentSchema.parse({
  title: "Contact us", subtitle: "Get in touch",
  rows: {
    media: { prompt: "Media inquiries & requests", action: "Media" },
    tryouts: { prompt: "Try out for RCFC", action: "Tryouts" },
    tickets: { prompt: "Ticket questions & order information", action: "Tickets" },
    information: { prompt: "General questions", action: "Information" },
    partnerships: { prompt: "Interested in becoming a sponsor or partner?", action: "Partnerships" },
  },
  informationHref: "",
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
    await db.query("begin");
    try {
      const protectedTables = ["homepage_revamp_content", "contact_profile", "contact_page_content"] as const;
      const capture = async () => {
        const result: string[] = [];
        for (const table of protectedTables) result.push((await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${table} t`)).rows[0].digest);
        return result;
      };
      const before = await capture();
      const applied = await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version]);
      if (!applied.rowCount) {
        const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, "utf8");
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
      }
      const existing = (await db.query("select content from onzio.cinematic_contact_content where club_id=$1", [clubId])).rows[0];
      assert(!existing || isDeepStrictEqual(existing.content, content), "Owner Contact content differs; refusing to overwrite it.");
      if (!existing) await db.query("insert into onzio.cinematic_contact_content(club_id,content) values($1,$2::jsonb)", [clubId, JSON.stringify(content)]);
      const after = await capture();
      assert(isDeepStrictEqual(after, before), "Existing content changed during Contact setup.");
      const saved = (await db.query("select content from onzio.cinematic_contact_content where club_id=$1", [clubId])).rows[0];
      assert(isDeepStrictEqual(saved?.content, content), "Contact source copy did not persist.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, migrationApplied: !applied.rowCount, contactSeeded: !existing, existingContentPreserved: true }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local Contact setup failed."); process.exitCode = 1; });
