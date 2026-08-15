// Lions FC league standings — hosted PRODUCTION seeder.
//
// Hosted counterpart to scripts/seed-lions-standings-local.ts, whose header
// says seeding a hosted project "is a separate, human-run decision and needs
// its own reviewed script". This is that script. Both read their data from
// lib/migration/lions-standings.ts, so the table cannot drift between them.
//
// ONE MODE, and it makes zero hosted mutations:
//   --prepare-sql   reads production to report what would change, then writes
//                   a single reviewable `do $$ ... $$` SQL file. A human
//                   applies it with `supabase db query --linked --file`.
//                   This script never executes SQL, exactly like
//                   scripts/import-lions-production.ts.
//
// SCOPE: THE NINE DATA ROWS ONLY. This script does not write
// league_standings_settings — the eyebrow/title/intro are club-editable via
// /admin/standings, and an earlier version of this script upserted them,
// which silently reverted Christian's own heading on its first production
// run. Any script that writes club-editable copy reverts the club's edits on
// every execution, and this one is expected to run routinely. Data here,
// wording in the admin.
//
// DELIBERATELY WEAKER GUARDS THAN THE CONTENT IMPORT, and the difference
// matters. scripts/import-lions-production.ts asserts the full provisioned
// fingerprint (tier=starter, lifecycle=onboarding, public_access=preview) and
// refuses to run once club_subscriptions exists, because it is a one-shot
// pre-billing operation that must never replay over a live tenant. Standings
// are the opposite: they are updated every time the league table moves, most
// of that after Lions goes live. Asserting lifecycle or billing state here
// would break this script permanently the moment real Stripe checkout flips
// the club to active/live. So the identity assertion is restricted to the
// three things that are genuinely immutable for this tenant -- id, slug and
// name -- which is still enough to guarantee the writes land on the right
// club on the right project.
//
// PRUNING. Any league_standings row for this club whose id is not in the
// current set is deleted, matching the local seeder. Row ids derive from the
// team name, so renaming a team produces a new row and strands the old one;
// without the prune, the table would silently accumulate ghosts. The prune is
// always scoped to this club_id, is reported before it is generated, and is
// visible in the SQL for review.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
// LIONS_STANDINGS_SETTINGS is deliberately NOT imported: this script must not
// be able to write the club-editable heading copy even by accident.
import {
  LIONS_STANDINGS,
  lionsStandingRowId,
} from "@/lib/migration/lions-standings";

const PROJECT_REF = "ioalthwsdrlzrubomrow";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const TARGET_TENANT_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";
const EXPECTED_CLUB_SLUG = "lions";
const EXPECTED_CLUB_NAME = "Lions Football Club";

const BOOLEAN_FLAGS = new Set(["confirm-production", "prepare-sql"]);
const VALUE_FLAGS = new Set(["sql-out"]);

type ServiceClient = SupabaseClient<any, any, any, any, any>;

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}.`);
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      result[key] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(
        `Unknown flag ${arg}. Booleans: ${[...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(", ")}. Value flags: ${[...VALUE_FLAGS].map((flag) => `--${flag}`).join(", ")}.`,
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlInt(value: number): string {
  if (!Number.isInteger(value)) throw new Error(`Expected an integer, got ${value}.`);
  return String(value);
}

/**
 * Digest over the exact rows being written. Used as the audit dedupe key, so
 * replaying an unchanged table writes no second audit row, while a genuine
 * table update does.
 *
 * Covers the rows ONLY, deliberately. The heading copy is no longer written
 * by this script (see buildStandingsSql), so folding it in would make an
 * admin heading edit look like a standings change and write a spurious audit
 * row for content this script did not touch.
 */
export function standingsDigest(): string {
  return sha256(JSON.stringify({ rows: LIONS_STANDINGS }));
}

export function buildStandingsSql(staleIds: readonly string[]): string {
  const seededIds = LIONS_STANDINGS.map((row) => lionsStandingRowId(row.team_name));
  const digest = standingsDigest();

  // Note the `target.club_id = <tenant>` guard on each DO UPDATE below.
  // Standing row ids derive from the team name alone, so the same team has
  // the same id on local, staging and production. Within one project that is
  // only a problem if two Lions tenants coexist — which is exactly what a
  // loopback rehearsal creates. Without the guard, a colliding id would
  // update the OTHER club's row (the update set deliberately omits club_id,
  // so it cannot steal the row) and silently insert nothing for this tenant.
  // With it, a foreign row is left untouched and the conflict is a visible
  // no-op instead of silent cross-tenant mutation.
  const rowStatements = LIONS_STANDINGS.map((row, index) => {
    const id = lionsStandingRowId(row.team_name);
    return `insert into onzio.league_standings as target (id, club_id, team_name, played, wins, draws, losses, goal_difference, points, is_club, sort_order, updated_at) values (${sqlText(id)}::uuid, ${sqlText(TARGET_TENANT_ID)}::uuid, ${sqlText(row.team_name)}, ${sqlInt(row.played)}, ${sqlInt(row.wins)}, ${sqlInt(row.draws)}, ${sqlInt(row.losses)}, ${sqlInt(row.goal_difference)}, ${sqlInt(row.points)}, ${row.is_club ? "true" : "false"}, ${sqlInt(index)}, now()) on conflict (id) do update set team_name = excluded.team_name, played = excluded.played, wins = excluded.wins, draws = excluded.draws, losses = excluded.losses, goal_difference = excluded.goal_difference, points = excluded.points, is_club = excluded.is_club, sort_order = excluded.sort_order, updated_at = now() where target.club_id = ${sqlText(TARGET_TENANT_ID)}::uuid and (target.team_name, target.played, target.wins, target.draws, target.losses, target.goal_difference, target.points, target.is_club, target.sort_order) is distinct from (excluded.team_name, excluded.played, excluded.wins, excluded.draws, excluded.losses, excluded.goal_difference, excluded.points, excluded.is_club, excluded.sort_order);`;
  });

  // Scoped to this club AND to ids outside the current set. Written from the
  // seeded id list rather than from the pre-flight read, so the SQL is
  // self-contained and stays correct even if a row is added between the read
  // and the apply.
  const pruneStatement = `delete from onzio.league_standings where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid and id not in (${seededIds.map((id) => `${sqlText(id)}::uuid`).join(", ")});`;

  // NO league_standings_settings statement, deliberately. The heading copy is
  // club-editable through /admin/standings, and on 2026-08-15 the first
  // production run of this script silently reverted a heading Christian had
  // set there — because an upsert of club-editable copy overwrites the club's
  // edit every single time it runs. Standings are re-seeded routinely as the
  // table moves, so that was structural, not a one-off. The split is now
  // absolute: this script owns the nine data rows, the admin owns all
  // wording. The receipt below still REPORTS the settings row so an operator
  // can see it exists; it never writes it.
  const statements = [...rowStatements, pruneStatement];

  return `do $lions_standings$
declare
  v_owner uuid;
begin
  -- Identity only: id, slug and name. Deliberately NOT lifecycle, tier or
  -- public_access -- see this file's header. This script must keep working
  -- after Lions goes live.
  if not exists (
    select 1 from onzio.clubs
    where id = ${sqlText(TARGET_TENANT_ID)}::uuid
      and slug = ${sqlText(EXPECTED_CLUB_SLUG)}
      and name = ${sqlText(EXPECTED_CLUB_NAME)}
  ) then
    raise exception 'Lions standings target tenant mismatch';
  end if;
  select user_id into strict v_owner from onzio.club_members
    where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid and role = 'owner' and status = 'active';
  ${statements.join("\n  ")}
  if not exists (
    select 1 from onzio.audit_events
    where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid
      and operation = 'lions_standings_seed'
      and payload @> ${sqlText(`{"standings_digest":"${digest}"}`)}::jsonb
  ) then
    insert into onzio.audit_events
      (club_id, actor_user_id, actor_type, operation, resource_type, resource_id, payload)
    values
      (${sqlText(TARGET_TENANT_ID)}::uuid, v_owner, 'migration',
       'lions_standings_seed', 'club', ${sqlText(TARGET_TENANT_ID)},
       ${sqlText(`{"standings_digest":"${digest}","destination":"production","rows":${LIONS_STANDINGS.length}}`)}::jsonb);
  end if;
end
$lions_standings$;
select jsonb_build_object(
  'tenant_id', ${sqlText(TARGET_TENANT_ID)},
  'standings_digest', ${sqlText(digest)},
  'league_standings', (select count(*) from onzio.league_standings where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid),
  'settings', (select count(*) from onzio.league_standings_settings where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid),
  'club_row_flagged', (select count(*) from onzio.league_standings where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid and is_club),
  'table_order', (select jsonb_agg(team_name order by sort_order) from onzio.league_standings where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid),
  'seed_audits', (select count(*) from onzio.audit_events where club_id = ${sqlText(TARGET_TENANT_ID)}::uuid and operation = 'lions_standings_seed')
) as lions_standings_result;
${staleIds.length > 0 ? `-- Pre-flight saw ${staleIds.length} stale row(s) that the prune above will delete.\n` : ""}`;
}

async function assertHostedTarget(service: ServiceClient) {
  const { data: club, error: clubError } = await service
    .schema("onzio")
    .from("clubs")
    .select("id, slug, name")
    .eq("id", TARGET_TENANT_ID)
    .single();
  if (clubError) throw clubError;
  if (club.slug !== EXPECTED_CLUB_SLUG || club.name !== EXPECTED_CLUB_NAME) {
    throw new Error(
      `Production club ${TARGET_TENANT_ID} is not the Lions tenant (found slug "${club.slug}", name "${club.name}").`,
    );
  }

  const { count: ownerCount, error: ownerError } = await service
    .schema("onzio")
    .from("club_members")
    .select("user_id", { count: "exact", head: true })
    .eq("club_id", TARGET_TENANT_ID)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownerError) throw ownerError;
  if (ownerCount !== 1) {
    throw new Error(
      `The production Lions tenant must have exactly one active owner; found ${ownerCount}.`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["confirm-production"] !== true) {
    throw new Error("Lions standings production execution requires --confirm-production.");
  }
  if (args["prepare-sql"] !== true) {
    throw new Error("--prepare-sql is required; this script has no execute mode.");
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret?.startsWith("sb_secret_")) {
    throw new Error("The active production sb_secret key is required in process memory.");
  }

  const service = createClient(PROJECT_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });

  await assertHostedTarget(service);

  // Read-only pre-flight, so the operator sees what the prune will remove
  // before reading the SQL rather than discovering it in the diff.
  const seededIds = new Set(LIONS_STANDINGS.map((row) => lionsStandingRowId(row.team_name)));
  const { data: existing, error: existingError } = await service
    .schema("onzio")
    .from("league_standings")
    .select("id, team_name")
    .eq("club_id", TARGET_TENANT_ID);
  if (existingError) throw existingError;
  const stale = (existing ?? []).filter((row) => !seededIds.has(row.id));

  const sql = buildStandingsSql(stale.map((row) => row.id));
  const sqlOut = typeof args["sql-out"] === "string"
    ? resolve(args["sql-out"])
    : resolve("/private/tmp/lions-standings-production.sql");
  await writeFile(sqlOut, sql, { mode: 0o600 });

  console.log(JSON.stringify({
    action: "prepare-sql",
    sqlOut,
    sqlSha256: sha256(sql),
    tenantId: TARGET_TENANT_ID,
    standingsDigest: standingsDigest(),
    rowsToUpsert: LIONS_STANDINGS.length,
    existingRows: existing?.length ?? 0,
    staleRowsToDelete: stale.map((row) => row.team_name),
    hostedMutations: 0,
  }, null, 2));
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith("seed-lions-standings-production.ts");

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { parseArgs };
