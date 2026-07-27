import { describe, expect, it } from "vitest";
import { assertSafeTestEnvironment } from "../helpers/environment";

describe("test environment safety", () => {
  it("accepts loopback Supabase and Stripe test mode", () => {
    expect(
      assertSafeTestEnvironment({
        SUPABASE_TEST_URL: "http://127.0.0.1:54321",
        STRIPE_TEST_SECRET_KEY: "sk_test_safe",
        STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_safe",
      }),
    ).toMatchObject({
      supabaseUrl: "http://127.0.0.1:54321",
      stripeKey: "sk_test_safe",
    });
  });

  it.each([
    "https://project.supabase.co",
    "https://database.example.com",
    "http://192.168.1.5:54321",
  ])("rejects non-local Supabase URL %s", (SUPABASE_TEST_URL) => {
    expect(() =>
      assertSafeTestEnvironment({
        SUPABASE_TEST_URL,
        STRIPE_TEST_SECRET_KEY: "sk_test_safe",
        STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_safe",
      }),
    ).toThrow(/Refusing non-local Supabase URL/);
  });

  it("rejects a live Stripe secret", () => {
    expect(() =>
      assertSafeTestEnvironment({
        SUPABASE_TEST_URL: "http://localhost:54321",
        STRIPE_TEST_SECRET_KEY: "sk_live_forbidden",
        STRIPE_TEST_WEBHOOK_SECRET: "whsec_test_safe",
      }),
    ).toThrow(/Refusing a live Stripe secret key/);
  });
});
