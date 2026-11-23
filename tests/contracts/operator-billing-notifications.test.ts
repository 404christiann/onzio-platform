import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clubId = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  customer: vi.fn(),
  invoices: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  state: {
    ledgerHit: false,
    row: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: () => ({
    subscriptions: { retrieve: mocks.subscription },
    customers: { retrieve: mocks.customer },
    invoices: { list: mocks.invoices },
  }),
}));
vi.mock("@/lib/email/resend-client", () => ({
  getRegistrationEmailClient: () => ({ emails: { send: mocks.send } }),
}));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({
      from: (table: string) => {
        const query: any = {
          select: () => query,
          eq: () => query,
          not: () => query,
          limit: () => query,
          maybeSingle: async () => {
            if (table === "stripe_events") {
              return { error: null, data: mocks.state.ledgerHit ? { id: "x" } : null };
            }
            if (table === "clubs") {
              return { error: null, data: { name: "Rose City Futbol Club", slug: "rose-city" } };
            }
            if (table === "club_domains") {
              return { error: null, data: { hostname: "rosecityfutbolclub.com" } };
            }
            return { error: null, data: mocks.state.row };
          },
        };
        return query;
      },
      rpc: mocks.rpc,
    }),
  }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

const paidEnd = Date.parse("2026-10-11T23:16:28Z") / 1000;
async function* paidInvoices() {
  yield {
    id: "in_paid", customer: "cus_test", status: "paid", livemode: false,
    parent: { subscription_details: { subscription: "sub_test" } },
    lines: { has_more: false, data: [{
      amount: 8500, period: { end: paidEnd },
      parent: { subscription_item_details: { subscription: "sub_test", proration: false } },
    }] },
  };
}

function request(type: string, id = "evt_1") {
  const payload = JSON.stringify({
    id, type, livemode: false,
    created: Math.floor(Date.parse("2026-10-12T00:18:38Z") / 1000),
    data: { object: { id: "sub_test", subscription: "sub_test",
      parent: { subscription_details: { subscription: "sub_test" } } } },
  });
  return new Request("https://alpha.example/api/stripe/webhook", {
    method: "POST", body: payload,
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" }) },
  });
}

const prior = (status: string | null, extra: Record<string, unknown> = {}) => ({
  club_id: clubId, stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test",
  status, grace_ends_at: null, paid_through: null,
  last_applied_stripe_event_id: "evt_previous",
  last_applied_stripe_event_created_at: "2026-10-11T23:17:28Z",
  ...extra,
});

function setStripeStatus(status: string) {
  mocks.subscription.mockResolvedValue({
    id: "sub_test", customer: "cus_test", livemode: false, status,
    metadata: { onzio_club_id: clubId, onzio_environment: "staging" },
    items: { data: [{
      price: { id: "price_test", unit_amount: 8500, currency: "usd", recurring: { interval: "month" } },
      current_period_end: paidEnd + 31 * 86400,
    }] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T18:00:00Z"));
  vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_contract");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_test");
  vi.stubEnv("RESEND_API_KEY", "re_test_safe");
  vi.stubEnv("OPERATOR_NOTIFY_EMAIL", "operator@example.test");
  mocks.state.ledgerHit = false;
  mocks.state.row = null;
  setStripeStatus("active");
  mocks.customer.mockResolvedValue({ metadata: { onzio_club_id: clubId, onzio_environment: "staging" } });
  mocks.invoices.mockImplementation(() => paidInvoices());
  mocks.rpc.mockResolvedValue({ data: { action: "applied" }, error: null });
  mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("operator billing notifications from the Stripe webhook", () => {
  it("sends one activation email with club, plan, subscription and live URL", async () => {
    const response = await POST(request("checkout.session.completed"));
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload.to).toBe("operator@example.test");
    expect(payload.from).toBe("Onzio Billing <billing@auth.onziofutbol.com>");
    expect(payload.subject).toBe("Rose City Futbol Club is live — subscription active");
    expect(payload.text).toContain("rose-city");
    expect(payload.text).toContain("85.00 USD per month");
    expect(payload.text).toContain("sub_test");
    expect(payload.text).toContain("https://rosecityfutbolclub.com");
    expect(options.idempotencyKey).toMatch(/^onzio:activation:/);
  });

  it("does not email when the event id is already in the ledger (retry)", async () => {
    mocks.state.ledgerHit = true;
    const response = await POST(request("checkout.session.completed"));
    expect(await response.json()).toMatchObject({ rejected: "DUPLICATE_EVENT" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not email when the RPC rejects the event as stale or duplicate", async () => {
    mocks.rpc.mockResolvedValue({ data: { action: "rejected", code: "STALE_EVENT" }, error: null });
    expect((await POST(request("checkout.session.completed"))).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not email when the apply fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(request("checkout.session.completed"))).status).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("a second distinct event for the same activation sends nothing once applied", async () => {
    await POST(request("checkout.session.completed", "evt_a"));
    mocks.state.row = prior("active"); // first event's apply is now visible
    await POST(request("customer.subscription.created", "evt_b"));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("two concurrent events for one activation use the same idempotency key", async () => {
    await POST(request("checkout.session.completed", "evt_a"));
    await POST(request("customer.subscription.created", "evt_b")); // row still unapplied
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toBe(mocks.send.mock.calls[1][1].idempotencyKey);
  });

  it("already active to active sends nothing", async () => {
    mocks.state.row = prior("active");
    expect((await POST(request("customer.subscription.updated"))).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends the failure email on a transition into past_due", async () => {
    setStripeStatus("past_due");
    mocks.state.row = prior("active");
    expect((await POST(request("invoice.payment_failed"))).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].subject).toContain("past due");
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toMatch(/^onzio:failure:/);
  });

  it.each([
    ["2026-10-12T18:00:00Z", "grace"],
    ["2026-11-30T00:00:00Z", "suspended"],
  ])("sends the failure email on a transition into %s access (%s)", async (now, access) => {
    vi.setSystemTime(new Date(now));
    setStripeStatus("unpaid");
    mocks.state.row = prior("active");
    await POST(request("customer.subscription.updated"));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].subject).toContain(access);
  });

  it("does not resend while already past_due and already in grace", async () => {
    setStripeStatus("past_due");
    mocks.state.row = prior("past_due", {
      paid_through: "2026-10-11T23:16:28.000Z",
      grace_ends_at: "2026-10-31T23:16:28.000Z",
    });
    await POST(request("invoice.payment_failed"));
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("an email client that throws leaves the webhook response unchanged", async () => {
    mocks.send.mockRejectedValue(new Error("resend down"));
    const response = await POST(request("checkout.session.completed"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: { action: "applied" } });
  });

  it("missing OPERATOR_NOTIFY_EMAIL sends nothing and still returns 200", async () => {
    vi.stubEnv("OPERATOR_NOTIFY_EMAIL", "");
    const response = await POST(request("checkout.session.completed"));
    expect(response.status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
