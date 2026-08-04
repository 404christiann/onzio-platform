export type SubscriptionMirrorRow = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  grace_ends_at?: string | null;
} | null;

export type PaymentsUiState =
  | { state: "no_subscription" }
  | { state: "active" }
  | { state: "active_canceling"; periodEndsAt: string }
  | { state: "grace"; graceEndsAt: string; daysRemaining: number }
  | { state: "terminal" };

const GRACE_MS = 20 * 24 * 60 * 60 * 1000;
const NONACTIVE_STATUSES = new Set([
  "past_due",
  "canceled",
  "unpaid",
  "incomplete_expired",
]);

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolvePaymentsUiState(
  row: SubscriptionMirrorRow,
  now: Date = new Date(),
): PaymentsUiState {
  if (!row || !row.status) return { state: "no_subscription" };
  if (row.status === "trialing") return { state: "terminal" };

  const periodEnd = time(row.current_period_end);
  const beforePeriodEnd = periodEnd !== null && now.getTime() < periodEnd;
  if (row.status === "active") {
    if (row.cancel_at_period_end && beforePeriodEnd) {
      return { state: "active_canceling", periodEndsAt: row.current_period_end! };
    }
    return { state: "active" };
  }
  if (!NONACTIVE_STATUSES.has(row.status)) return { state: "terminal" };
  if (beforePeriodEnd) {
    return row.cancel_at_period_end
      ? { state: "active_canceling", periodEndsAt: row.current_period_end! }
      : { state: "active" };
  }

  const graceEndsAt = time(row.grace_ends_at) ??
    (periodEnd === null ? null : periodEnd + GRACE_MS);
  if (graceEndsAt !== null && now.getTime() <= graceEndsAt) {
    return {
      state: "grace",
      graceEndsAt: new Date(graceEndsAt).toISOString(),
      daysRemaining: Math.max(
        0,
        Math.ceil((graceEndsAt - now.getTime()) / 86_400_000),
      ),
    };
  }
  return { state: "terminal" };
}

export function isAdminLocked(
  row: SubscriptionMirrorRow,
  now: Date = new Date(),
): boolean {
  return resolvePaymentsUiState(row, now).state === "terminal";
}

export function isPublicSiteLocked(
  row: SubscriptionMirrorRow,
  now: Date = new Date(),
): boolean {
  return resolvePaymentsUiState(row, now).state === "terminal";
}
