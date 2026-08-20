import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), getRecord: vi.fn(), saveRecord: vi.fn(),
  accountCreate: vi.fn(), accountRetrieve: vi.fn(), accountLinkCreate: vi.fn(),
  createStandard: vi.fn(), mapStatus: vi.fn(),
}));

vi.mock("@/lib/registration-route-auth", () => ({ requireRegistrationRouteAuthorization: mocks.requireAuth }));
vi.mock("@/lib/registration-service", () => ({ getClubConnectRecord: mocks.getRecord, saveClubConnectRecord: mocks.saveRecord }));
vi.mock("@/lib/stripe-client", () => ({ getStripeClient: () => ({ accounts: { create: mocks.accountCreate, retrieve: mocks.accountRetrieve }, accountLinks: { create: mocks.accountLinkCreate } }) }));
vi.mock("@/lib/stripe-connect", () => ({ createStandardConnectAccount: mocks.createStandard, createConnectOnboardingLink: vi.fn(), mapConnectAccountStatus: mocks.mapStatus }));
vi.mock("@/lib/stripe-config", () => ({ getStripeRegistrationRuntimeConfig: () => ({ environment: "staging", ledgerEnvironment: "test", webhookSecret: "whsec_test" }), verifiedClubOrigin: () => "https://alpha.example" }));
import { GET } from "@/app/api/stripe/connect/route";

afterEach(() => vi.clearAllMocks());

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
});
