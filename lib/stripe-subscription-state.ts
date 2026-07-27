export type SubscriptionMirrorRow = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null; // ISO timestamp
} | null;

export type PaymentsUiState =
  | { state: "no_subscription" }
  | { state: "active" }
  | { state: "active_canceling"; periodEndsAt: string }
  | { state: "terminal" };

// Statuses that mean the subscription is fully, finally over. "past_due" is
// intentionally excluded — soft enforcement lets Stripe's dunning retries run
// their course without locking anything until the paid-for period truly ends.
const TERMINAL_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function resolvePaymentsUiState(
  row: SubscriptionMirrorRow,
  now: Date = new Date(),
): PaymentsUiState {
  if (!row || !row.status) {
    return { state: "no_subscription" };
  }

  const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
  const pastPeriodEnd = periodEnd !== null && now.getTime() >= periodEnd.getTime();
  const isTerminalStatus = TERMINAL_STATUSES.has(row.status);

  if (isTerminalStatus && pastPeriodEnd) {
    return { state: "terminal" };
  }

  if (row.cancel_at_period_end && periodEnd && !pastPeriodEnd) {
    return { state: "active_canceling", periodEndsAt: row.current_period_end as string };
  }

  return { state: "active" };
}

export function isAdminLocked(row: SubscriptionMirrorRow, now: Date = new Date()): boolean {
  return resolvePaymentsUiState(row, now).state === "terminal";
}

const PUBLIC_SITE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isPublicSiteLocked(row: SubscriptionMirrorRow, now: Date = new Date()): boolean {
  if (!row || !row.status || !TERMINAL_STATUSES.has(row.status)) {
    return false;
  }

  if (!row.current_period_end) {
    return false;
  }

  const publicLockThreshold = new Date(row.current_period_end).getTime() + PUBLIC_SITE_GRACE_MS;
  return now.getTime() >= publicLockThreshold;
}
