import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const version = "20261112090000";
const name = "cinematic_national_anthem_destination";
const destination = "https://forms.gle/tAezhCRdXH1Z1bMR7";
const expectedTryouts = "https://docs.google.com/forms/d/1qs_nBHqzLAISgW-B-f2i5Ep5leScHDTHODKf-Bbir0M/viewform?edit_requested=true";
const expectedMedia = "https://forms.gle/jG5yF7kjhC93MLsA6";

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
    await db.query("begin");
    try {
      const club = (await db.query("select slug,kind from onzio.clubs where id=$1", [clubId])).rows[0];
      assert(club?.slug === "rose-city" && club.kind === "test", "Expected the isolated Rose City test tenant.");
      const design = (await db.query("select d.template_id,d.template_version from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [clubId])).rows[0];
      assert(design?.template_id === "cinematic" && design.template_version === 2, "Expected a published cinematic@2 design.");
      const before = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1 for update", [clubId])).rows[0]?.content;
      assert(before, "Rose City homepage content is missing.");
      const current = before.navigation?.destinations;
      assert(current?.tryouts === expectedTryouts && current?.mediaCredentials === expectedMedia, "The existing form destinations differ from the approved links.");
      assert(current.nationalAnthem === undefined || current.nationalAnthem === destination, "An owner set a different National Anthem destination.");

      const applied = await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version]);
      if (!applied.rowCount) {
        const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, "utf8");
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
      }
      const changed = current.nationalAnthem !== destination;
      if (changed) {
        const updated = await db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{navigation,destinations,nationalAnthem}',to_jsonb($1::text),true) where club_id=$2 and content=$3::jsonb returning content", [destination, clubId, JSON.stringify(before)]);
        assert(updated.rowCount === 1, "Homepage content changed concurrently.");
      }
      const after = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0]?.content;
      assert(after?.navigation?.destinations?.nationalAnthem === destination, "National Anthem destination did not persist.");
      const beforeRest = structuredClone(before);
      const afterRest = structuredClone(after);
      delete beforeRest.navigation.destinations.nationalAnthem;
      delete afterRest.navigation.destinations.nationalAnthem;
      assert(isDeepStrictEqual(afterRest, beforeRest), "Other homepage content changed.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, migrationApplied: !applied.rowCount, destinationSaved: changed, otherHomepageContentPreserved: true }));
    } catch (error) { await db.query("rollback"); throw error; }
  } finally { await db.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local National Anthem setup failed."); process.exitCode = 1; });
