/** Apply the RC2027-TICKET-PAGES migrations to the isolated local Rose City rehearsal only. `--dry-run` rolls back. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const MIGRATIONS = [
  ["20261112200000", "cinematic_ticket_pages"],
  ["20261112210000", "cinematic_tickets_menu_labels"],
] as const;

async function main() {
  assert(process.argv.includes("--execute-local"), "Pass --execute-local.");
  const dryRun = process.argv.includes("--dry-run");
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const connection = new URL(process.env.SUPABASE_DB_URL ?? "");
  assert(api.protocol === "http:" && api.hostname === "127.0.0.1" && api.port === "55321", "Only the isolated Rose City API is allowed.");
  assert(connection.hostname === "127.0.0.1" && connection.port === "55322", "Only the isolated Rose City database is allowed.");
  assert(![...connection.searchParams.keys()].some(key => ["host", "hostaddr", "service", "servicefile"].includes(key)), "Connection redirects are not allowed.");
  const db = new Client({ connectionString: connection.href });
  await db.connect();
  const applied: string[] = [];
  try {
    for (const [version, name] of MIGRATIONS) {
      if ((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount) continue;
      const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, "utf8");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
        await db.query(dryRun ? "rollback" : "commit");
        applied.push(version);
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
    }
    console.log(JSON.stringify({ localOnly: true, dryRun, applied, hostedWrites: false }));
  } finally {
    await db.end();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Local migration failed."); process.exitCode = 1; });
