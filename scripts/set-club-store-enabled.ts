import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

/**
 * Operator-only CLI for flipping onzio.clubs.store_enabled -- the switch
 * added in Lions E1 that gates editorial@1's public /shop route and
 * "Store" nav item (see app/(public)/shop/page.tsx and
 * components/editorial/EditorialHeader.tsx). Deliberately not wired into
 * any app route or admin UI: like tier and stripe_price_id, this is
 * operated via a standalone script against the service-role client, never
 * club self-service.
 *
 * Modeled on scripts/set-diverse-city-live-price.ts's conventions --
 * dry-run by default, --execute required to write, an audited update with
 * post-write reconciliation -- but generalized in two ways that script
 * doesn't need, since this one is meant to run against any club in any
 * environment rather than one hardcoded production project:
 *
 *  - slug + --enable/--disable flag parsing instead of one hardcoded club
 *    and target value.
 *  - a host safety guard that allows loopback targets (local Supabase, the
 *    same "127.0.0.1"/"localhost"/"::1" allowlist the import-*-local.ts
 *    scripts use) to run with just --execute, but for any non-loopback
 *    target requires --confirm-project=<ref> matching the project ref
 *    parsed out of NEXT_PUBLIC_SUPABASE_URL -- the same refusal shape
 *    set-diverse-city-live-price.ts uses for its one hardcoded
 *    PROJECT_REF, generalized to whatever project is actually configured.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

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
  enabled: boolean;
  execute: boolean;
  confirmProject: string | null;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const positional = raw.filter((arg) => !arg.startsWith("--"));
  const flags = new Set(raw.filter((arg) => arg.startsWith("--") && !arg.includes("=")));
  const confirmProjectArg = raw.find((arg) => arg.startsWith("--confirm-project="));

  const slug = positional[0];
  if (!slug) {
    throw new Error(
      "Usage: npx tsx scripts/set-club-store-enabled.ts <club-slug> --enable|--disable [--execute] [--confirm-project=<ref>]",
    );
  }

  const wantsEnable = flags.has("--enable");
  const wantsDisable = flags.has("--disable");
  if (wantsEnable === wantsDisable) {
    throw new Error("Pass exactly one of --enable or --disable");
  }

  return {
    slug,
    enabled: wantsEnable,
    execute: flags.has("--execute"),
    confirmProject: confirmProjectArg ? confirmProjectArg.slice("--confirm-project=".length) : null,
  };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const { slug, enabled, execute, confirmProject } = parseArgs();

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
      throw new Error(
        `Refusing non-local write without --confirm-project=${projectRef}`,
      );
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
    .select("id, slug, name, kind, lifecycle, store_enabled")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!club) throw new Error(`No club found with slug "${slug}"`);

  const currentValue = club.store_enabled as boolean;
  const needsUpdate = currentValue !== enabled;

  process.stdout.write(
    `${JSON.stringify(
      {
        event: execute ? "club.store_enabled_set" : "club.store_enabled_dry_run",
        club: { id: club.id, slug: club.slug, name: club.name, kind: club.kind, lifecycle: club.lifecycle },
        currentValue,
        targetValue: enabled,
        needsUpdate,
      },
      null,
      2,
    )}\n`,
  );

  if (!execute) {
    process.stdout.write(
      "\nDry run only — no write performed. Re-run with:\n" +
        `  npx tsx scripts/set-club-store-enabled.ts ${slug} ${enabled ? "--enable" : "--disable"} --execute` +
        (isLoopback ? "\n" : ` --confirm-project=${parseSupabaseProjectRef(configuredUrl) ?? "<ref>"}\n`),
    );
    return;
  }

  if (!needsUpdate) {
    process.stdout.write("\nAlready set correctly — no write needed.\n");
    return;
  }

  const { error: updateError } = await onzio
    .from("clubs")
    .update({ store_enabled: enabled })
    .eq("id", club.id);
  if (updateError) throw updateError;

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: club.id,
    actor_type: "migration",
    operation: "manual.club_store_enabled_set",
    resource_type: "club",
    resource_id: club.id,
    payload: {
      previous_value: currentValue,
      new_value: enabled,
      reason: "Lions E6 operator toggle for the editorial@1 public store surface",
    },
  });
  if (auditError) throw auditError;

  const { data: reconciled, error: reconcileError } = await onzio
    .from("clubs")
    .select("store_enabled")
    .eq("id", club.id)
    .single();
  if (reconcileError) throw reconcileError;
  if (reconciled.store_enabled !== enabled) {
    throw new Error("Reconciliation failed: store_enabled did not persist as expected");
  }

  process.stdout.write(
    `${JSON.stringify({ event: "club.store_enabled_reconciled", storeEnabled: reconciled.store_enabled }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `set-club-store-enabled failed: ${
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? JSON.stringify(error)
    }\n`,
  );
  process.exitCode = 1;
});
