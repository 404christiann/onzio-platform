import { describe, it, expect } from "vitest";
import {
  resolvePaymentsUiState,
  isAdminLocked,
  isPublicSiteLocked,
  type SubscriptionMirrorRow,
} from "@/lib/stripe-subscription-state";

const NOW = new Date("2026-07-15T00:00:00.000Z");
const PAST = "2026-07-01T00:00:00.000Z";
const FUTURE = "2026-08-01T00:00:00.000Z";
const MINUS_6_DAYS = "2026-07-09T00:00:00.000Z";
const MINUS_7_DAYS = "2026-07-08T00:00:00.000Z";
const MINUS_8_DAYS = "2026-07-07T00:00:00.000Z";
const MINUS_30_DAYS = "2026-06-15T00:00:00.000Z";

function row(overrides: {
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
}): SubscriptionMirrorRow {
  return {
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    ...overrides,
  };
}

describe("resolvePaymentsUiState", () => {
  it("returns no_subscription when there is no row", () => {
    expect(resolvePaymentsUiState(null, NOW)).toEqual({ state: "no_subscription" });
  });

  it("returns no_subscription when the row has a null status", () => {
    const r = row({ status: null, cancel_at_period_end: false, current_period_end: null });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "no_subscription" });
  });

  it("returns active for a plain active subscription", () => {
    const r = row({ status: "active", cancel_at_period_end: false, current_period_end: FUTURE });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "active" });
  });

  it("returns active_canceling when scheduled to cancel but still before period end", () => {
    const r = row({ status: "active", cancel_at_period_end: true, current_period_end: FUTURE });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({
      state: "active_canceling",
      periodEndsAt: FUTURE,
    });
  });

  it("returns terminal once canceled and past period end", () => {
    const r = row({ status: "canceled", cancel_at_period_end: true, current_period_end: PAST });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "terminal" });
  });

  it("fails open to active_canceling (not terminal) for a canceled status with a future period end", () => {
    const r = row({ status: "canceled", cancel_at_period_end: true, current_period_end: FUTURE });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({
      state: "active_canceling",
      periodEndsAt: FUTURE,
    });
  });

  it("never locks on past_due alone while still inside the paid period", () => {
    const r = row({ status: "past_due", cancel_at_period_end: false, current_period_end: FUTURE });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "active" });
  });

  it("locks once dunning exhausts to unpaid past the period end", () => {
    const r = row({ status: "unpaid", cancel_at_period_end: false, current_period_end: PAST });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "terminal" });
  });

  it("treats now exactly equal to current_period_end as past", () => {
    const r = row({
      status: "canceled",
      cancel_at_period_end: true,
      current_period_end: NOW.toISOString(),
    });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "terminal" });
  });

  it("never locks on missing current_period_end even with a terminal status", () => {
    const r = row({ status: "canceled", cancel_at_period_end: true, current_period_end: null });
    expect(resolvePaymentsUiState(r, NOW)).toEqual({ state: "active" });
  });
});

describe("isAdminLocked", () => {
  it.each<[string, SubscriptionMirrorRow]>([
    ["no row", null],
    ["null status", row({ status: null, cancel_at_period_end: false, current_period_end: null })],
    ["active", row({ status: "active", cancel_at_period_end: false, current_period_end: FUTURE })],
    [
      "active_canceling",
      row({ status: "active", cancel_at_period_end: true, current_period_end: FUTURE }),
    ],
    [
      "canceled but future period end",
      row({ status: "canceled", cancel_at_period_end: true, current_period_end: FUTURE }),
    ],
    [
      "past_due inside period",
      row({ status: "past_due", cancel_at_period_end: false, current_period_end: FUTURE }),
    ],
    [
      "canceled with missing period end",
      row({ status: "canceled", cancel_at_period_end: true, current_period_end: null }),
    ],
  ])("returns false for %s", (_label, r) => {
    expect(isAdminLocked(r, NOW)).toBe(false);
  });

  it("returns true only once the subscription is genuinely terminal", () => {
    const r = row({ status: "canceled", cancel_at_period_end: true, current_period_end: PAST });
    expect(isAdminLocked(r, NOW)).toBe(true);
  });
});

describe("isPublicSiteLocked", () => {
  it.each<[string, SubscriptionMirrorRow]>([
    ["no row", null],
    ["null status", row({ status: null, cancel_at_period_end: false, current_period_end: null })],
    [
      "active status, past current_period_end",
      row({ status: "active", cancel_at_period_end: false, current_period_end: PAST }),
    ],
    [
      "canceled with missing period end",
      row({ status: "canceled", cancel_at_period_end: false, current_period_end: null }),
    ],
    [
      "canceled, now equals current_period_end (admin already locked here)",
      row({ status: "canceled", cancel_at_period_end: false, current_period_end: NOW.toISOString() }),
    ],
    [
      "canceled, 6 days past period end (still inside the 7-day public grace window)",
      row({ status: "canceled", cancel_at_period_end: false, current_period_end: MINUS_6_DAYS }),
    ],
    [
      "past_due, 30 days past period end (never a terminal status)",
      row({ status: "past_due", cancel_at_period_end: false, current_period_end: MINUS_30_DAYS }),
    ],
  ])("returns false for %s", (_label, r) => {
    expect(isPublicSiteLocked(r, NOW)).toBe(false);
  });

  it("returns true exactly at 7 days past current_period_end", () => {
    const r = row({ status: "canceled", cancel_at_period_end: false, current_period_end: MINUS_7_DAYS });
    expect(isPublicSiteLocked(r, NOW)).toBe(true);
  });

  it("returns true comfortably past the 7-day buffer", () => {
    const r = row({ status: "canceled", cancel_at_period_end: false, current_period_end: MINUS_8_DAYS });
    expect(isPublicSiteLocked(r, NOW)).toBe(true);
  });

  it("locks on unpaid (dunning-exhaustion) past the buffer, same as canceled", () => {
    const r = row({ status: "unpaid", cancel_at_period_end: false, current_period_end: MINUS_7_DAYS });
    expect(isPublicSiteLocked(r, NOW)).toBe(true);
  });
});
