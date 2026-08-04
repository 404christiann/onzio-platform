import { describe, expect, it } from "vitest";
import {
  isAdminLocked,
  isPublicSiteLocked,
  resolvePaymentsUiState,
  type SubscriptionMirrorRow,
} from "@/lib/stripe-subscription-state";

const NOW = new Date("2026-08-10T00:00:00.000Z");
const FUTURE = "2026-09-01T00:00:00.000Z";
const PAID_THROUGH = "2026-08-01T00:00:00.000Z";
const GRACE_END = "2026-08-21T00:00:00.000Z";

function row(
  overrides: Partial<NonNullable<SubscriptionMirrorRow>> = {},
): SubscriptionMirrorRow {
  return {
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    status: "active",
    cancel_at_period_end: false,
    current_period_end: FUTURE,
    grace_ends_at: null,
    ...overrides,
  };
}

describe("PLAT-102 payment UI state", () => {
  it("returns no subscription for a missing projection", () => {
    expect(resolvePaymentsUiState(null, NOW)).toEqual({ state: "no_subscription" });
  });

  it("keeps active and future-canceling subscriptions available", () => {
    expect(resolvePaymentsUiState(row(), NOW)).toEqual({ state: "active" });
    expect(
      resolvePaymentsUiState(row({ cancel_at_period_end: true }), NOW),
    ).toEqual({ state: "active_canceling", periodEndsAt: FUTURE });
  });

  it("shows the stored 20-day past-due grace deadline", () => {
    expect(
      resolvePaymentsUiState(
        row({
          status: "past_due",
          current_period_end: PAID_THROUGH,
          grace_ends_at: GRACE_END,
        }),
        NOW,
      ),
    ).toEqual({
      state: "grace",
      graceEndsAt: GRACE_END,
      daysRemaining: 11,
    });
  });

  it("suspends after grace and rejects trialing", () => {
    expect(
      resolvePaymentsUiState(
        row({
          status: "past_due",
          current_period_end: PAID_THROUGH,
          grace_ends_at: "2026-08-09T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({ state: "terminal" });
    expect(resolvePaymentsUiState(row({ status: "trialing" }), NOW)).toEqual({
      state: "terminal",
    });
  });

  it("keeps content and the public site available through grace, then locks both", () => {
    const grace = row({
      status: "past_due",
      current_period_end: PAID_THROUGH,
      grace_ends_at: GRACE_END,
    });
    expect(isAdminLocked(grace, NOW)).toBe(false);
    expect(isPublicSiteLocked(grace, NOW)).toBe(false);
    const suspended = row({
      status: "past_due",
      current_period_end: PAID_THROUGH,
      grace_ends_at: "2026-08-09T00:00:00.000Z",
    });
    expect(isAdminLocked(suspended, NOW)).toBe(true);
    expect(isPublicSiteLocked(suspended, NOW)).toBe(true);
  });
});
