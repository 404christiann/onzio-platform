import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Client } from "pg";

const clubId = "32ceba0b-4e25-52c2-bb6b-d82fb87637a7";
const migration = "20261112070000";
const destinations = {
  tryouts: "https://docs.google.com/forms/d/1qs_nBHqzLAISgW-B-f2i5Ep5leScHDTHODKf-Bbir0M/viewform?edit_requested=true",
  mediaCredentials: "https://forms.gle/jG5yF7kjhC93MLsA6",
};
const previousDestinations = {
  ...destinations,
  mediaCredentials: "https://docs.google.com/forms/d/1CJPRCLTxsF4fDRjIDaqJQ0lYii7WGsC7qHKpIcsRV-c/viewform?edit_requested=true",
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
    await db.query("begin");
    try {
      const before = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1 for update", [clubId])).rows[0];
      assert(before, "Rose City homepage content is missing.");
      const current = before.content.navigation?.destinations;
      assert(!current || isDeepStrictEqual(current, destinations) || isDeepStrictEqual(current, previousDestinations), "An owner has already set different form destinations.");

      const applied = await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [migration]);
      if (!applied.rowCount) {
        const sql = await readFile(`supabase/migrations/${migration}_cinematic_external_form_destinations.sql`, "utf8");
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [migration, "cinematic_external_form_destinations", [sql]]);
      }

      const updated = await db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{navigation,destinations}',$1::jsonb,true) where club_id=$2 and content=$3::jsonb returning content", [JSON.stringify(destinations), clubId, JSON.stringify(before.content)]);
      assert(updated.rowCount === 1, "Homepage content changed concurrently.");
      const after = updated.rows[0].content;
      assert(isDeepStrictEqual(after.navigation.destinations, destinations), "Form destinations did not persist.");
      const beforeRest = structuredClone(before.content);
      const afterRest = structuredClone(after);
      delete beforeRest.navigation.destinations;
      delete afterRest.navigation.destinations;
      assert(isDeepStrictEqual(afterRest, beforeRest), "Other homepage content changed.");
      await db.query("commit");
      console.log(JSON.stringify({ localOnly: true, clubId, migrationApplied: !applied.rowCount, destinationsSaved: 2, otherHomepageContentPreserved: true }));
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local form setup failed."); process.exitCode = 1; });
