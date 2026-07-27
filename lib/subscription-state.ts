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
};

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const TERMINAL_STATUSES = new Set([
  "canceled",
  "unpaid",
  "incomplete_expired",
]);
export const STRIPE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

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
    return {
      publicAccess: "suspended",
      adminAccess: "billing_only",
      graceEndsAt: null,
    };
  }

  if (!subscription) {
    return {
      publicAccess: "preview",
      adminAccess: "billing_only",
      graceEndsAt: null,
    };
  }

  const fixture =
    typeof subscription.fixture === "string" ? subscription.fixture : null;
  if (fixture === "canceled-after-grace") {
    return {
      publicAccess: "suspended",
      adminAccess: "billing_only",
      graceEndsAt: null,
    };
  }
  const status =
    fixture === "canceled-before-grace" ? "canceled" : fixture ?? subscription.status;

  if (typeof status === "string" && LIVE_STATUSES.has(status)) {
    return { publicAccess: "live", adminAccess: "full", graceEndsAt: null };
  }

  const paidThrough = timestamp(
    subscription.paidThrough ??
      subscription.paid_through ??
      subscription.currentPeriodEnd ??
      subscription.current_period_end,
  );

  if (typeof status === "string" && TERMINAL_STATUSES.has(status)) {
    if (paidThrough !== null && now.getTime() <= paidThrough) {
      return { publicAccess: "live", adminAccess: "full", graceEndsAt: null };
    }

    const graceEndsAt =
      paidThrough === null ? null : new Date(paidThrough + STRIPE_GRACE_PERIOD_MS);
    const withinGrace =
      graceEndsAt !== null && now.getTime() <= graceEndsAt.getTime();

    return {
      publicAccess: withinGrace ? "grace" : "suspended",
      adminAccess: "billing_only",
      graceEndsAt: graceEndsAt?.toISOString() ?? null,
    };
  }

  return {
    publicAccess: "preview",
    adminAccess: "billing_only",
    graceEndsAt: null,
  };
}
