import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentStatusCard } from "@/components/admin/payments/PaymentStatusCard";
import { resolvePaymentsUiState } from "@/lib/stripe-subscription-state";

describe("failed subscription payment rendering", () => {
  it("reproduces the production mismatch and shows the failure instead of a renewal", () => {
    const uiState = resolvePaymentsUiState({
      stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test", status: "past_due",
      cancel_at_period_end: false, current_period_end: "2026-11-11T23:16:28Z",
      grace_ends_at: "2026-12-01T23:16:28Z",
    }, new Date("2026-10-12T18:00:00Z"));
    const html = renderToStaticMarkup(createElement(PaymentStatusCard, {
      uiState, priceLabel: "$85.00/mo", clubName: "Synthetic Club", clubKind: "customer",
    }));
    expect(html).toContain("Payment failed");
    expect(html).toContain("pay the outstanding invoice");
    expect(html).toContain("Resolve payment");
    expect(html).not.toContain("Renews in");
    expect(html).not.toContain("December 1");
  });
});
