import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), getRecord: vi.fn(), saveRecord: vi.fn(),
  accountCreate: vi.fn(), accountRetrieve: vi.fn(), accountLinkCreate: vi.fn(),
  createStandard: vi.fn(), createOnboardingLink: vi.fn(), mapStatus: vi.fn(),
  config: {
    environment: "staging" as "staging" | "production",
    ledgerEnvironment: "test" as "test" | "production",
    webhookSecret: "whsec_test",
  },
}));

vi.mock("@/lib/registration-route-auth", () => ({ requireRegistrationRouteAuthorization: mocks.requireAuth }));
vi.mock("@/lib/registration-service", () => ({ getClubConnectRecord: mocks.getRecord, saveClubConnectRecord: mocks.saveRecord }));
vi.mock("@/lib/stripe-client", () => ({ getStripeClient: () => ({ accounts: { create: mocks.accountCreate, retrieve: mocks.accountRetrieve }, accountLinks: { create: mocks.accountLinkCreate } }) }));
vi.mock("@/lib/stripe-connect", () => ({ createStandardConnectAccount: mocks.createStandard, createConnectOnboardingLink: mocks.createOnboardingLink, mapConnectAccountStatus: mocks.mapStatus }));
vi.mock("@/lib/stripe-config", () => ({ getStripeRegistrationRuntimeConfig: () => mocks.config, verifiedClubRequestOrigin: () => "https://alpha.example" }));
import { GET, POST } from "@/app/api/stripe/connect/route";

afterEach(() => {
  vi.clearAllMocks();
  mocks.config.environment = "staging";
  mocks.config.ledgerEnvironment = "test";
});

describe("Stripe Connect status route", () => {
  it("returns disconnected without provisioning or contacting Stripe when no record exists", async () => {
    mocks.requireAuth.mockResolvedValue({ club: { id: "11111111-1111-4111-8111-111111111111" } });
    mocks.getRecord.mockResolvedValue(null);

    const response = await GET(new Request("https://alpha.example/api/stripe/connect?action=status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, chargesEnabled: false, payoutsEnabled: false });
    expect(mocks.accountCreate).not.toHaveBeenCalled();
    expect(mocks.createStandard).not.toHaveBeenCalled();
    expect(mocks.accountRetrieve).not.toHaveBeenCalled();
    expect(mocks.saveRecord).not.toHaveBeenCalled();
  });

  it("logs Stripe failure details while keeping the client response generic", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireAuth.mockResolvedValue({
      club: {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "alpha",
        primaryDomain: "alpha.localhost",
      },
    });
    mocks.getRecord.mockResolvedValue(null);
    mocks.createStandard.mockRejectedValueOnce(Object.assign(
      new Error("You can only create new connected accounts after enabling Connect."),
      {
        type: "StripeInvalidRequestError",
        code: "account_invalid",
        requestId: "req_connect_failure",
        statusCode: 400,
      },
    ));

    const response = await POST(new Request(
      "http://alpha.localhost/api/stripe/connect",
      { method: "POST", headers: { host: "alpha.localhost" } },
    ));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "STRIPE_CONNECT_REQUEST_FAILED",
    });
    expect(consoleError).toHaveBeenCalledWith("Stripe Connect request failed", {
      type: "StripeInvalidRequestError",
      message: "You can only create new connected accounts after enabling Connect.",
      code: "account_invalid",
      requestId: "req_connect_failure",
      statusCode: 400,
    });
    consoleError.mockRestore();
  });

  it("completes Connect onboarding in production mode without erroring", async () => {
    mocks.config.environment = "production";
    mocks.config.ledgerEnvironment = "production";
    mocks.requireAuth.mockResolvedValue({
      club: {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "alpha",
        primaryDomain: "alpha-onzio.vercel.app",
      },
    });
    mocks.getRecord.mockResolvedValue(null);
    mocks.createStandard.mockResolvedValue({
      stripeAccountId: "acct_live_1",
      environment: "production",
      chargesEnabled: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
    });
    mocks.saveRecord.mockResolvedValue(undefined);
    mocks.createOnboardingLink.mockResolvedValue({
      url: "https://connect.stripe.com/setup/live/onboarding",
    });

    const response = await POST(new Request(
      "https://alpha-onzio.vercel.app/api/stripe/connect",
      { method: "POST" },
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://connect.stripe.com/setup/live/onboarding",
    );
    expect(mocks.createStandard).toHaveBeenCalledWith(expect.objectContaining({
      clubId: "11111111-1111-4111-8111-111111111111",
      config: expect.objectContaining({ environment: "production", ledgerEnvironment: "production" }),
    }));
    expect(mocks.saveRecord).toHaveBeenCalledWith(expect.objectContaining({
      environment: "production",
      stripe_account_id: "acct_live_1",
    }));
  });
});
