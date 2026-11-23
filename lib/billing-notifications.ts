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
  cancel_at_period_end?: boolean | null;
} | null;

export type BillingTransition =
  | "activation"
  | "recovery"
  | "failure"
  | "cancellation"
  | "cancellation_scheduled";

const LATE_PAYMENT_STATUSES = new Set(["past_due", "unpaid"]);

type Input = {
  service: Service;
  clubId: string;
  subscription: Stripe.Subscription;
  priorRow: PriorSubscriptionRow;
  newStatus: string;
  newAccess: string;
  newCancelAtPeriodEnd: boolean;
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
  newCancelAtPeriodEnd?: boolean;
  now: Date;
}): BillingTransition | null {
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
  // A canceled subscription can also move access into grace; one cancellation
  // email covers it instead of a "billing problem" email.
  if (newStatus === "canceled" && priorStatus !== "canceled") return "cancellation";
  if (newStatus === "active" && priorStatus !== "active") {
    return priorStatus !== null && LATE_PAYMENT_STATUSES.has(priorStatus)
      ? "recovery"
      : "activation";
  }
  if (
    (newStatus === "past_due" && priorStatus !== "past_due") ||
    ((newAccess === "grace" || newAccess === "suspended") &&
      priorAccess !== newAccess)
  ) {
    return "failure";
  }
  if (
    priorRow &&
    input.newCancelAtPeriodEnd === true &&
    priorRow.cancel_at_period_end !== true
  ) {
    return "cancellation_scheduled";
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
      newCancelAtPeriodEnd: input.newCancelAtPeriodEnd,
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
    if (kind === "activation" || kind === "recovery") {
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
      if (kind === "recovery") {
        await sendOperatorEmail({
          subject: `${clubName} payment recovered — subscription active`,
          text: [`A late payment for ${clubName} went through and the subscription is active again.`, "", ...summary, `Paid through: ${input.paidThrough ?? "unknown"}`, `Public URL: ${url}`].join("\n"),
          idempotencyKey: `onzio:recovery:${input.clubId}:${subscriptionId}:active:${marker}`,
          clubSlug,
        });
        return;
      }
      await sendOperatorEmail({
        subject: `${clubName} is live — subscription active`,
        text: [`${clubName} just paid and is live.`, "", ...summary, `Public URL: ${url}`].join("\n"),
        idempotencyKey: `onzio:activation:${input.clubId}:${subscriptionId}:active:${marker}`,
        clubSlug,
      });
      return;
    }

    if (kind === "cancellation") {
      await sendOperatorEmail({
        subject: `${clubName} canceled its subscription`,
        text: [`The subscription for ${clubName} is canceled. The public site stays up until the paid period ends, then goes through grace and is suspended.`, "", ...summary, `Paid through: ${input.paidThrough ?? "unknown"}`].join("\n"),
        idempotencyKey: `onzio:cancellation:${input.clubId}:${subscriptionId}`,
        clubSlug,
      });
      return;
    }

    if (kind === "cancellation_scheduled") {
      await sendOperatorEmail({
        subject: `${clubName} scheduled a cancellation`,
        text: [`${clubName} set its subscription to cancel at the end of the paid period. Nothing changes until then.`, "", ...summary, `Paid through: ${input.paidThrough ?? "unknown"}`].join("\n"),
        idempotencyKey: `onzio:cancellation-scheduled:${input.clubId}:${subscriptionId}:${marker}`,
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
