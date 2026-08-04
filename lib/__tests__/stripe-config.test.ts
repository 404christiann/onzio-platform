import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStripePortalConfigurationId,
  getStripeRuntimeConfig,
  verifiedClubOrigin,
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
}

describe("Stripe runtime configuration", () => {
  it("maps staging to the test ledger and accepts only test mode", () => {
    configureEnvironment("staging", "sk_test_safe");
    expect(getStripeRuntimeConfig()).toMatchObject({
      environment: "staging",
      ledgerEnvironment: "test",
    });
    expect(getStripePortalConfigurationId()).toBe("bpc_contract");
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

  it("keeps webhook configuration independent from the Portal", () => {
    configureEnvironment("staging", "sk_test_safe");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");

    expect(getStripeRuntimeConfig()).toMatchObject({
      environment: "staging",
      webhookSecret: "whsec_test",
    });
    expect(() => getStripePortalConfigurationId()).toThrowError(
      expect.objectContaining({ code: "STRIPE_CONFIGURATION_MISSING" }),
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
});
