import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

/**
 * Sets onzio.clubs.stripe_price_id for Lions Football Club in production.
 *
 * Structural twin of scripts/set-diverse-city-live-price.ts. Provisioning
 * never sets this column (lib/operator/provision-club.ts inserts
 * stripe_price_id: null), and nothing else writes it -- there is no admin UI
 * and no API route, by design: like tier and store_enabled it is operated by
 * a standalone service-role script, never club self-service.
 *
 * WHY THIS IS A LAUNCH BLOCKER, not a tidy-up. lib/stripe-event-routing.ts's
 * clubPriceId() rejects a null or malformed value with
 * STRIPE_PRICE_REQUIRED, and buildCheckoutDecision calls it before any Stripe
 * object is created. With the column null, the club owner's very first click
 * on "Start subscription" fails with a 403 and no checkout session is ever
 * created. That is exactly how it surfaced for Diverse City FC: the gap was
 * invisible until a real owner tried to pay.
 *
 * The price: price_1Tw8RjK6WajTkwHYcTsgHNGc, $65/month, product
 * prod_Uw0SrC4bw23myw "Onzio Starter Plan" (HANDOFF.md's Stripe catalogue
 * entries). This is the standard shared Starter price, matching Lions'
 * tier=starter -- unlike Diverse City FC, which uses a bespoke $85 per-club
 * price. No new Stripe product or price needs creating.
 *
 * NOT VERIFIED BY THIS SCRIPT: that the price is live-mode and active on the
 * Stripe account behind production's STRIPE_SECRET_KEY. Nothing in this
 * repository can check that without calling Stripe, and this script
 * deliberately performs no Stripe calls at all -- it only writes one Supabase
 * column. Confirm it in the Stripe Dashboard before running, or the failure
 * moves from checkout-time to a rejected projection later.
 */

const PROJECT_REF = "ioalthwsdrlzrubomrow";
const EXPECTED_URL = `https://${PROJECT_REF}.supabase.co`;
const CLUB_SLUG = "lions";
const EXPECTED_CLUB_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";
const LIONS_LIVE_PRICE = "price_1Tw8RjK6WajTkwHYcTsgHNGc";

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
    .select("id, slug, name, kind, tier, lifecycle, stripe_price_id")
    .eq("slug", CLUB_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!club) throw new Error(`No club found with slug "${CLUB_SLUG}"`);

  // Slug alone is not enough: it is unique per project, but pinning the id
  // too means this cannot silently target a different Lions if one is ever
  // re-provisioned.
  if (club.id !== EXPECTED_CLUB_ID) {
    throw new Error(
      `Club "${CLUB_SLUG}" resolved to ${club.id}, expected the production Lions tenant ${EXPECTED_CLUB_ID}.`,
    );
  }
  // apply_stripe_projection raises BILLING_NOT_REQUIRED for any club whose
  // kind is not "customer", so setting a price on a demo or test tenant would
  // be meaningless and misleading.
  if (club.kind !== "customer") {
    throw new Error(
      `Refusing to set a live price on a club with kind="${club.kind}"; billing applies to customer clubs only.`,
    );
  }

  const currentPriceId = club.stripe_price_id as string | null;
  const needsUpdate = currentPriceId !== LIONS_LIVE_PRICE;

  process.stdout.write(
    `${JSON.stringify(
      {
        event: execute ? "lions.live_price_set" : "lions.live_price_dry_run",
        club: {
          id: club.id,
          slug: club.slug,
          name: club.name,
          kind: club.kind,
          tier: club.tier,
          lifecycle: club.lifecycle,
        },
        currentPriceId,
        targetPriceId: LIONS_LIVE_PRICE,
        needsUpdate,
      },
      null,
      2,
    )}\n`,
  );

  if (!execute) {
    process.stdout.write(
      "\nDry run only — no write performed. Re-run with:\n" +
        `  npx tsx scripts/set-lions-live-price.ts --execute --confirm-project=${PROJECT_REF}\n`,
    );
    return;
  }

  if (!needsUpdate) {
    process.stdout.write("\nAlready set correctly — no write needed.\n");
    return;
  }

  const { error: updateError } = await onzio
    .from("clubs")
    .update({ stripe_price_id: LIONS_LIVE_PRICE })
    .eq("id", club.id);
  if (updateError) throw updateError;

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: club.id,
    actor_type: "migration",
    operation: "manual.lions_live_price_set",
    resource_type: "club",
    resource_id: club.id,
    payload: {
      previous_price_id: currentPriceId,
      new_price_id: LIONS_LIVE_PRICE,
      reason:
        "Lions checkout would fail with STRIPE_PRICE_REQUIRED until clubs.stripe_price_id is set; same gap DCFC-901 hit",
    },
  });
  if (auditError) throw auditError;

  const { data: reconciled, error: reconcileError } = await onzio
    .from("clubs")
    .select("stripe_price_id")
    .eq("id", club.id)
    .single();
  if (reconcileError) throw reconcileError;
  if (reconciled.stripe_price_id !== LIONS_LIVE_PRICE) {
    throw new Error("Reconciliation failed: stripe_price_id did not persist as expected");
  }

  process.stdout.write(
    `${JSON.stringify({ event: "lions.live_price_reconciled", stripePriceId: reconciled.stripe_price_id }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `set-lions-live-price failed: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
