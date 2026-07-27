import { describe, expect, it } from "vitest";
import { formatStripePriceLabel } from "@/lib/stripe-price";

describe("formatStripePriceLabel", () => {
  it("formats a monthly recurring Stripe price", () => {
    expect(
      formatStripePriceLabel({
        currency: "usd",
        unit_amount: 7500,
        recurring: { interval: "month", interval_count: 1 },
      }),
    ).toBe("$75.00/mo");
  });

  it("formats multi-interval recurring prices", () => {
    expect(
      formatStripePriceLabel({
        currency: "usd",
        unit_amount: 15000,
        recurring: { interval: "month", interval_count: 3 },
      }),
    ).toBe("$150.00 every 3 months");
  });

  it("returns null for usage-based prices without a unit amount", () => {
    expect(
      formatStripePriceLabel({
        currency: "usd",
        unit_amount: null,
        recurring: { interval: "month", interval_count: 1 },
      }),
    ).toBeNull();
  });

  it("formats one-time prices without an interval suffix", () => {
    expect(
      formatStripePriceLabel({
        currency: "usd",
        unit_amount: 2500,
        recurring: null,
      }),
    ).toBe("$25.00");
  });
});
