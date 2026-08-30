import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { LIONS_LOCAL_TENANT_ID } from "@/lib/migration/lions-media-local-import";

/**
 * Seeds Lions FC's real Spring 2026 Ohio Valley Division table into
 * onzio.league_standings / onzio.league_standings_settings.
 *
 * These nine rows and the surrounding copy were previously hardcoded in
 * components/editorial/EditorialStandingsTable.tsx, which meant the Standings
 * admin page wrote to tables nothing on the public site ever read. That
 * component now reads these tables, so this script carries the existing real
 * numbers across without losing them.
 *
 * This is a data seed, not a schema migration -- both tables already exist
 * (supabase/migrations/20260726000200_phase2_content.sql).
 *
 * LOCAL ONLY. Following the same conventions as
 * scripts/import-lions-media-local.ts and scripts/set-club-store-enabled.ts:
 * dry-run by default, --execute-local --confirm-local required to write, and
 * a loopback-host guard. Unlike set-club-store-enabled.ts there is
 * deliberately no --confirm-project escape hatch: seeding a hosted Supabase
 * project (staging or production) is a separate, human-run decision and needs
 * its own reviewed script.
 *
 * Rerunning is safe: row ids are derived deterministically from the team
 * name, so every run upserts the same nine rows in place, and any other
 * standings row for this club is pruned so the table matches this file
 * exactly.
 *
 * Usage:
 *   npm run seed:lions-standings:local                     # dry run
 *   npm run seed:lions-standings:local -- --execute-local --confirm-local
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const CLUB_SLUG = "lions";

const SETTINGS = {
  eyebrow: "League standings",
  title: "Ohio Valley Division",
  intro: "Current table for Lions Football Club's 2026 campaign.",
};

type SeedRow = {
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goal_difference: number;
  points: number;
  is_club: boolean;
};

/**
 * Real Spring 2026 season data, in the league's published order. `sort_order`
 * is the array index, and EditorialStandingsTable renders by `sort_order`
 * rather than re-deriving positions: the three 5-point sides are separated by
 * the league's own criteria, not by goal difference.
 */
const STANDINGS: SeedRow[] = [
  { team_name: "Lions Football Club", played: 10, wins: 7, draws: 3, losses: 0, goal_difference: 21, points: 24, is_club: true },
  { team_name: "Leal United FC", played: 10, wins: 5, draws: 4, losses: 1, goal_difference: 11, points: 19, is_club: false },
  { team_name: "Columbus Astray", played: 10, wins: 6, draws: 1, losses: 3, goal_difference: 7, points: 19, is_club: false },
  { team_name: "Fut Ohio SC", played: 10, wins: 4, draws: 5, losses: 1, goal_difference: 27, points: 17, is_club: false },
  { team_name: "Indy Gladiators SC", played: 10, wins: 3, draws: 5, losses: 2, goal_difference: 10, points: 14, is_club: false },
  { team_name: "Manu Ledesma Academy", played: 10, wins: 4, draws: 2, losses: 4, goal_difference: 9, points: 8, is_club: false },
  { team_name: "Ohio International FC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -30, points: 5, is_club: false },
  { team_name: "Lightning SC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -27, points: 5, is_club: false },
  { team_name: "Mahoning Trumbull United SC", played: 10, wins: 1, draws: 2, losses: 7, goal_difference: -28, points: 5, is_club: false },
];

function teamSeedSlug(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function standingRowId(teamName: string): string {
  return deterministicUuid(`onzio:lions:standing:${teamSeedSlug(teamName)}`);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(): { execute: boolean } {
  const raw = process.argv.slice(2);
  const unknown = raw.filter(
    (arg) => arg !== "--execute-local" && arg !== "--confirm-local",
  );
  if (unknown.length > 0) {
    throw new Error(`Unexpected argument(s): ${unknown.join(", ")}`);
  }
  const execute = raw.includes("--execute-local");
  const confirm = raw.includes("--confirm-local");
  if (execute !== confirm) {
    throw new Error("Writing requires both --execute-local and --confirm-local.");
  }
  return { execute };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const { execute } = parseArgs();

  const configuredUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const hostname = new URL(configuredUrl).hostname;
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run against non-loopback host "${hostname}". ` +
        "This seed is local-only; a hosted (staging/production) seed must be run deliberately by a human.",
    );
  }

  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey.startsWith("eyJ") && !serviceKey.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY has an unsupported format");
  }

  const onzio = createClient(configuredUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `ws`'s
    // types don't structurally match Supabase's WebSocketLikeConstructor,
    // but this is exactly Supabase's own documented fix for Node < 22.
    realtime: { transport: ws as any },
  }).schema("onzio");

  const { data: club, error: clubError } = await onzio
    .from("clubs")
    .select("id, slug, name")
    .eq("slug", CLUB_SLUG)
    .maybeSingle();
  if (clubError) throw clubError;
  if (!club) throw new Error(`No club found with slug "${CLUB_SLUG}"`);
  if (club.id !== LIONS_LOCAL_TENANT_ID) {
    throw new Error(
      `Club "${CLUB_SLUG}" resolved to ${club.id}, expected the local Lions tenant ${LIONS_LOCAL_TENANT_ID}.`,
    );
  }

  const now = new Date().toISOString();
  const seededRows = STANDINGS.map((row, index) => ({
    id: standingRowId(row.team_name),
    club_id: club.id,
    team_name: row.team_name,
    team_abbreviation: null,
    logo_url: null,
    logo_asset_id: null,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goal_difference: row.goal_difference,
    points: row.points,
    is_club: row.is_club,
    sort_order: index,
    updated_at: now,
  }));
  const seededIds = new Set(seededRows.map((row) => row.id));

  const { data: existing, error: existingError } = await onzio
    .from("league_standings")
    .select("id, team_name")
    .eq("club_id", club.id);
  if (existingError) throw existingError;
  const staleRows = (existing ?? []).filter((row) => !seededIds.has(row.id));

  process.stdout.write(
    `${JSON.stringify(
      {
        event: execute ? "lions.standings_seed" : "lions.standings_seed_dry_run",
        club: { id: club.id, slug: club.slug, name: club.name },
        settings: SETTINGS,
        rowsToUpsert: seededRows.length,
        existingRows: existing?.length ?? 0,
        staleRowsToDelete: staleRows.map((row) => row.team_name),
      },
      null,
      2,
    )}\n`,
  );

  if (!execute) {
    process.stdout.write(
      "\nDry run only — no write performed. Re-run with:\n" +
        "  npm run seed:lions-standings:local -- --execute-local --confirm-local\n",
    );
    return;
  }

  const { error: settingsError } = await onzio
    .from("league_standings_settings")
    .upsert({ club_id: club.id, ...SETTINGS, updated_at: now }, { onConflict: "club_id" });
  if (settingsError) throw settingsError;

  const { error: rowsError } = await onzio
    .from("league_standings")
    .upsert(seededRows, { onConflict: "id" });
  if (rowsError) throw rowsError;

  if (staleRows.length > 0) {
    const { error: deleteError } = await onzio
      .from("league_standings")
      .delete()
      .eq("club_id", club.id)
      .in(
        "id",
        staleRows.map((row) => row.id),
      );
    if (deleteError) throw deleteError;
  }

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: club.id,
    actor_type: "migration",
    operation: "manual.lions_standings_seeded",
    resource_type: "club",
    resource_id: club.id,
    payload: {
      reason:
        "Seed the real Spring 2026 Ohio Valley Division table previously hardcoded in EditorialStandingsTable.tsx",
      rows: seededRows.length,
      pruned: staleRows.length,
    },
  });
  if (auditError) throw auditError;

  const [reconciledSettings, reconciledRows] = await Promise.all([
    onzio
      .from("league_standings_settings")
      .select("eyebrow, title, intro")
      .eq("club_id", club.id)
      .single(),
    onzio
      .from("league_standings")
      .select("team_name, points, goal_difference, sort_order")
      .eq("club_id", club.id)
      .order("sort_order", { ascending: true }),
  ]);
  if (reconciledSettings.error) throw reconciledSettings.error;
  if (reconciledRows.error) throw reconciledRows.error;

  const persisted = reconciledRows.data ?? [];
  if (persisted.length !== STANDINGS.length) {
    throw new Error(
      `Reconciliation failed: expected ${STANDINGS.length} rows, found ${persisted.length}.`,
    );
  }
  STANDINGS.forEach((expected, index) => {
    const actual = persisted[index];
    if (
      actual.team_name !== expected.team_name ||
      actual.points !== expected.points ||
      actual.goal_difference !== expected.goal_difference ||
      actual.sort_order !== index
    ) {
      throw new Error(
        `Reconciliation failed at position ${index + 1}: ${JSON.stringify(actual)}`,
      );
    }
  });
  if (
    reconciledSettings.data.eyebrow !== SETTINGS.eyebrow ||
    reconciledSettings.data.title !== SETTINGS.title ||
    reconciledSettings.data.intro !== SETTINGS.intro
  ) {
    throw new Error(
      `Reconciliation failed for settings: ${JSON.stringify(reconciledSettings.data)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        event: "lions.standings_seed_reconciled",
        rows: persisted.length,
        pruned: staleRows.length,
        settings: reconciledSettings.data,
        hostedMutations: 0,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `seed-lions-standings-local failed: ${
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? JSON.stringify(error)
    }\n`,
  );
  process.exitCode = 1;
});
