/** Apply only this reviewed migration to the isolated rehearsal; never reset. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";

async function main() {
  const connection = new URL(process.env.SUPABASE_DB_URL ?? ""), api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (connection.hostname !== "127.0.0.1" || connection.port !== "55322" || api.hostname !== "127.0.0.1" || api.port !== "55321" || api.protocol !== "http:" || [...connection.searchParams.keys()].some(k => ["host", "hostaddr", "service", "servicefile"].includes(k))) throw new Error("Only the isolated 55321/55322 runtime is allowed.");
  if (!process.argv.includes("--execute-local")) throw new Error("Pass --execute-local.");
  const db = new Client({ connectionString: connection.href }); await db.connect();
  try {
    const club = (await db.query("select kind,slug from onzio.clubs where id=$1", ["32ceba0b-4e25-52c2-bb6b-d82fb87637a7"])).rows[0];
    if (club?.kind !== "test" || club?.slug !== "rose-city") throw new Error("Expected the isolated Rose City test tenant.");
    const correction = process.argv.includes("--restaurant-correction");
    const version = correction ? "20261112050000" : "20261112040000";
    const name = correction ? "cinematic_visitor_restaurant_photograph" : "cinematic_chick_fil_a_and_stadium_pages";
    if ((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount) throw new Error("Migration already recorded; refusing to apply twice.");
    const tables: string[] = (await db.query("select tablename from pg_catalog.pg_tables where schemaname='onzio' order by tablename")).rows.map(r => r.tablename);
    if (tables.some(t => !/^[a-z0-9_]+$/.test(t))) throw new Error("Unexpected table identifier.");
    const capture = async () => {
      const result: Record<string, string> = {};
      for (const t of tables) result[t] = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from onzio.${t} t`)).rows[0].digest;
      return result;
    };
    const before = await capture();
    const sql = await readFile(`supabase/migrations/${version}_${name}.sql`, "utf8");
    await db.query("begin");
    try {
      await db.query(sql);
      if (JSON.stringify(before) !== JSON.stringify(await capture())) throw new Error("Existing content changed during migration.");
      await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    await writeFile(`/private/tmp/rose-city-visitor-pages-migration-${version}-receipt.json`, JSON.stringify({ localOnly: true, version, migrationSha256: createHash("sha256").update(sql).digest("hex"), existingTableDigests: before, existingContentPreserved: true }, null, 2));
    console.log(JSON.stringify({ localOnly: true, version, protectedExistingTables: tables.length, existingContentPreserved: true }));
  } finally { await db.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Local migration failed"); process.exitCode = 1; });
