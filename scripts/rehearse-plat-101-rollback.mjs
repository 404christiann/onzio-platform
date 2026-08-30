import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is required");
const target = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error(`Refusing non-local database host: ${target.hostname}`);
}

const rollbackSql = await readFile(
  resolve("docs/phase-12/PLAT-101-ROLLBACK.sql"),
  "utf8",
);
const forwardAuthSql = await readFile(
  resolve(
    "supabase/migrations/20260803192838_plat_101_admin_auth_simplification.sql",
  ),
  "utf8",
);
const forwardInitPlanSql = await readFile(
  resolve(
    "supabase/migrations/20260803192943_plat_101_club_members_initplan.sql",
  ),
  "utf8",
);
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

let rollbackVerified = false;
try {
  await client.query(rollbackSql);
  const rolledBack = await client.query(`
    select
      pg_get_functiondef('onzio_private.can_mutate_content(uuid)'::regprocedure)
        like '%onzio_private.is_aal2()%' as uses_aal2,
      to_regprocedure('onzio_private.is_club_session_fresh()') is null
        as session_helper_removed
  `);
  rollbackVerified = Boolean(
    rolledBack.rows[0]?.uses_aal2 && rolledBack.rows[0]?.session_helper_removed,
  );
  if (!rollbackVerified) throw new Error("Rollback state did not match PLAT-101");
} finally {
  await client.query(forwardAuthSql);
  await client.query(forwardInitPlanSql);
}

const restored = await client.query(`
  select
    pg_get_functiondef('onzio_private.can_mutate_content(uuid)'::regprocedure)
      like '%onzio_private.is_club_session_fresh()%' as uses_fresh_session,
    to_regprocedure('onzio_private.club_session_started_at()') is not null
      as session_helper_restored
`);
await client.end();
const forwardRestored = Boolean(
  restored.rows[0]?.uses_fresh_session &&
    restored.rows[0]?.session_helper_restored,
);
if (!forwardRestored) throw new Error("Forward PLAT-101 state was not restored");

console.log(JSON.stringify({ rollbackVerified, forwardRestored }));
