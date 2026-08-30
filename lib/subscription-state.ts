export type SubscriptionPublicAccess =
  | "preview"
  | "live"
  | "grace"
  | "suspended";

type SubscriptionInput = {
  fixture?: unknown;
  lifecycle?: unknown;
  status?: unknown;
  paidThrough?: unknown;
  paid_through?: unknown;
  currentPeriodEnd?: unknown;
  current_period_end?: unknown;
  graceEndsAt?: unknown;
  grace_ends_at?: unknown;
};

const TERMINAL_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);
export const STRIPE_GRACE_PERIOD_MS = 20 * 24 * 60 * 60 * 1000;

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveSubscriptionAccess(
  subscription: SubscriptionInput | null,
  now = new Date(),
): {
  publicAccess: SubscriptionPublicAccess;
  adminAccess: "full" | "billing_only";
  graceEndsAt: string | null;
} {
  if (subscription?.lifecycle === "archived") {
    return { publicAccess: "suspended", adminAccess: "billing_only", graceEndsAt: null };
  }
  if (!subscription) {
    return { publicAccess: "preview", adminAccess: "billing_only", graceEndsAt: null };
  }

  const fixture = typeof subscription.fixture === "string" ? subscription.fixture : null;
  const status =
    fixture === "canceled-before-grace"
      ? "canceled"
      : fixture === "canceled-after-grace"
        ? "canceled"
        : fixture ?? subscription.status;
  if (status === "trialing") {
    return { publicAccess: "preview", adminAccess: "billing_only", graceEndsAt: null };
  }
  if (status === "active") {
    return { publicAccess: "live", adminAccess: "full", graceEndsAt: null };
  }

  const paidThrough = timestamp(
    subscription.paidThrough ??
      subscription.paid_through ??
      subscription.currentPeriodEnd ??
      subscription.current_period_end,
  );
  const storedGrace = timestamp(subscription.graceEndsAt ?? subscription.grace_ends_at);
  const computedGrace =
    paidThrough === null ? null : paidThrough + STRIPE_GRACE_PERIOD_MS;
  const graceTime = storedGrace ?? computedGrace;
  const graceIso = graceTime === null ? null : new Date(graceTime).toISOString();

  if (status === "past_due" || (typeof status === "string" && TERMINAL_STATUSES.has(status))) {
    if (paidThrough !== null && now.getTime() <= paidThrough) {
      return { publicAccess: "live", adminAccess: "full", graceEndsAt: graceIso };
    }
    if (
      fixture !== "canceled-after-grace" &&
      graceTime !== null &&
      now.getTime() <= graceTime
    ) {
      return { publicAccess: "grace", adminAccess: "billing_only", graceEndsAt: graceIso };
    }
    return { publicAccess: "suspended", adminAccess: "billing_only", graceEndsAt: graceIso };
  }

  return { publicAccess: "preview", adminAccess: "billing_only", graceEndsAt: null };
}
