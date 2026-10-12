import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscription: vi.fn(), customer: vi.fn(), invoices: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: () => ({
    subscriptions: { retrieve: mocks.subscription },
    customers: { retrieve: mocks.customer },
    invoices: { list: mocks.invoices },
  }),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({ schema: () => ({
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        maybeSingle: async () => ({ error: null, data: table === "stripe_events" ? null : {
          club_id: "11111111-1111-4111-8111-111111111111",
          stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test",
          status: "past_due", grace_ends_at: "2026-12-01T23:16:28Z",
          last_applied_stripe_event_id: "evt_previous",
          last_applied_stripe_event_created_at: "2026-10-11T23:17:28Z",
        } }),
      };
      return query;
    },
    rpc: mocks.rpc,
  }) }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const paidEnd = Date.parse("2026-10-11T23:16:28Z") / 1000;
async function* paidInvoices(end = paidEnd) {
  yield {
    id: "in_paid", customer: "cus_test", status: "paid", livemode: false,
    parent: { subscription_details: { subscription: "sub_test" } },
    lines: { has_more: false, data: [{
      amount: 8500, period: { end },
      parent: { subscription_item_details: { subscription: "sub_test", proration: false } },
    }] },
  };
}
function request(type = "invoice.payment_failed") {
  const payload = JSON.stringify({
    id: "evt_failure_test", type, livemode: false,
    created: Math.floor(Date.parse("2026-10-12T00:18:38Z") / 1000),
    data: { object: { id: "in_failed", parent: { subscription_details: { subscription: "sub_test" } } } },
  });
  return new Request("https://alpha.example/api/stripe/webhook", {
    method: "POST", body: payload,
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" }) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T18:00:00Z"));
  vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_contract");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_test");
  mocks.subscription.mockResolvedValue({
    id: "sub_test", customer: "cus_test", livemode: false, status: "past_due",
    metadata: { onzio_club_id: clubId, onzio_environment: "staging" },
    items: { data: [{ price: { id: "price_test" }, current_period_end: paidEnd + 31 * 86400 }] },
  });
  mocks.customer.mockResolvedValue({ metadata: { onzio_club_id: clubId, onzio_environment: "staging" } });
  mocks.invoices.mockImplementation(() => paidInvoices());
  mocks.rpc.mockResolvedValue({ data: { action: "applied" }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("signed webhook paid-invoice projection", () => {
  it("projects failed renewal as past due with only its last paid service period", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_projection", expect.objectContaining({
      p_status: "past_due", p_paid_through: "2026-10-11T23:16:28.000Z",
      p_grace_ends_at: "2026-10-31T23:16:28.000Z", p_public_access: "grace",
    }));
  });

  it("retries when paid invoice verification is unavailable without applying or rejecting the event", async () => {
    mocks.invoices.mockImplementation(() => { throw new Error("Stripe unavailable"); });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a delayed failure cannot undo a canonically recovered payment", async () => {
    const canonical = await mocks.subscription();
    mocks.subscription.mockResolvedValue({ ...canonical, status: "active" });
    mocks.invoices.mockImplementation(() => paidInvoices(paidEnd + 31 * 86400));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_projection", expect.objectContaining({
      p_status: "active", p_paid_through: "2026-11-11T23:16:28.000Z",
      p_grace_ends_at: null, p_public_access: "live",
    }));
  });
});
