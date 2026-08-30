import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectContractError, loadContract } from "../helpers/contract";

type PortalConfiguration = {
  id: string;
  active: boolean;
  livemode: boolean;
  features: {
    payment_method_update: { enabled: boolean };
    invoice_history: { enabled: boolean };
    subscription_cancel: { enabled: boolean };
    subscription_update: { enabled: boolean };
  };
};

type VerifyStripePortalConfiguration = (dependencies?: {
  retrievePortalConfiguration?: (
    configurationId: string,
  ) => Promise<PortalConfiguration>;
}) => Promise<Record<string, unknown>>;

const VERIFICATION_SCRIPT = "scripts/verify-stripe-portal-config.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureStagingEnvironment() {
  vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_contract");
}

function approvedConfiguration(
  overrides: Partial<PortalConfiguration> = {},
): PortalConfiguration {
  return {
    id: "bpc_contract",
    active: true,
    livemode: false,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    ...overrides,
  };
}

async function loadVerification(): Promise<VerifyStripePortalConfiguration> {
  return loadContract<VerifyStripePortalConfiguration>(
    "@/lib/stripe-portal-verification",
    "verifyStripePortalConfiguration",
  );
}

// The env-var check alone would not have caught a stale or wrong Portal ID —
// only a missing one. This verification retrieves the real configuration from
// Stripe (read-only) and distinguishes every fault by its own code (DCFC-701).
describe("Stripe Portal configuration live verification", () => {
  it("accepts a real, active, matching-mode configuration with approved capabilities", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();
    const retrieved: string[] = [];

    await expect(
      verify({
        retrievePortalConfiguration: async (configurationId) => {
          retrieved.push(configurationId);
          return approvedConfiguration();
        },
      }),
    ).resolves.toMatchObject({
      environment: "staging",
      configurationId: "bpc_contract",
      livemode: false,
      active: true,
      capabilitiesMatch: true,
    });
    // It must verify the configured ID, not whatever Stripe lists first.
    expect(retrieved).toEqual(["bpc_contract"]);
  });

  it("refuses to run against an unvalidated shared configuration", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");

    await expectContractError(
      () => verify({ retrievePortalConfiguration: async () => approvedConfiguration() }),
      "STRIPE_PORTAL_CONFIGURATION_MISSING",
    );
  });

  it("identifies an ID Stripe cannot retrieve", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();

    await expectContractError(
      () =>
        verify({
          retrievePortalConfiguration: async () => {
            throw new Error("No such billing portal configuration");
          },
        }),
      "STRIPE_PORTAL_CONFIGURATION_NOT_FOUND",
    );
  });

  it("identifies an inactive configuration", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();

    await expectContractError(
      () =>
        verify({
          retrievePortalConfiguration: async () =>
            approvedConfiguration({ active: false }),
        }),
      "STRIPE_PORTAL_CONFIGURATION_INACTIVE",
    );
  });

  it("identifies a livemode/environment mismatch", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();

    await expectContractError(
      () =>
        verify({
          retrievePortalConfiguration: async () =>
            approvedConfiguration({ livemode: true }),
        }),
      "STRIPE_PORTAL_CONFIGURATION_MODE_MISMATCH",
    );
  });

  it("identifies drifted Portal capabilities", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();

    await expectContractError(
      () =>
        verify({
          retrievePortalConfiguration: async () =>
            approvedConfiguration({
              features: {
                payment_method_update: { enabled: true },
                invoice_history: { enabled: true },
                subscription_cancel: { enabled: true },
                subscription_update: { enabled: false },
              },
            }),
        }),
      "STRIPE_PORTAL_CAPABILITIES_MISMATCH",
    );
  });

  it("ships as a read-only operator script wired into npm", async () => {
    const script = await readFile(
      resolve(process.cwd(), VERIFICATION_SCRIPT),
      "utf8",
    );
    expect(script).toContain("verifyStripePortalConfiguration");
    expect(script).toContain("loadEnvConfig");
    // Read-only: the script must never create, mutate, or delete Stripe state.
    expect(script).not.toContain(".create(");
    expect(script).not.toContain(".update(");
    expect(script).not.toContain(".del(");

    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["stripe:verify-portal-config"]).toBe(
      `tsx ${VERIFICATION_SCRIPT}`,
    );
  });
});
