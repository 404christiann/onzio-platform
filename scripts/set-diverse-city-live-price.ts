import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const PROJECT_REF = "ioalthwsdrlzrubomrow";
const EXPECTED_URL = `https://${PROJECT_REF}.supabase.co`;
const CLUB_SLUG = "diverse-city";
// $85/month, product "Onzio Diverse City FC Plan" (prod_V34NKDxtbguIn0) —
// created deliberately as a per-club price since Christian and the client
// agreed pricing may change if the club adds more later. This supersedes
// DCFC-D126/D128's earlier "two shared Products only" price of $75.
const DIVERSE_CITY_LIVE_PRICE = "price_1U2yF0K6WajTkwHYjgvrqAly";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseArgs(): { execute: boolean } {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  if (execute && !args.has(`--confirm-project=${PROJECT_REF}`)) {
    throw new Error(
      `Refusing production write without --confirm-project=${PROJECT_REF}`,
    );
  }
  return { execute };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const { execute } = parseArgs();

  const configuredUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  if (configuredUrl !== EXPECTED_URL) {
    throw new Error(
      `Refusing to run against ${configuredUrl}; expected ${EXPECTED_URL}. ` +
        "Set NEXT_PUBLIC_SUPABASE_URL to the production project before running this.",
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

  const { data: club, error } = await onzio
    .from("clubs")
    .select("id, slug, name, kind, lifecycle, stripe_price_id")
    .eq("slug", CLUB_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!club) throw new Error(`No club found with slug "${CLUB_SLUG}"`);

  const currentPriceId = club.stripe_price_id as string | null;
  const needsUpdate = currentPriceId !== DIVERSE_CITY_LIVE_PRICE;

  process.stdout.write(
    `${JSON.stringify(
      {
        event: execute ? "diverse_city.live_price_set" : "diverse_city.live_price_dry_run",
        club: { id: club.id, slug: club.slug, name: club.name, kind: club.kind, lifecycle: club.lifecycle },
        currentPriceId,
        targetPriceId: DIVERSE_CITY_LIVE_PRICE,
        needsUpdate,
      },
      null,
      2,
    )}\n`,
  );

  if (!execute) {
    process.stdout.write(
      "\nDry run only — no write performed. Re-run with:\n" +
        `  npx tsx scripts/set-diverse-city-live-price.ts --execute --confirm-project=${PROJECT_REF}\n`,
    );
    return;
  }

  if (!needsUpdate) {
    process.stdout.write("\nAlready set correctly — no write needed.\n");
    return;
  }

  const { error: updateError } = await onzio
    .from("clubs")
    .update({ stripe_price_id: DIVERSE_CITY_LIVE_PRICE })
    .eq("id", club.id);
  if (updateError) throw updateError;

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: club.id,
    actor_type: "migration",
    operation: "manual.diverse_city_live_price_set",
    resource_type: "club",
    resource_id: club.id,
    payload: {
      previous_price_id: currentPriceId,
      new_price_id: DIVERSE_CITY_LIVE_PRICE,
      reason: "DCFC-901 checkout was failing with STRIPE_PRICE_REQUIRED",
    },
  });
  if (auditError) throw auditError;

  const { data: reconciled, error: reconcileError } = await onzio
    .from("clubs")
    .select("stripe_price_id")
    .eq("id", club.id)
    .single();
  if (reconcileError) throw reconcileError;
  if (reconciled.stripe_price_id !== DIVERSE_CITY_LIVE_PRICE) {
    throw new Error("Reconciliation failed: stripe_price_id did not persist as expected");
  }

  process.stdout.write(
    `${JSON.stringify({ event: "diverse_city.live_price_reconciled", stripePriceId: reconciled.stripe_price_id }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `set-diverse-city-live-price failed: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
