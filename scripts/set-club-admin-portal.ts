import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { isValidTimeZone } from "../lib/club-time";

/**
 * ADMIN-RE-02: operator-only CLI for a club's reimagined-admin settings on
 * onzio.clubs -- admin_portal (which admin the club sees), admin_flags (which
 * later slices are on) and time_zone (Onzio's correction of the automatic
 * browser set). Never wired into an app route or admin UI: switching a club's
 * admin is Onzio's job (plan decision 3), like store_enabled.
 *
 * Modelled line for line on scripts/set-club-store-enabled.ts: dry run by
 * default, --execute to write, loopback targets allowed with --execute alone,
 * any other target needs --confirm-project=<ref> matching
 * NEXT_PUBLIC_SUPABASE_URL, an audited update and post-write reconciliation.
 *
 *   npx tsx scripts/set-club-admin-portal.ts <club-slug>
 *     [--portal=classic|reimagined] [--on=<flag>]... [--off=<flag>]...
 *     [--time-zone=<IANA zone>] [--execute] [--confirm-project=<ref>]
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const FLAG_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const USAGE =
  "Usage: npx tsx scripts/set-club-admin-portal.ts <club-slug> [--portal=classic|reimagined] " +
  "[--on=<flag>] [--off=<flag>] [--time-zone=<zone>] [--execute] [--confirm-project=<ref>]";

type Portal = "classic" | "reimagined";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseSupabaseProjectRef(configuredUrl: string): string | null {
  const match = configuredUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/);
  return match ? match[1] : null;
}

type Args = {
  slug: string;
  portal: Portal | null;
  on: string[];
  off: string[];
  timeZone: string | null;
  execute: boolean;
  confirmProject: string | null;
};

function valuesOf(raw: string[], name: string): string[] {
  return raw.filter((arg) => arg.startsWith(`${name}=`)).map((arg) => arg.slice(name.length + 1));
}

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const positional = raw.filter((arg) => !arg.startsWith("--"));
  const flags = new Set(raw.filter((arg) => arg.startsWith("--") && !arg.includes("=")));
  const known = new Set(["--portal", "--on", "--off", "--time-zone", "--confirm-project"]);
  const unknown = raw.filter(
    (arg) => arg.startsWith("--") && (arg.includes("=") ? !known.has(arg.split("=")[0]) : arg !== "--execute"),
  );
  if (unknown.length > 0) throw new Error(`Unknown option ${unknown[0]}. ${USAGE}`);

  const slug = positional[0];
  if (!slug || positional.length > 1) throw new Error(USAGE);

  const portals = valuesOf(raw, "--portal");
  if (portals.length > 1) throw new Error("Pass --portal at most once");
  const portal = portals[0] ?? null;
  if (portal !== null && portal !== "classic" && portal !== "reimagined") {
    throw new Error("--portal must be classic or reimagined");
  }

  const on = valuesOf(raw, "--on");
  const off = valuesOf(raw, "--off");
  for (const name of [...on, ...off]) {
    if (!FLAG_NAME.test(name)) {
      throw new Error(`Invalid flag name "${name}": lowercase letters, digits and _ only, 40 characters at most`);
    }
  }
  const both = on.filter((name) => off.includes(name));
  if (both.length > 0) throw new Error(`Flag "${both[0]}" is in both --on and --off`);

  const zones = valuesOf(raw, "--time-zone");
  if (zones.length > 1) throw new Error("Pass --time-zone at most once");
  const timeZone = zones[0] ?? null;
  if (timeZone !== null && !isValidTimeZone(timeZone)) {
    throw new Error(`"${timeZone}" is not a valid IANA time zone`);
  }

  if (portal === null && on.length === 0 && off.length === 0 && timeZone === null) {
    throw new Error(`Nothing to change: pass --portal, --on, --off or --time-zone. ${USAGE}`);
  }

  const confirmProject = valuesOf(raw, "--confirm-project")[0] ?? null;
  return { slug, portal: portal as Portal | null, on, off, timeZone, execute: flags.has("--execute"), confirmProject };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const { slug, portal, on, off, timeZone, execute, confirmProject } = parseArgs();

  const configuredUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const hostname = new URL(configuredUrl).hostname;
  const isLoopback = LOOPBACK_HOSTS.has(hostname);

  if (execute && !isLoopback) {
    const projectRef = parseSupabaseProjectRef(configuredUrl);
    if (!projectRef) {
      throw new Error(
        `Refusing to run against non-loopback, unrecognized URL ${configuredUrl}. ` +
          "Expected a loopback host or https://<ref>.supabase.co.",
      );
    }
    if (confirmProject !== projectRef) {
      throw new Error(`Refusing non-local write without --confirm-project=${projectRef}`);
    }
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

  const { data: club, error } = await onzio
    .from("clubs")
    .select("id, slug, name, kind, lifecycle, admin_portal, admin_flags, time_zone, time_zone_set_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!club) throw new Error(`No club found with slug "${slug}"`);

  const current = {
    adminPortal: club.admin_portal as Portal,
    adminFlags: (club.admin_flags ?? {}) as Record<string, unknown>,
    timeZone: club.time_zone as string,
    timeZoneSetAt: club.time_zone_set_at as string | null,
  };
  const targetFlags: Record<string, unknown> = { ...current.adminFlags };
  for (const name of on) targetFlags[name] = true;
  for (const name of off) targetFlags[name] = false;
  const target = {
    adminPortal: portal ?? current.adminPortal,
    adminFlags: targetFlags,
    timeZone: timeZone ?? current.timeZone,
  };
  const portalChanges = target.adminPortal !== current.adminPortal;
  const flagsChange = JSON.stringify(Object.entries(target.adminFlags).sort())
    !== JSON.stringify(Object.entries(current.adminFlags).sort());
  // Setting a zone always confirms it, so the automatic browser set never overrides Onzio.
  const zoneChanges = timeZone !== null && (timeZone !== current.timeZone || current.timeZoneSetAt === null);
  const needsUpdate = portalChanges || flagsChange || zoneChanges;

  process.stdout.write(
    `${JSON.stringify(
      {
        event: execute ? "club.admin_portal_set" : "club.admin_portal_dry_run",
        club: { id: club.id, slug: club.slug, name: club.name, kind: club.kind, lifecycle: club.lifecycle },
        current,
        target,
        needsUpdate,
      },
      null,
      2,
    )}\n`,
  );

  if (!execute) {
    const rerun = process.argv.slice(2).filter((arg) => !arg.startsWith("--confirm-project=")).join(" ");
    process.stdout.write(
      "\nDry run only — no write performed. Re-run with:\n" +
        `  npx tsx scripts/set-club-admin-portal.ts ${rerun} --execute` +
        (isLoopback ? "\n" : ` --confirm-project=${parseSupabaseProjectRef(configuredUrl) ?? "<ref>"}\n`),
    );
    return;
  }

  if (!needsUpdate) {
    process.stdout.write("\nAlready set correctly — no write needed.\n");
    return;
  }

  const update: Record<string, unknown> = {};
  if (portalChanges) update.admin_portal = target.adminPortal;
  if (flagsChange) update.admin_flags = target.adminFlags;
  if (zoneChanges) {
    update.time_zone = target.timeZone;
    update.time_zone_set_at = new Date().toISOString();
  }
  const { error: updateError } = await onzio.from("clubs").update(update).eq("id", club.id);
  if (updateError) throw updateError;

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: club.id,
    actor_type: "migration",
    operation: "manual.club_admin_portal_set",
    resource_type: "club",
    resource_id: club.id,
    payload: {
      previous_value: {
        admin_portal: current.adminPortal,
        admin_flags: current.adminFlags,
        time_zone: current.timeZone,
      },
      new_value: { admin_portal: target.adminPortal, admin_flags: target.adminFlags, time_zone: target.timeZone },
      reason: "Operator setting for the club's reimagined admin",
    },
  });
  if (auditError) throw auditError;

  const { data: reconciled, error: reconcileError } = await onzio
    .from("clubs")
    .select("admin_portal, admin_flags, time_zone, time_zone_set_at")
    .eq("id", club.id)
    .single();
  if (reconcileError) throw reconcileError;
  const persisted = reconciled.admin_portal === target.adminPortal
    && JSON.stringify(Object.entries(reconciled.admin_flags ?? {}).sort())
      === JSON.stringify(Object.entries(target.adminFlags).sort())
    && reconciled.time_zone === target.timeZone
    && (!zoneChanges || reconciled.time_zone_set_at !== null);
  if (!persisted) {
    throw new Error("Reconciliation failed: the admin portal settings did not persist as expected");
  }

  process.stdout.write(
    `${JSON.stringify({ event: "club.admin_portal_reconciled", settings: reconciled }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `set-club-admin-portal failed: ${
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? JSON.stringify(error)
    }\n`,
  );
  process.exitCode = 1;
});
