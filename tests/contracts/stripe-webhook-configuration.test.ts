import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadContract } from "../helpers/contract";

type GetStripeRuntimeConfig = () => unknown;
type StripeConfigurationErrorCode = (error: unknown) => string;

const WEBHOOK_ROUTE = "app/api/stripe/webhook/route.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function codeForEnvironment(
  environment: string,
  secretKey: string,
): Promise<string> {
  const getStripeRuntimeConfig = await loadContract<GetStripeRuntimeConfig>(
    "@/lib/stripe-config",
    "getStripeRuntimeConfig",
  );
  const stripeConfigurationErrorCode =
    await loadContract<StripeConfigurationErrorCode>(
      "@/lib/stripe-config",
      "stripeConfigurationErrorCode",
    );

  vi.stubEnv("ONZIO_ENVIRONMENT", environment);
  vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");

  try {
    getStripeRuntimeConfig();
  } catch (error) {
    return stripeConfigurationErrorCode(error);
  }
  throw new Error(`Expected a configuration failure for ${environment}`);
}

describe("Stripe webhook configuration failures are identifiable", () => {
  // DCFC-701: production returned one opaque WEBHOOK_CONFIGURATION_INVALID for
  // four distinct faults. The real cause was STRIPE_MODE_MISMATCH, and the
  // incident was misdiagnosed as a bad webhook secret for nine days.
  it("distinguishes each configuration fault by code", async () => {
    await expect(codeForEnvironment("preview", "sk_live_safe")).resolves.toBe(
      "STRIPE_ENVIRONMENT_INVALID",
    );
    await expect(codeForEnvironment("production", "")).resolves.toBe(
      "STRIPE_CONFIGURATION_MISSING",
    );
    await expect(
      codeForEnvironment("production", "rk_test_wrong"),
    ).resolves.toBe("STRIPE_MODE_MISMATCH");
    await expect(codeForEnvironment("staging", "sk_live_wrong")).resolves.toBe(
      "STRIPE_MODE_MISMATCH",
    );
  });

  it("falls back to the opaque code for non-contract failures", async () => {
    const stripeConfigurationErrorCode =
      await loadContract<StripeConfigurationErrorCode>(
        "@/lib/stripe-config",
        "stripeConfigurationErrorCode",
      );

    expect(stripeConfigurationErrorCode(new Error("boom"))).toBe(
      "WEBHOOK_CONFIGURATION_INVALID",
    );
    expect(stripeConfigurationErrorCode("boom")).toBe(
      "WEBHOOK_CONFIGURATION_INVALID",
    );
  });

  it("never surfaces the contract message, which can name the variable", async () => {
    const stripeConfigurationErrorCode =
      await loadContract<StripeConfigurationErrorCode>(
        "@/lib/stripe-config",
        "stripeConfigurationErrorCode",
      );

    const code = await codeForEnvironment("production", "");
    expect(code).toBe("STRIPE_CONFIGURATION_MISSING");
    expect(code).not.toContain("STRIPE_SECRET_KEY");
    expect(stripeConfigurationErrorCode(new Error("sk_live_leak"))).not.toContain(
      "sk_live_",
    );
  });

  it("wires the webhook route to the specific code and keeps retrying", async () => {
    const source = await readFile(resolve(process.cwd(), WEBHOOK_ROUTE), "utf8");

    expect(source).toContain("stripeConfigurationErrorCode");
    // The bare literal must not be the only thing the catch can return.
    expect(source).not.toContain('{ error: "WEBHOOK_CONFIGURATION_INVALID" }');
    // Stripe must keep retrying a misconfigured endpoint.
    expect(source).toContain("{ status: 500 }");
  });
});
