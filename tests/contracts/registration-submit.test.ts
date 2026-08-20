import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  getClubContext: vi.fn(),
  loadOpenRegistrationForm: vi.fn(),
  createPendingRegistration: vi.fn(),
  getPendingRegistrationCheckoutExpiry: vi.fn(),
  markFreeRegistrationPaid: vi.fn(),
  attachRegistrationCheckout: vi.fn(),
  expireRegistration: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutExpire: vi.fn(),
  sendNotifications: vi.fn(),
  recordNotificationFailure: vi.fn(),
}));

vi.mock("@/lib/club-context", () => ({
  getClubContext: mocks.getClubContext,
}));
vi.mock("@/lib/registration-service", () => ({
  loadOpenRegistrationForm: mocks.loadOpenRegistrationForm,
  createPendingRegistration: mocks.createPendingRegistration,
  getPendingRegistrationCheckoutExpiry: mocks.getPendingRegistrationCheckoutExpiry,
  markFreeRegistrationPaid: mocks.markFreeRegistrationPaid,
  attachRegistrationCheckout: mocks.attachRegistrationCheckout,
  expireRegistration: mocks.expireRegistration,
}));
vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: mocks.checkoutCreate,
        expire: mocks.checkoutExpire,
      },
    },
  }),
}));
vi.mock("@/lib/email/send-registration-notifications", () => ({
  sendRegistrationNotifications: mocks.sendNotifications,
  recordRegistrationNotificationFailure: mocks.recordNotificationFailure,
}));

import { POST } from "@/app/api/register/route";

const club = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "alpha",
  name: "Alpha FC",
  primaryDomain: "alpha.localhost",
  lifecycle: "active",
  publicAccess: "live",
  tier: "starter",
  role: null,
};
const formId = "22222222-2222-4222-8222-222222222222";
const priceId = "33333333-3333-4333-8333-333333333333";
const registrationId = "44444444-4444-4444-8444-444444444444";

function aggregate(amountCents: number) {
  return {
    form: {
      id: formId,
      club_id: club.id,
      slug: "academy",
      title: "Academy",
      description: "",
      is_minor: false,
      waiver_text: "I agree.",
    },
    fields: [
      { id: "1", field_key: "registrant_name", label: "Name", field_type: "name", options: [], required: true, is_core: true, position: 0 },
      { id: "2", field_key: "registrant_email", label: "Email", field_type: "email", options: [], required: true, is_core: true, position: 1 },
    ],
    prices: [{ id: priceId, label: "Player fee", amount_cents: amountCents, position: 0 }],
    connect: amountCents > 0 ? {
      club_id: club.id,
      stripe_account_id: "acct_1AlphaTest",
      environment: "test",
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: true,
    } : null,
  };
}

function request() {
  return new Request("http://alpha.localhost/api/register", {
    method: "POST",
    headers: { host: "alpha.localhost", "content-type": "application/json" },
    body: JSON.stringify({
      formSlug: "academy",
      priceOptionId: priceId,
      answers: {
        registrant_name: "Alex Player",
        registrant_email: "alex@example.test",
      },
      waiverAccepted: true,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test_connect");
  mocks.events.length = 0;
  mocks.getClubContext.mockResolvedValue(club);
  mocks.createPendingRegistration.mockImplementation(async () => {
    mocks.events.push("pending");
    return registrationId;
  });
  mocks.getPendingRegistrationCheckoutExpiry.mockResolvedValue(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  );
  mocks.markFreeRegistrationPaid.mockImplementation(async () => {
    mocks.events.push("free-paid");
  });
  mocks.attachRegistrationCheckout.mockImplementation(async () => {
    mocks.events.push("attached");
  });
  mocks.expireRegistration.mockResolvedValue(undefined);
  mocks.checkoutCreate.mockImplementation(async () => {
    mocks.events.push("checkout");
    return { id: "cs_test_safe", url: "https://checkout.stripe.test/cs", created: 1_800_000_000 };
  });
  mocks.checkoutExpire.mockResolvedValue(undefined);
  mocks.sendNotifications.mockResolvedValue(undefined);
  mocks.recordNotificationFailure.mockResolvedValue(undefined);
});

describe("public registration submission", () => {
  it("completes $0 registrations without loading or calling Stripe", async () => {
    mocks.loadOpenRegistrationForm.mockResolvedValue(aggregate(0));
    const response = await POST(request());
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    expect(mocks.events).toEqual(["pending", "free-paid"]);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("records a notification failure without rolling back a completed $0 registration", async () => {
    mocks.loadOpenRegistrationForm.mockResolvedValue(aggregate(0));
    const notificationError = new Error("notification data unavailable");
    mocks.sendNotifications.mockRejectedValueOnce(notificationError);

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.events).toEqual(["pending", "free-paid"]);
    expect(mocks.recordNotificationFailure).toHaveBeenCalledWith(
      registrationId,
      notificationError,
    );
  });

  it("persists pending before creating a zero-fee connected-account Checkout", async () => {
    mocks.loadOpenRegistrationForm.mockResolvedValue(aggregate(12500));
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.events).toEqual(["pending", "checkout", "attached"]);
    const params = mocks.checkoutCreate.mock.calls[0][0];
    const options = mocks.checkoutCreate.mock.calls[0][1];
    expect(params).not.toHaveProperty("customer_email");
    expect(params).not.toHaveProperty("application_fee_amount");
    expect(params).not.toHaveProperty("transfer_data");
    expect(params.expires_at).toEqual(expect.any(Number));
    expect(options.stripeAccount).toBe("acct_1AlphaTest");
  });

  it("does not create pending rows for closed forms", async () => {
    mocks.loadOpenRegistrationForm.mockRejectedValue(
      new ContractError("REGISTRATION_FORM_CLOSED"),
    );
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "REGISTRATION_FORM_CLOSED" });
    expect(mocks.createPendingRegistration).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("keeps missing or cross-tenant forms indistinguishable", async () => {
    mocks.loadOpenRegistrationForm.mockRejectedValue(
      new ContractError("REGISTRATION_FORM_NOT_FOUND"),
    );

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "REGISTRATION_FORM_NOT_FOUND" });
    expect(mocks.createPendingRegistration).not.toHaveBeenCalled();
  });
});
