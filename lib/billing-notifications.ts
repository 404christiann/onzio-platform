import type Stripe from "stripe";
import { resolveSubscriptionAccess } from "@/lib/subscription-state";
import {
  getOperatorNotifyConfig,
  logOperatorNotifySkipped,
  sendOperatorEmail,
} from "@/lib/operator-notify";

type Service = {
  from: (table: string) => any;
};

export type PriorSubscriptionRow = {
  status: string | null;
  grace_ends_at: string | null;
  paid_through?: string | null;
} | null;

type Input = {
  service: Service;
  clubId: string;
  subscription: Stripe.Subscription;
  priorRow: PriorSubscriptionRow;
  newStatus: string;
  newAccess: string;
  paidThrough: string | null;
  now?: Date;
};

function formatAmount(subscription: Stripe.Subscription): string {
  const price = subscription.items?.data?.[0]?.price;
  if (!price || typeof price.unit_amount !== "number") return "amount unavailable";
  const currency = (price.currency ?? "").toUpperCase();
  const interval = price.recurring?.interval ?? "period";
  return `${(price.unit_amount / 100).toFixed(2)} ${currency} per ${interval}`;
}

/**
 * Decides whether this applied projection is a transition worth an operator
 * email. Pure so the transition rules are testable without I/O.
 */
export function classifyBillingTransition(input: {
  priorRow: PriorSubscriptionRow;
  newStatus: string;
  newAccess: string;
  now: Date;
}): "activation" | "failure" | null {
  const { priorRow, newStatus, newAccess, now } = input;
  const priorStatus = priorRow?.status ?? null;
  const priorAccess = priorRow
    ? resolveSubscriptionAccess(
        {
          status: priorRow.status,
          paidThrough: priorRow.paid_through ?? null,
          graceEndsAt: priorRow.grace_ends_at,
        },
        now,
      ).publicAccess
    : "preview";
  if (newStatus === "active" && priorStatus !== "active") return "activation";
  if (
    (newStatus === "past_due" && priorStatus !== "past_due") ||
    ((newAccess === "grace" || newAccess === "suspended") &&
      priorAccess !== newAccess)
  ) {
    return "failure";
  }
  return null;
}

/**
 * Called only after apply_stripe_projection succeeded. Never throws.
 */
export async function notifyBillingTransition(input: Input): Promise<void> {
  let clubSlug: string | null = null;
  try {
    if (!getOperatorNotifyConfig()) {
      logOperatorNotifySkipped();
      return;
    }
    const kind = classifyBillingTransition({
      priorRow: input.priorRow,
      newStatus: input.newStatus,
      newAccess: input.newAccess,
      now: input.now ?? new Date(),
    });
    if (!kind) return;

    const { data: club } = await input.service
      .from("clubs")
      .select("name,slug")
      .eq("id", input.clubId)
      .maybeSingle();
    const clubName: string = club?.name ?? "Unknown club";
    clubSlug = club?.slug ?? null;
    const subscriptionId = input.subscription.id;
    const marker = input.paidThrough ?? "none";
    const summary = [
      `Club: ${clubName}`,
      `Slug: ${clubSlug ?? "unknown"}`,
      `Plan: ${formatAmount(input.subscription)}`,
      `Stripe subscription: ${subscriptionId}`,
      `Subscription status: ${input.newStatus}`,
      `Public access: ${input.newAccess}`,
    ];

    // Two different Stripe events (checkout.session.completed and
    // customer.subscription.created) routinely arrive together for the same
    // activation. Both can read the pre-apply row before either applies, so
    // the prior-vs-new check alone can pass twice. The key below depends only
    // on the transition, not the event id, so Resend collapses the duplicate.
    if (kind === "activation") {
      const { data: domain } = await input.service
        .from("club_domains")
        .select("hostname")
        .eq("club_id", input.clubId)
        .eq("is_primary", true)
        .eq("active", true)
        .not("verified_at", "is", null)
        .limit(1)
        .maybeSingle();
      const url = domain?.hostname ? `https://${domain.hostname}` : "no verified domain yet";
      await sendOperatorEmail({
        subject: `${clubName} is live — subscription active`,
        text: [`${clubName} just paid and is live.`, "", ...summary, `Public URL: ${url}`].join("\n"),
        idempotencyKey: `onzio:activation:${input.clubId}:${subscriptionId}:active:${marker}`,
        clubSlug,
      });
      return;
    }

    await sendOperatorEmail({
      subject: `Billing problem — ${clubName} is ${input.newStatus === "past_due" ? "past due" : input.newAccess}`,
      text: [`A billing failure was recorded for ${clubName}.`, "", ...summary, `Paid through: ${input.paidThrough ?? "unknown"}`].join("\n"),
      idempotencyKey: `onzio:failure:${input.clubId}:${subscriptionId}:${input.newStatus}:${input.newAccess}:${marker}`,
      clubSlug,
    });
  } catch {
    console.error(JSON.stringify({ event: "operator_notify.failed", clubSlug, code: "NOTIFY_PREPARE" }));
  }
}
