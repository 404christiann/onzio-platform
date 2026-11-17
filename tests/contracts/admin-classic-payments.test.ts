import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentStatusCard, PaymentStatusSkeleton } from "@/components/admin/payments/PaymentStatusCard";
import { resolvePaymentsUiState, type PaymentsUiState } from "@/lib/stripe-subscription-state";

const states: { state: PaymentsUiState; pill: string; action: string; titles: string[] }[] = [
  { state: { state: "no_subscription" }, pill: "Private preview", action: "Start subscription", titles: ["Today", "After you subscribe"] },
  { state: { state: "active", periodEndsAt: "2026-12-01T08:00:00Z" }, pill: "Active", action: "Manage billing", titles: ["Subscription active", "Today", "December 1, 2026"] },
  { state: { state: "active_canceling", periodEndsAt: "2026-12-01T08:00:00Z" }, pill: "Ending", action: "Manage billing", titles: ["Subscription active", "Today", "December 1, 2026"] },
  { state: { state: "payment_failed" }, pill: "Payment failed", action: "Resolve payment", titles: ["Subscription active", "Latest payment failed", "Resolve it in the billing portal"] },
  { state: { state: "grace", graceEndsAt: "2026-11-19T08:00:00Z", daysRemaining: 4 }, pill: "Payment overdue", action: "Update payment method", titles: ["Subscription active", "Payment overdue", "Today", "November 19, 2026"] },
  { state: { state: "terminal" }, pill: "Ended", action: "Manage billing", titles: ["Subscription ended", "Today", "Restore billing"] },
];

const modes = [
  { name: "normal", clubName: "Alpha FC", priceLabel: "$85.00/mo" },
  { name: "long", clubName: "Fort Wayne Atletico Internacional Sociedad Deportiva y Cultural de Futbol Juvenil Academy", priceLabel: "$12,500.00/mo" },
  { name: "no price", clubName: "Alpha FC", priceLabel: null },
];

function markup(uiState: PaymentsUiState, clubName = "Alpha FC", priceLabel: string | null = "$85.00/mo", clubKind: "customer" | "demo" | "test" = "customer") {
  return renderToStaticMarkup(createElement(PaymentStatusCard, { uiState, clubName, priceLabel, clubKind }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T08:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("classic Payments timeline", () => {
  for (const scenario of states) {
    for (const mode of modes) {
      it(`${scenario.state.state} retains its state, one action and ordered steps with ${mode.name} data`, () => {
        const html = markup(scenario.state, mode.clubName, mode.priceLabel);
        expect(html).toContain("Onzio subscription");
        expect(html).toContain("What happens next");
        expect(html).toContain(scenario.pill);
        expect(html).toContain(scenario.action);
        expect(html.match(/<button\b/g)).toHaveLength(1);
        expect(html.match(/aria-current="step"/g)).toHaveLength(1);
        expect([...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((match) => match[1])).toEqual(scenario.titles);
        expect(html).toContain(mode.clubName);
        expect(html).not.toMatch(/undefined|NaN|Invalid Date/);
        if (mode.priceLabel === null) expect(html).not.toContain("data-payments-price");
        else expect(html).toContain(mode.priceLabel.split("/")[0]);
      });
    }
  }

  it.each([
    { label: "missing", periodEndsAt: null, title: "Next renewal", current: "Current period." },
    { label: "invalid", periodEndsAt: "unparseable", title: "Next renewal", current: "Current period." },
    { label: "empty", periodEndsAt: "", title: "Next renewal", current: "Current period." },
    { label: "valid", periodEndsAt: "2026-12-01T08:00:00Z", title: "December 1, 2026", current: "Current period, renews in 16 days." },
  ])("keeps an honest active renewal label for a $label mirrored date", ({ periodEndsAt, title, current }) => {
    const uiState = resolvePaymentsUiState({
      stripe_customer_id: "cus_synthetic",
      stripe_subscription_id: "sub_synthetic",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: periodEndsAt,
    });
    expect(uiState.state).toBe("active");
    const html = markup(uiState);
    expect([...html.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((match) => match[1])).toEqual(["Subscription active", "Today", title]);
    expect(html).toContain(current);
    expect(html).toContain("Renews automatically for $85.00/mo.");
    expect(html).toContain("Manage billing");
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).not.toMatch(/1970|Invalid Date|undefined|NaN/);
  });

  it("renders the financial amount immediately and keeps the real renewal copy", () => {
    const html = markup(states[1].state);
    expect(html).toContain("$85.00");
    expect(html).not.toContain("$0.00");
    expect(html).toContain("Current period, renews in 16 days.");
    expect(html).toContain("Renews automatically for $85.00/mo.");
    expect(html).toContain("Alpha FC&#x27;s Onzio subscription");
  });

  it("uses the actual 20-day grace in copy and accessible progress", () => {
    const html = markup(states[4].state);
    expect(html).toContain("4 of 20 days left");
    expect(html).toContain('aria-label="4 of 20 grace days left"');
    expect(html).toContain('aria-valuenow="20"');
    expect(html).toContain("Content editing remains available");
    expect(html).toContain("otherwise the public site goes down");
    expect(html).not.toContain("of 7");
  });

  it.each(["demo", "test"] as const)("keeps the %s no-subscription exception without a billing action or invented next subscription", (kind) => {
    const html = markup({ state: "no_subscription" }, "Alpha FC", "$85.00/mo", kind);
    expect(html).toContain(`This ${kind} club does not require a paid subscription.`);
    expect(html).toContain("Private preview");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("After you subscribe");
    expect(html).not.toContain("data-payments-price");
  });

  it("retains the real failed, ending and ended messages and support link", () => {
    const failed = markup(states[3].state);
    expect(failed).toContain("Your latest subscription payment failed.");
    expect(failed).toContain("pay the outstanding invoice in the billing portal");
    expect(failed).toContain('href="mailto:onziofutbol@gmail.com"');
    expect(failed).not.toContain("Renews in");
    expect(markup(states[2].state)).toContain("Self-serve cancellation changes are disabled");
    expect(markup(states[5].state)).toContain("Content administration is on hold. Use the Customer Portal to restore billing");
  });

  it("uses the shared two-panel structure for a noninteractive, named loading fallback", () => {
    const html = renderToStaticMarkup(createElement(PaymentStatusSkeleton));
    expect(html).toContain('role="status" aria-label="Loading subscription details"');
    expect(html).toContain('data-payments-skeleton="true"');
    expect(html.match(/<section\b/g)).toHaveLength(2);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});
