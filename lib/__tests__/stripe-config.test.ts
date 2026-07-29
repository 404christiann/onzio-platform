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
  vi.stubEnv("STRIPE_PRICE_IDS_PRO_GRANDFATHERED", "");
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

  it("parses a narrow grandfathered Pro Price allowlist", () => {
    configureEnvironment("production", "sk_live_safe");
    vi.stubEnv(
      "STRIPE_PRICE_IDS_PRO_GRANDFATHERED",
      "price_rose_city_legacy, price_second_legacy",
    );

    expect(getStripeRuntimeConfig()).toMatchObject({
      starterPriceId: "price_starter",
      proPriceId: "price_pro",
      grandfatheredProPriceIds: [
        "price_rose_city_legacy",
        "price_second_legacy",
      ],
    });
  });

  it("rejects malformed grandfathered Price configuration", () => {
    configureEnvironment("production", "sk_live_safe");
    vi.stubEnv(
      "STRIPE_PRICE_IDS_PRO_GRANDFATHERED",
      "price_rose_city_legacy,not_a_price",
    );

    expect(() => getStripeRuntimeConfig()).toThrowError(
      expect.objectContaining({
        code: "STRIPE_PRICE_CONFIGURATION_INVALID",
      }),
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
