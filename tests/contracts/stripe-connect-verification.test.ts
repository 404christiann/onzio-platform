import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectContractError, loadContract } from "../helpers/contract";

type AccountSummary = { id: string };

type WebhookEndpointSummary = {
  url: string;
  status: string;
  enabled_events: string[];
};

type VerifyStripeConnectConfiguration = (dependencies?: {
  listAccounts?: (params: {
    limit: number;
  }) => Promise<{ data: AccountSummary[] }>;
  listWebhookEndpoints?: (params: {
    limit: number;
  }) => Promise<{ data: WebhookEndpointSummary[] }>;
}) => Promise<Record<string, unknown>>;

const VERIFICATION_SCRIPT = "scripts/verify-stripe-connect-config.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureProductionEnvironment() {
  vi.stubEnv("ONZIO_ENVIRONMENT", "production");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_safe");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_live");
}

function configureStagingEnvironment() {
  vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_safe");
  vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "whsec_test");
}

function connectWebhookEndpoint(
  overrides: Partial<WebhookEndpointSummary> = {},
): WebhookEndpointSummary {
  return {
    url: "https://www.example.com/api/stripe/connect-webhook",
    status: "enabled",
    enabled_events: [
      "checkout.session.completed",
      "charge.refunded",
      "account.updated",
    ],
    ...overrides,
  };
}

function listOne(): Promise<{ data: AccountSummary[] }> {
  return Promise.resolve({ data: [{ id: "acct_live" }] });
}

function listNone(): Promise<{ data: AccountSummary[] }> {
  return Promise.resolve({ data: [] });
}

async function loadVerification(): Promise<VerifyStripeConnectConfiguration> {
  return loadContract<VerifyStripeConnectConfiguration>(
    "@/lib/stripe-connect-verification",
    "verifyStripeConnectConfiguration",
  );
}

// The env-var check alone proved insufficient on 2026-08-26: env vars,
// webhook, and code were all correct, yet the first live accounts.create()
// failed on the one-time platform Connect profile questionnaire, which no
// read-only API exposes. This verification reports the strongest read-only
// signals that do exist and is honest about what it cannot prove.
describe("Stripe Connect configuration live verification", () => {
  it("proves the platform profile once a live connected account exists", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();
    const listed: number[] = [];

    await expect(
      verify({
        listAccounts: async ({ limit }) => {
          listed.push(limit);
          return { data: [{ id: "acct_live" }] };
        },
        listWebhookEndpoints: async () => ({
          data: [connectWebhookEndpoint()],
        }),
      }),
    ).resolves.toMatchObject({
      environment: "production",
      ledgerEnvironment: "production",
      connectApiReachable: true,
      connectedAccountsExist: true,
      platformProfileProven: true,
      platformProfileStatus: "proven",
      connectWebhookEndpoint: "verified",
    });
    // One account is a sufficient proof; never page through the full list.
    expect(listed).toEqual([1]);
  });

  it("reports INDETERMINATE with Dashboard guidance before the first club connects", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();

    const result = await verify({
      listAccounts: listNone,
      listWebhookEndpoints: async () => ({ data: [connectWebhookEndpoint()] }),
    });

    expect(result).toMatchObject({
      connectedAccountsExist: false,
      platformProfileProven: false,
      platformProfileStatus: "indeterminate",
    });
    // The guidance must point the operator at the exact one-time Dashboard
    // questionnaire the 2026-08-26 go-live missed.
    expect(String(result.platformProfileGuidance)).toContain(
      "dashboard.stripe.com/connect/settings/profile",
    );
  });

  it("never claims proof from a staging (test-mode) run", async () => {
    const verify = await loadVerification();
    configureStagingEnvironment();

    await expect(
      verify({
        listAccounts: listOne,
        listWebhookEndpoints: async () => ({
          data: [connectWebhookEndpoint()],
        }),
      }),
    ).resolves.toMatchObject({
      environment: "staging",
      ledgerEnvironment: "test",
      platformProfileProven: false,
      platformProfileStatus: "not-enforced-in-test-mode",
    });
  });

  it("refuses to run without the Connect webhook secret", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", "");

    await expectContractError(
      () => verify({ listAccounts: listOne }),
      "STRIPE_CONFIGURATION_MISSING",
    );
  });

  it("refuses a key whose mode does not match the environment", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_wrong_mode");

    await expectContractError(
      () => verify({ listAccounts: listOne }),
      "STRIPE_MODE_MISMATCH",
    );
  });

  it("identifies an unreachable Connect accounts API", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();

    await expectContractError(
      () =>
        verify({
          listAccounts: async () => {
            throw new Error("Invalid API Key provided");
          },
        }),
      "STRIPE_CONNECT_ACCOUNTS_UNREACHABLE",
    );
  });

  it("treats webhook endpoint visibility as best-effort, never a fault", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();

    // Listing endpoints can fail (e.g. a restricted key without webhook
    // read access) without invalidating the authoritative checks.
    await expect(
      verify({
        listAccounts: listOne,
        listWebhookEndpoints: async () => {
          throw new Error("This API key does not have access");
        },
      }),
    ).resolves.toMatchObject({
      platformProfileProven: true,
      connectWebhookEndpoint: "unlistable",
    });

    // An absent endpoint may be a Dashboard-created endpoint the API does
    // not list, so it is reported as guidance, not failure.
    const missing = await verify({
      listAccounts: listOne,
      listWebhookEndpoints: async () => ({
        data: [
          connectWebhookEndpoint({
            url: "https://www.example.com/api/stripe/webhook",
          }),
        ],
      }),
    });
    expect(missing).toMatchObject({ connectWebhookEndpoint: "missing" });
    expect(String(missing.connectWebhookEndpointDetail)).toContain(
      "Dashboard",
    );
  });

  it("only verifies an enabled endpoint covering the three Connect events", async () => {
    const verify = await loadVerification();
    configureProductionEnvironment();

    const incomplete = await verify({
      listAccounts: listOne,
      listWebhookEndpoints: async () => ({
        data: [
          connectWebhookEndpoint({
            enabled_events: ["checkout.session.completed", "charge.refunded"],
          }),
          connectWebhookEndpoint({ status: "disabled" }),
        ],
      }),
    });
    expect(incomplete).toMatchObject({ connectWebhookEndpoint: "missing" });

    // A wildcard subscription covers every required event.
    await expect(
      verify({
        listAccounts: listOne,
        listWebhookEndpoints: async () => ({
          data: [connectWebhookEndpoint({ enabled_events: ["*"] })],
        }),
      }),
    ).resolves.toMatchObject({ connectWebhookEndpoint: "verified" });
  });

  it("ships as a read-only operator script wired into npm", async () => {
    const script = await readFile(
      resolve(process.cwd(), VERIFICATION_SCRIPT),
      "utf8",
    );
    expect(script).toContain("verifyStripeConnectConfiguration");
    expect(script).toContain("loadEnvConfig");
    // Read-only: the script must never create, mutate, or delete Stripe
    // state. In particular, no accounts.create probe: a successful live
    // probe would strand an undeletable live Standard connected account.
    expect(script).not.toContain(".create(");
    expect(script).not.toContain(".update(");
    expect(script).not.toContain(".del(");

    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["stripe:verify-connect-config"]).toBe(
      `tsx ${VERIFICATION_SCRIPT}`,
    );
  });
});
