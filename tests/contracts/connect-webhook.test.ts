import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyWebhookEvent: vi.fn(),
  getStripeClient: vi.fn(),
  sessionRetrieve: vi.fn(),
  chargeRetrieve: vi.fn(),
  accountRetrieve: vi.fn(),
  eventExists: vi.fn(),
  getConnect: vi.fn(),
  getRegistration: vi.fn(),
  applyCheckout: vi.fn(),
  applyRefund: vi.fn(),
  applyConnect: vi.fn(),
  recordRejection: vi.fn(),
  sendNotifications: vi.fn(),
  recordNotificationFailure: vi.fn(),
  mapStatus: vi.fn(),
  config: {
    environment: "staging" as "staging" | "production",
    ledgerEnvironment: "test" as "test" | "production",
    webhookSecret: "whsec_connect_test",
  },
}));

vi.mock("@/lib/stripe-config", () => ({
  getStripeRegistrationRuntimeConfig: () => mocks.config,
}));
vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: mocks.getStripeClient,
}));
vi.mock("@/lib/stripe-event-routing", () => ({
  verifyWebhookEvent: mocks.verifyWebhookEvent,
}));
vi.mock("@/lib/stripe-connect", () => ({
  mapConnectAccountStatus: mocks.mapStatus,
}));
vi.mock("@/lib/registration-service", () => ({
  stripeEventExists: mocks.eventExists,
  getClubConnectRecordByAccount: mocks.getConnect,
  getRegistrationPaymentProjection: mocks.getRegistration,
  applyRegistrationCheckoutEvent: mocks.applyCheckout,
  applyRegistrationRefundEvent: mocks.applyRefund,
  applyRegistrationConnectEvent: mocks.applyConnect,
  recordRegistrationStripeRejection: mocks.recordRejection,
}));
vi.mock("@/lib/email/send-registration-notifications", () => ({
  sendRegistrationNotifications: mocks.sendNotifications,
  recordRegistrationNotificationFailure: mocks.recordNotificationFailure,
}));

import { POST } from "@/app/api/stripe/connect-webhook/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const formId = "22222222-2222-4222-8222-222222222222";
const registrationId = "33333333-3333-4333-8333-333333333333";
const accountId = "acct_1ConnectTest";

function event(type: string, object: Record<string, unknown> = {}) {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    type,
    account: accountId,
    created: 1_800_000_000,
    livemode: false,
    data: { object },
  };
}

function request() {
  return new Request("https://alpha.example/api/stripe/connect-webhook", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: "{\"test\":true}",
  });
}

function prepare(eventValue = event("checkout.session.completed", { id: "cs_event" })) {
  mocks.verifyWebhookEvent.mockReturnValue(eventValue);
  mocks.getStripeClient.mockReturnValue({
    checkout: { sessions: { retrieve: mocks.sessionRetrieve } },
    charges: { retrieve: mocks.chargeRetrieve },
    accounts: { retrieve: mocks.accountRetrieve },
  });
  mocks.eventExists.mockResolvedValue(false);
  mocks.getConnect.mockResolvedValue({
    club_id: clubId,
    stripe_account_id: accountId,
    environment: "test",
  });
  mocks.getRegistration.mockResolvedValue({
    id: registrationId,
    club_id: clubId,
    form_id: formId,
    status: "pending",
    amount_cents: 17_500,
    stripe_checkout_session_id: "cs_canonical",
    stripe_payment_intent_id: "pi_canonical",
  });
  mocks.sessionRetrieve.mockResolvedValue({
    id: "cs_canonical",
    metadata: {
      registration_id: registrationId,
      onzio_club_id: clubId,
      registration_form_id: formId,
      onzio_ledger_environment: "test",
    },
    client_reference_id: registrationId,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 17_500,
    payment_intent: "pi_canonical",
  });
  mocks.applyCheckout.mockResolvedValue({ action: "applied" });
  mocks.applyRefund.mockResolvedValue({ action: "refunded" });
  mocks.applyConnect.mockResolvedValue({ action: "updated" });
  mocks.recordRejection.mockResolvedValue(undefined);
  mocks.sendNotifications.mockResolvedValue(undefined);
  mocks.recordNotificationFailure.mockResolvedValue(undefined);
  mocks.mapStatus.mockReturnValue({
    stripeAccountId: accountId,
    environment: "test",
    chargesEnabled: true,
    detailsSubmitted: true,
    payoutsEnabled: true,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.config.environment = "staging";
  mocks.config.ledgerEnvironment = "test";
});

describe("Stripe Connect registration webhook", () => {
  it("rejects an invalid signature before reading Stripe or the ledger", async () => {
    mocks.verifyWebhookEvent.mockImplementation(() => { throw new Error("bad signature"); });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_SIGNATURE" });
    expect(mocks.verifyWebhookEvent).toHaveBeenCalledWith({
      payload: '{"test":true}',
      signature: "test-signature",
      secret: "whsec_connect_test",
    });
    expect(mocks.getStripeClient).not.toHaveBeenCalled();
    expect(mocks.eventExists).not.toHaveBeenCalled();
    expect(mocks.sessionRetrieve).not.toHaveBeenCalled();
  });

  it("rejects a live event in staging before connected-account access", async () => {
    prepare({ ...event("checkout.session.completed"), livemode: true });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "STRIPE_EVENT_MODE_MISMATCH" });
    expect(mocks.eventExists).not.toHaveBeenCalled();
    expect(mocks.getConnect).not.toHaveBeenCalled();
  });

  it("rejects a test-mode event in production before connected-account access", async () => {
    mocks.config.environment = "production";
    mocks.config.ledgerEnvironment = "production";
    prepare(event("checkout.session.completed"));

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "STRIPE_EVENT_MODE_MISMATCH" });
    expect(mocks.eventExists).not.toHaveBeenCalled();
    expect(mocks.getConnect).not.toHaveBeenCalled();
  });

  it("applies a live-mode checkout completion in production", async () => {
    mocks.config.environment = "production";
    mocks.config.ledgerEnvironment = "production";
    const webhookEvent = {
      ...event("checkout.session.completed", { id: "cs_event" }),
      livemode: true,
    };
    prepare(webhookEvent);
    mocks.getConnect.mockResolvedValue({
      club_id: clubId,
      stripe_account_id: accountId,
      environment: "production",
    });
    mocks.sessionRetrieve.mockResolvedValue({
      id: "cs_live_canonical",
      metadata: {
        registration_id: registrationId,
        onzio_club_id: clubId,
        registration_form_id: formId,
        onzio_ledger_environment: "production",
      },
      client_reference_id: registrationId,
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      currency: "usd",
      amount_total: 17_500,
      payment_intent: "pi_canonical",
    });
    mocks.getRegistration.mockResolvedValue({
      id: registrationId,
      club_id: clubId,
      form_id: formId,
      status: "pending",
      amount_cents: 17_500,
      stripe_checkout_session_id: "cs_live_canonical",
      stripe_payment_intent_id: "pi_canonical",
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.applyCheckout).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      clubId,
      registrationId,
      checkoutSessionId: "cs_live_canonical",
      paymentIntentId: "pi_canonical",
      amountTotal: 17_500,
    }));
  });

  it("applies a live-mode account.updated event in production", async () => {
    mocks.config.environment = "production";
    mocks.config.ledgerEnvironment = "production";
    const webhookEvent = {
      ...event("account.updated", { id: accountId }),
      livemode: true,
    };
    prepare(webhookEvent);
    mocks.getConnect.mockResolvedValue({
      club_id: clubId,
      stripe_account_id: accountId,
      environment: "production",
    });
    mocks.accountRetrieve.mockResolvedValue({
      id: accountId,
      type: "standard",
      metadata: { onzio_club_id: clubId, onzio_deploy_environment: "production" },
    });
    mocks.mapStatus.mockReturnValue({
      stripeAccountId: accountId,
      environment: "production",
      chargesEnabled: true,
      detailsSubmitted: true,
      payoutsEnabled: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.accountRetrieve).toHaveBeenCalledWith(accountId);
    expect(mocks.applyConnect).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      clubId,
      stripeAccountId: accountId,
      chargesEnabled: true,
      detailsSubmitted: true,
      payoutsEnabled: true,
    }));
  });

  it("accepts duplicate events without reapplying", async () => {
    prepare();
    mocks.eventExists.mockResolvedValue(true);

    const response = await POST(request());

    expect(await response.json()).toEqual({ received: true, rejected: "DUPLICATE_EVENT" });
    expect(mocks.sessionRetrieve).not.toHaveBeenCalled();
    expect(mocks.applyCheckout).not.toHaveBeenCalled();
  });

  it("returns 5xx when the pre-projection event-ledger read is unavailable", async () => {
    prepare();
    mocks.eventExists.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "CONNECT_EVENT_PROCESSING_FAILED" });
    expect(mocks.getConnect).not.toHaveBeenCalled();
    expect(mocks.recordRejection).not.toHaveBeenCalled();
  });

  it("returns 5xx when the connected-account lookup is unavailable", async () => {
    prepare();
    mocks.getConnect.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "CONNECT_EVENT_PROCESSING_FAILED" });
    expect(mocks.sessionRetrieve).not.toHaveBeenCalled();
    expect(mocks.recordRejection).not.toHaveBeenCalled();
  });

  it("canonically verifies and applies an exact connected checkout completion", async () => {
    const webhookEvent = event("checkout.session.completed", { id: "cs_event" });
    prepare(webhookEvent);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.sessionRetrieve).toHaveBeenCalledWith(
      "cs_event", {}, { stripeAccount: accountId },
    );
    expect(mocks.applyCheckout).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      clubId,
      registrationId,
      checkoutSessionId: "cs_canonical",
      paymentIntentId: "pi_canonical",
      amountTotal: 17_500,
      payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("records notification failure after a paid projection without changing the webhook acknowledgement", async () => {
    prepare();
    const notificationError = new Error("notification data unavailable");
    mocks.sendNotifications.mockRejectedValueOnce(notificationError);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.applyCheckout).toHaveBeenCalled();
    expect(mocks.recordNotificationFailure).toHaveBeenCalledWith(
      registrationId,
      notificationError,
    );
  });

  it("projects a canonical connected-account refund", async () => {
    const webhookEvent = event("charge.refunded", { id: "ch_event" });
    prepare(webhookEvent);
    mocks.chargeRetrieve.mockResolvedValue({
      id: "ch_canonical",
      payment_intent: "pi_canonical",
      currency: "usd",
      amount_refunded: 4_000,
    });

    const response = await POST(request());

    expect(mocks.chargeRetrieve).toHaveBeenCalledWith(
      "ch_event", {}, { stripeAccount: accountId },
    );
    expect(mocks.applyRefund).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      clubId,
      registrationId,
      paymentIntentId: "pi_canonical",
      amountRefunded: 4_000,
    }));
    expect(response.status).toBe(200);
  });

  it("projects canonical account status for the connected account", async () => {
    const webhookEvent = event("account.updated", { id: accountId });
    prepare(webhookEvent);
    mocks.accountRetrieve.mockResolvedValue({
      id: accountId,
      type: "standard",
      metadata: { onzio_club_id: clubId, onzio_deploy_environment: "staging" },
    });

    const response = await POST(request());

    expect(mocks.accountRetrieve).toHaveBeenCalledWith(accountId);
    expect(mocks.applyConnect).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      clubId,
      stripeAccountId: accountId,
      chargesEnabled: true,
      detailsSubmitted: true,
      payoutsEnabled: true,
    }));
    expect(response.status).toBe(200);
  });

  it("durably rejects a canonical checkout amount mismatch", async () => {
    const webhookEvent = event("checkout.session.completed", { id: "cs_event" });
    prepare(webhookEvent);
    mocks.sessionRetrieve.mockResolvedValue({
      ...(await mocks.sessionRetrieve()),
      amount_total: 17_501,
    });

    const response = await POST(request());

    expect(await response.json()).toEqual({
      received: true,
      rejected: "REGISTRATION_CHECKOUT_MISMATCH",
    });
    expect(mocks.applyCheckout).not.toHaveBeenCalled();
    expect(mocks.recordRejection).toHaveBeenCalledWith(expect.objectContaining({
      eventId: webhookEvent.id,
      eventType: "checkout.session.completed",
      clubId,
      rejectionCode: "REGISTRATION_CHECKOUT_MISMATCH",
      payloadDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("returns 5xx without recording a business rejection when projection RPC fails", async () => {
    prepare();
    mocks.applyCheckout.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "CONNECT_EVENT_PROCESSING_FAILED" });
    expect(mocks.recordRejection).not.toHaveBeenCalled();
  });
});
