import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  send: vi.fn(),
  run: vi.fn(),
  heartbeat: vi.fn(),
  clubs: [] as Array<Record<string, unknown>>,
  subs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve } }),
}));
vi.mock("@/lib/email/resend-client", () => ({
  getRegistrationEmailClient: () => ({ emails: { send: mocks.send } }),
}));
vi.mock("@/lib/billing-lifecycle", () => ({
  runBillingLifecycle: mocks.run,
  signalLifecycleHeartbeat: mocks.heartbeat,
}));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({
      from: (table: string) => {
        const query: any = {
          select: () => query,
          eq: () => query,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ error: null, data: table === "clubs" ? mocks.clubs : mocks.subs }),
        };
        return query;
      },
    }),
  }),
}));

import { GET } from "@/app/api/cron/lifecycle/route";

const rose = { id: "c-rose", slug: "rose-city", public_access: "live" };
const dc = { id: "c-dc", slug: "diverse-city", public_access: "grace" };
const dcSub = {
  club_id: "c-dc", stripe_subscription_id: "sub_dc", status: "past_due",
  paid_through: "2026-08-24T06:41:35Z", grace_ends_at: "2026-09-13T06:41:35Z",
};

function cron() {
  return GET(new Request("https://onzio.example/api/cron/lifecycle", {
    headers: { authorization: "Bearer secret" },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-05T09:00:00Z")); // DC: past paid-through, inside grace
  vi.stubEnv("CRON_SECRET", "secret");
  vi.stubEnv("RESEND_API_KEY", "re_test_safe");
  vi.stubEnv("OPERATOR_NOTIFY_EMAIL", "operator@example.test");
  mocks.clubs = [];
  mocks.subs = [];
  mocks.run.mockResolvedValue({ warnings: 0, suspensions: 0, divergences: 0 });
  mocks.send.mockResolvedValue({ data: { id: "e" }, error: null });
  mocks.retrieve.mockResolvedValue({ status: "past_due" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("daily billing drift alert", () => {
  it("flags a customer club with no subscription row that is live (Rose City shape)", async () => {
    mocks.clubs = [rose];
    expect((await cron()).status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload.text).toContain("rose-city: stored live, expected preview");
    expect(options.idempotencyKey).toBe("onzio:drift:2026-09-05");
  });

  it("flags a status mismatch between Stripe and stored access", async () => {
    mocks.clubs = [{ id: "c-x", slug: "club-x", public_access: "live" }];
    mocks.subs = [{ ...dcSub, club_id: "c-x", stripe_subscription_id: "sub_x" }];
    await cron();
    expect(mocks.send.mock.calls[0][0].text).toContain("club-x: stored live, expected grace, Stripe status past_due (source: stripe)");
  });

  it("falls back to the stored mirror and says so when Stripe fails", async () => {
    mocks.clubs = [{ id: "c-x", slug: "club-x", public_access: "live" }];
    mocks.subs = [{ ...dcSub, club_id: "c-x", stripe_subscription_id: "sub_x" }];
    mocks.retrieve.mockRejectedValue(new Error("stripe down"));
    await cron();
    expect(mocks.send.mock.calls[0][0].text).toContain("stored mirror (Stripe lookup failed)");
  });

  it("does not flag a Diverse City shaped club in grace", async () => {
    mocks.clubs = [dc];
    mocks.subs = [dcSub];
    expect((await cron()).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("still reports drift when the lifecycle run fails its configuration", async () => {
    mocks.clubs = [rose];
    mocks.run.mockRejectedValue(new Error("LIFECYCLE_CONFIGURATION_INVALID"));
    const response = await cron();
    expect(response.status).toBe(500);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("an email failure leaves the cron response unchanged", async () => {
    mocks.clubs = [rose];
    mocks.send.mockRejectedValue(new Error("resend down"));
    const response = await cron();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { warnings: 0, suspensions: 0, divergences: 0 }, error: null,
    });
  });
});
