import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
  vi.stubEnv("STRIPE_PRICE_ID_STARTER", "price_starter");
  vi.stubEnv("STRIPE_PRICE_ID_PRO", "price_pro");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
}

describe("Stripe runtime configuration", () => {
  it("maps staging to the test ledger and accepts only test mode", () => {
    configureEnvironment("staging", "sk_test_safe");
    expect(getStripeRuntimeConfig()).toMatchObject({
      environment: "staging",
      ledgerEnvironment: "test",
      starterPriceId: "price_starter",
      proPriceId: "price_pro",
    });
  });

  it.each([
    ["staging", "sk_live_wrong"],
    ["production", "sk_test_wrong"],
  ] as const)("rejects a %s/key mode mismatch", (environment, key) => {
    configureEnvironment(environment, key);
    expect(() => getStripeRuntimeConfig()).toThrowError(
      expect.objectContaining({ code: "STRIPE_MODE_MISMATCH" }),
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

