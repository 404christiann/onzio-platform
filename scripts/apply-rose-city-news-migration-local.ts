/** Apply the RC2027-NEWS migration to the isolated local Rose City rehearsal only. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const MIGRATIONS = [
  ["20261105010000", "cinematic_news"],
] as const;

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  const applied: string[] = [];
  try {
    for (const [version, name] of MIGRATIONS) {
      if (only && only !== version) continue;
      if ((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount) continue;
      const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, "utf8");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
        await db.query("commit");
        applied.push(version);
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }
    console.log(JSON.stringify({ localOnly: true, applied, hostedWrites: false }));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local migration failed."); process.exitCode = 1; });
