import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { getStripePaidThrough } from "@/lib/stripe-paid-through";

const periodEnd = Date.parse("2026-10-11T23:16:28Z") / 1000;
const subscription = { id: "sub_test", customer: "cus_test", livemode: false } as Stripe.Subscription;
const line = {
  id: "il_test", amount: 8500, period: { start: periodEnd - 30 * 86400, end: periodEnd },
  parent: { type: "subscription_item_details", subscription_item_details: { subscription: "sub_test", proration: false } },
};
function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_test", customer: "cus_test", status: "paid", livemode: false,
    parent: { subscription_details: { subscription: "sub_test" } },
    lines: { data: [line], has_more: false }, ...overrides,
  };
}
async function* iterate(values: unknown[]) { yield* values; }
function client(invoices: unknown[], lines: unknown[] = []) {
  const list = vi.fn(() => iterate(invoices));
  const listLineItems = vi.fn(() => iterate(lines));
  return { stripe: { invoices: { list, listLineItems } } as unknown as Stripe, list, listLineItems };
}

describe("canonical paid subscription coverage", () => {
  it("uses the paid invoice line period, ignoring an unpaid next subscription period", async () => {
    const c = client([invoice()]);
    expect(await getStripePaidThrough(c.stripe, {
      ...subscription, items: { data: [{ current_period_end: periodEnd + 31 * 86400 }] },
    } as Stripe.Subscription)).toBe("2026-10-11T23:16:28.000Z");
    expect(c.list).toHaveBeenCalledWith({ subscription: "sub_test", status: "paid", limit: 100 });
  });

  it("returns no coverage if the first invoice has never been paid", async () => {
    expect(await getStripePaidThrough(client([]).stripe, subscription)).toBeNull();
  });

  it("a newly issued invoice for an older period cannot shorten already paid coverage", async () => {
    const c = client([
      invoice({ id: "in_newly_issued_old_period" }),
      invoice({ id: "in_earlier_issued_new_period", lines: {
        data: [{ ...line, period: { ...line.period, end: periodEnd + 31 * 86400 } }], has_more: false,
      } }),
    ]);
    expect(await getStripePaidThrough(c.stripe, subscription)).toBe("2026-11-11T23:16:28.000Z");
  });

  it("skips one-off items and prorations, then reads older paid recurring invoices", async () => {
    const c = client([
      invoice({ lines: { data: [
        { ...line, parent: { type: "invoice_item_details" }, period: { end: periodEnd + 60 * 86400 } },
        { ...line, parent: { subscription_item_details: { subscription: "sub_test", proration: true } } },
      ], has_more: false } }), invoice(),
    ]);
    expect(await getStripePaidThrough(c.stripe, subscription)).toBe("2026-10-11T23:16:28.000Z");
  });

  it("paginates invoice lines so a recurring line after page one is not missed", async () => {
    const c = client([invoice({ lines: { data: [], has_more: true } })], [line]);
    expect(await getStripePaidThrough(c.stripe, subscription)).toBe("2026-10-11T23:16:28.000Z");
    expect(c.listLineItems).toHaveBeenCalledWith("in_test", { limit: 100 });
  });

  it("supports recurring invoice lines from the older Stripe API shape", async () => {
    const c = client([invoice({ parent: null, subscription: "sub_test", lines: {
      data: [{ ...line, parent: null, type: "subscription", proration: false, subscription: "sub_test" }], has_more: false,
    } })]);
    expect(await getStripePaidThrough(c.stripe, subscription)).toBe("2026-10-11T23:16:28.000Z");
  });

  it.each([
    { status: "open" }, { customer: "cus_other" }, { livemode: true },
    { parent: { subscription_details: { subscription: "sub_other" } } },
  ])("rejects invoice identity/mode/payment mismatches: %j", async (overrides) => {
    await expect(getStripePaidThrough(client([invoice(overrides)]).stripe, subscription))
      .rejects.toMatchObject({ code: "PAID_INVOICE_MISMATCH" });
  });

  it("propagates Stripe read failures so the webhook retries instead of recording a false payment", async () => {
    const stripe = { invoices: { list: () => { throw new Error("Stripe unavailable"); } } } as unknown as Stripe;
    await expect(getStripePaidThrough(stripe, subscription)).rejects.toThrow("Stripe unavailable");
  });
});
