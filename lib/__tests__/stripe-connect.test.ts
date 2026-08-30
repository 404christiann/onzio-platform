import { describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";
import {
  createConnectOnboardingLink,
  createStandardConnectAccount,
  mapConnectAccountStatus,
} from "@/lib/stripe-connect";

const config = { environment: "staging" as const, ledgerEnvironment: "test" as const };
const clubId = "11111111-1111-4111-8111-111111111111";

function stripe() {
  return {
    accounts: {
      create: vi.fn().mockResolvedValue({
        id: "acct_1StandardAccount",
        type: "standard",
        charges_enabled: false,
        details_submitted: false,
        payouts_enabled: false,
      }),
    },
    accountLinks: {
      create: vi.fn().mockResolvedValue({
        url: "https://connect.stripe.com/setup/example",
        expires_at: 1_800_000_000,
      }),
    },
  } as any;
}

describe("Stripe Connect Standard account helpers", () => {
  it("creates a Standard account with tenant and environment metadata", async () => {
    const client = stripe();
    await expect(createStandardConnectAccount({ stripe: client, clubId, config })).resolves.toEqual({
      stripeAccountId: "acct_1StandardAccount",
      environment: "test",
      chargesEnabled: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
    });
    expect(client.accounts.create).toHaveBeenCalledWith({
      type: "standard",
      metadata: { onzio_club_id: clubId, onzio_deploy_environment: "staging" },
    });
  });

  it("creates only hosted account-onboarding links", async () => {
    const client = stripe();
    await expect(createConnectOnboardingLink({
      stripe: client,
      stripeAccountId: "acct_1StandardAccount",
      refreshUrl: "https://alpha.example/admin/registrations/connect/refresh",
      returnUrl: "https://alpha.example/admin/registrations/connect/return",
    })).resolves.toEqual({
      url: "https://connect.stripe.com/setup/example",
      expiresAt: 1_800_000_000,
    });
    expect(client.accountLinks.create).toHaveBeenCalledWith(expect.objectContaining({
      account: "acct_1StandardAccount",
      type: "account_onboarding",
    }));
  });

  it("maps only canonical Standard-account status fields", () => {
    expect(mapConnectAccountStatus({
      id: "acct_1StandardAccount",
      type: "standard",
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: true,
    }, config)).toMatchObject({ chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: true });
    expect(() => mapConnectAccountStatus({
      id: "acct_1ExpressAccount",
      type: "express",
      charges_enabled: true,
      details_submitted: true,
      payouts_enabled: true,
    } as any, config)).toThrow(ContractError);
  });

  it("rejects invalid account IDs and unsafe Account Link URLs", async () => {
    const client = stripe();
    await expect(createStandardConnectAccount({ stripe: client, clubId: "not-a-uuid", config })).rejects.toMatchObject({ code: "INVALID_CLUB_ID" });
    await expect(createConnectOnboardingLink({
      stripe: client,
      stripeAccountId: "acct_bad account",
      refreshUrl: "https://alpha.example/refresh",
      returnUrl: "https://alpha.example/return",
    })).rejects.toMatchObject({ code: "INVALID_STRIPE_CONNECT_ACCOUNT" });
    await expect(createConnectOnboardingLink({
      stripe: client,
      stripeAccountId: "acct_1StandardAccount",
      refreshUrl: "javascript:alert(1)",
      returnUrl: "https://alpha.example/return",
    })).rejects.toMatchObject({ code: "INVALID_STRIPE_CONNECT_URL" });
  });
});
