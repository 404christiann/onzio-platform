import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStripeConnectRuntimeConfig,
  getRegistrationLedgerEnvironment,
  getStripeRegistrationRuntimeConfig,
  getStripeRuntimeConfig,
  verifiedClubOrigin,
  verifiedClubRequestOrigin,
} from "@/lib/stripe-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureEnvironment(
  environment: "staging" | "production",
  secretKey: string,
) {
  vi.stubEnv("ONZIO_ENVIRONMENT", environment);
  vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_contract");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect_test");
}

describe("Stripe runtime configuration", () => {
  it("maps staging to the test ledger and accepts only test mode", () => {
    configureEnvironment("staging", "sk_test_safe");
    expect(getStripeRuntimeConfig()).toMatchObject({
      environment: "staging",
      ledgerEnvironment: "test",
      portalConfigurationId: "bpc_contract",
    });
  });

  it.each([
    ["staging", "rk_test_restricted"],
    ["production", "rk_live_restricted"],
  ] as const)("accepts a restricted %s key", (environment, key) => {
    configureEnvironment(environment, key);
    expect(getStripeRuntimeConfig()).toMatchObject({ environment });
  });

  it.each([
    ["staging", "sk_live_wrong"],
    ["staging", "rk_live_wrong"],
    ["production", "sk_test_wrong"],
    ["production", "rk_test_wrong"],
  ] as const)("rejects a %s/key mode mismatch", (environment, key) => {
    configureEnvironment(environment, key);
    expect(() => getStripeRuntimeConfig()).toThrowError(
      expect.objectContaining({ code: "STRIPE_MODE_MISMATCH" }),
    );
  });

  it("ignores retired tier Price environment variables", () => {
    configureEnvironment("production", "sk_live_safe");
    vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_retired_starter");
    vi.stubEnv("STRIPE_PRICE_ID_PRO", "price_retired_pro");

    const config = getStripeRuntimeConfig() as Record<string, unknown>;
    expect(config).not.toHaveProperty("starterPriceId");
    expect(config).not.toHaveProperty("proPriceId");
    expect(config).not.toHaveProperty("grandfatheredProPriceIds");
  });

  it("fails the shared configuration when the Portal configuration is missing", () => {
    // Regression for the August 2026 production incident: the Portal ID was
    // validated only by the portal route, so Checkout and the webhook went
    // live with it unset and the gap surfaced as a customer-facing error.
    // The fault keeps its own code so it stays identifiable (DCFC-701).
    configureEnvironment("staging", "sk_test_safe");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");

    expect(() => getStripeRuntimeConfig()).toThrowError(
      expect.objectContaining({ code: "STRIPE_PORTAL_CONFIGURATION_MISSING" }),
    );
  });

  it("builds return origins only from a verified domain", () => {
    expect(verifiedClubOrigin("alpha-onzio.vercel.app")).toBe(
      "https://alpha-onzio.vercel.app",
    );
    expect(verifiedClubOrigin("alpha.localhost")).toBe(
      "http://alpha.localhost",
    );
  });
  it("allows only the matching tenant localhost origin in staging", () => {
    vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
    expect(verifiedClubRequestOrigin({
      primaryDomain: "alpha-onzio.vercel.app",
      clubSlug: "alpha",
      requestHost: "alpha.localhost:3100",
    })).toBe("http://alpha.localhost:3100");
    expect(verifiedClubRequestOrigin({
      primaryDomain: "alpha-onzio.vercel.app",
      clubSlug: "alpha",
      requestHost: "bravo.localhost:3100",
    })).toBe("https://alpha-onzio.vercel.app");
    expect(verifiedClubRequestOrigin({
      primaryDomain: "alpha-onzio.vercel.app",
      clubSlug: "alpha",
      requestHost: "attacker.example",
    })).toBe("https://alpha-onzio.vercel.app");
  });

  it("keeps Connect webhook configuration separate from Billing Prices", () => {
    vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_connect_test");

    expect(getStripeConnectRuntimeConfig()).toEqual({
      environment: "staging",
      ledgerEnvironment: "test",
      webhookSecret: "whsec_connect_test",
    });
  });

  it("allows registration payments configured for live mode in production", () => {
    configureEnvironment("production", "sk_live_safe");
    expect(getStripeRegistrationRuntimeConfig()).toEqual({
      environment: "production",
      ledgerEnvironment: "production",
      webhookSecret: "whsec_connect_test",
    });
  });

  it.each([
    ["production", "sk_test_wrong"],
    ["staging", "sk_live_wrong"],
  ] as const)(
    "still fails closed on a real %s/key mode mismatch for registration payments",
    (environment, key) => {
      configureEnvironment(environment, key);
      expect(() => getStripeRegistrationRuntimeConfig()).toThrowError(
        expect.objectContaining({ code: "STRIPE_MODE_MISMATCH" }),
      );
    },
  );

  it("allows $0 registration setup without Stripe secrets in staging", () => {
    vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(getRegistrationLedgerEnvironment()).toBe("test");
  });

  it("allows $0 registration setup without Stripe secrets in production", () => {
    vi.stubEnv("ONZIO_ENVIRONMENT", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(getRegistrationLedgerEnvironment()).toBe("production");
  });
});
