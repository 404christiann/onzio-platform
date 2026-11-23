import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe-client";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
import { resolveSubscriptionAccess } from "@/lib/subscription-state";
import {
  getOperatorNotifyConfig,
  logOperatorNotifySkipped,
  sendOperatorEmail,
} from "@/lib/operator-notify";

export type DriftMismatch = {
  slug: string;
  storedAccess: string;
  expectedAccess: string;
  stripeStatus: string;
  statusSource: "stripe" | "stored mirror (Stripe lookup failed)" | "no subscription row";
};

/**
 * Compares, for every customer club, the access implied by its subscription
 * against clubs.public_access. Read-only; never throws.
 */
export async function findBillingDrift(
  now: Date,
  deps: { stripe?: Pick<Stripe, "subscriptions"> } = {},
): Promise<DriftMismatch[]> {
  const service = createServiceRoleClient().schema("onzio");
  const { data: clubs, error } = await service
    .from("clubs")
    .select("id,slug,public_access")
    .eq("kind", "customer");
  if (error || !clubs) throw new Error("DRIFT_CLUBS_READ_FAILED");
  const { data: subs, error: subsError } = await service
    .from("club_subscriptions")
    .select("club_id,stripe_subscription_id,status,paid_through,grace_ends_at");
  if (subsError) throw new Error("DRIFT_SUBSCRIPTIONS_READ_FAILED");
  const byClub = new Map(
    (subs ?? []).map((row: any) => [row.club_id as string, row]),
  );

  const mismatches: DriftMismatch[] = [];
  for (const club of clubs as Array<{ id: string; slug: string; public_access: string }>) {
    const row = byClub.get(club.id) as
      | {
          stripe_subscription_id: string | null;
          status: string | null;
          paid_through: string | null;
          grace_ends_at: string | null;
        }
      | undefined;
    let status: string | null = row?.status ?? null;
    let source: DriftMismatch["statusSource"] = row
      ? "stored mirror (Stripe lookup failed)"
      : "no subscription row";
    if (row?.stripe_subscription_id) {
      try {
        const stripe = deps.stripe ?? getStripeClient();
        const live = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
        status = live.status;
        source = "stripe";
      } catch {
        // keep the stored mirror status; the email says so
      }
    }
    const expected = row
      ? resolveSubscriptionAccess(
          {
            status,
            paidThrough: row.paid_through,
            graceEndsAt: row.grace_ends_at,
          },
          now,
        ).publicAccess
      : "preview";
    if (expected !== club.public_access) {
      mismatches.push({
        slug: club.slug,
        storedAccess: club.public_access,
        expectedAccess: expected,
        stripeStatus: status ?? "none",
        statusSource: source,
      });
    }
  }
  return mismatches;
}

/** Runs the drift check and emails one summary. Never throws. */
export async function runBillingDriftAlert(now = new Date()): Promise<number> {
  try {
    const mismatches = await findBillingDrift(now);
    if (mismatches.length === 0) return 0;
    if (!getOperatorNotifyConfig()) {
      logOperatorNotifySkipped();
      return mismatches.length;
    }
    const day = now.toISOString().slice(0, 10);
    await sendOperatorEmail({
      subject: `Billing drift — ${mismatches.length} club${mismatches.length === 1 ? "" : "s"} out of sync`,
      text: [
        "Stored public access does not match what the subscription implies:",
        "",
        ...mismatches.map(
          (m) =>
            `- ${m.slug}: stored ${m.storedAccess}, expected ${m.expectedAccess}, Stripe status ${m.stripeStatus} (source: ${m.statusSource})`,
        ),
      ].join("\n"),
      idempotencyKey: `onzio:drift:${day}`,
    });
    return mismatches.length;
  } catch {
    console.error(JSON.stringify({ event: "billing.drift_check_failed" }));
    return 0;
  }
}
