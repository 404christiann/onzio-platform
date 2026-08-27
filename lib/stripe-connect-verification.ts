import type Stripe from "stripe";
import { failContract } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import {
  getStripeConnectRuntimeConfig,
  type OnzioEnvironment,
} from "@/lib/stripe-config";

/**
 * Live, read-only verification of Stripe Connect go-live readiness.
 *
 * The shared runtime config can only prove the variables are set and the key
 * mode matches ONZIO_ENVIRONMENT; it cannot catch platform-account state.
 * That is exactly how the 2026-08-26 go-live failed: env vars, webhook, and
 * code were all correct, but the first live `accounts.create()` returned
 * "You must complete your platform profile to use Connect and create live
 * connected accounts" — a one-time Stripe Dashboard questionnaire
 * (https://dashboard.stripe.com/connect/settings/profile) that test mode
 * never enforces and no repo artifact references.
 *
 * Stripe exposes no read-only API for platform-profile completeness, and the
 * only call that triggers the check (`accounts.create`) would strand an
 * undeletable live Standard account on success, so this check is deliberately
 * NOT a create probe. Instead it uses the one genuine read-only signal that
 * exists: a live connected account can only exist if the platform profile is
 * complete, so `accounts.list` returning any account proves readiness. Before
 * the first club is connected the result is honestly INDETERMINATE and the
 * operator must confirm the questionnaire manually in the Dashboard — see
 * `docs/stripe-live-go-live-checklist.md`.
 *
 * This check calls the Stripe API, so it runs as an operator acceptance step
 * (see `scripts/verify-stripe-connect-config.ts`), never at request time.
 *
 * Each fault keeps its own code (DCFC-701 discipline):
 * - configuration faults from `getStripeConnectRuntimeConfig` pass through
 *   unchanged (`STRIPE_ENVIRONMENT_INVALID`, `STRIPE_CONFIGURATION_MISSING`,
 *   `STRIPE_MODE_MISMATCH`)
 * - `STRIPE_CONNECT_ACCOUNTS_UNREACHABLE` — `accounts.list` itself failed
 *   (invalid/revoked key, or a restricted key without Connect read access)
 */

const CONNECT_WEBHOOK_PATH = "/api/stripe/connect-webhook";

/** The events the Connect webhook route projects; see the go-live plan. */
const REQUIRED_CONNECT_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "charge.refunded",
  "account.updated",
] as const;

export const PLATFORM_PROFILE_INDETERMINATE_GUIDANCE =
  "No connected accounts exist yet, so platform Connect profile completeness " +
  "cannot be verified read-only. Before onboarding the first club, confirm " +
  "the one-time questionnaire is complete at " +
  "https://dashboard.stripe.com/connect/settings/profile (Dashboard -> " +
  "Settings -> Connect -> Platform profile). Test mode never enforces it; " +
  "the first live accounts.create() does.";

export type AccountSummary = { id: string };

export type WebhookEndpointSummary = {
  url: string;
  status: string;
  enabled_events: string[];
};

export type ConnectVerificationDependencies = {
  listAccounts?: (params: {
    limit: number;
  }) => Promise<{ data: AccountSummary[] }>;
  listWebhookEndpoints?: (params: {
    limit: number;
  }) => Promise<{ data: WebhookEndpointSummary[] }>;
};

export type ConnectVerificationResult = {
  environment: OnzioEnvironment;
  ledgerEnvironment: "test" | "production";
  connectApiReachable: true;
  connectedAccountsExist: boolean;
  platformProfileProven: boolean;
  platformProfileStatus:
    | "proven"
    | "indeterminate"
    | "not-enforced-in-test-mode";
  platformProfileGuidance?: string;
  connectWebhookEndpoint: "verified" | "missing" | "unlistable";
  connectWebhookEndpointDetail?: string;
};

function listAccountsWithStripe(params: {
  limit: number;
}): Promise<{ data: AccountSummary[] }> {
  return getStripeClient().accounts.list(params);
}

function listWebhookEndpointsWithStripe(params: {
  limit: number;
}): Promise<{ data: WebhookEndpointSummary[] }> {
  return getStripeClient().webhookEndpoints.list(
    params,
  ) as unknown as Promise<{ data: WebhookEndpointSummary[] }>;
}

function coversRequiredEvents(events: string[]): boolean {
  if (events.includes("*")) return true;
  return REQUIRED_CONNECT_WEBHOOK_EVENTS.every((event) =>
    events.includes(event),
  );
}

function matchesConnectWebhook(endpoint: WebhookEndpointSummary): boolean {
  let path: string;
  try {
    path = new URL(endpoint.url).pathname;
  } catch {
    return false;
  }
  return (
    path === CONNECT_WEBHOOK_PATH &&
    endpoint.status === "enabled" &&
    coversRequiredEvents(endpoint.enabled_events)
  );
}

/**
 * Best-effort webhook endpoint presence check. Whether endpoints created in
 * the Stripe Dashboard (as this repo's Connect endpoint was, per the go-live
 * plan) are returned by `GET /v1/webhook_endpoints` could not be verified
 * without live credentials — Stripe's API reference documents that
 * Dashboard-created endpoints have limited API manageability but does not
 * state list visibility either way. A "missing" result may therefore be a
 * false negative and is reported as guidance, never as a fault; only the
 * config and accounts checks are authoritative.
 */
async function checkConnectWebhookEndpoint(
  listWebhookEndpoints: NonNullable<
    ConnectVerificationDependencies["listWebhookEndpoints"]
  >,
): Promise<Pick<
  ConnectVerificationResult,
  "connectWebhookEndpoint" | "connectWebhookEndpointDetail"
>> {
  let endpoints: { data: WebhookEndpointSummary[] };
  try {
    endpoints = await listWebhookEndpoints({ limit: 100 });
  } catch (error) {
    return {
      connectWebhookEndpoint: "unlistable",
      connectWebhookEndpointDetail:
        `Could not list webhook endpoints (${
          error instanceof Error ? error.message : String(error)
        }); confirm the ${CONNECT_WEBHOOK_PATH} endpoint in the Dashboard.`,
    };
  }

  if (endpoints.data.some(matchesConnectWebhook)) {
    return { connectWebhookEndpoint: "verified" };
  }
  return {
    connectWebhookEndpoint: "missing",
    connectWebhookEndpointDetail:
      `No enabled API-visible webhook endpoint for ${CONNECT_WEBHOOK_PATH} ` +
      `covering ${REQUIRED_CONNECT_WEBHOOK_EVENTS.join(", ")}. ` +
      "Dashboard-created endpoints may not be API-visible - confirm in the " +
      "Dashboard before treating this as a real gap.",
  };
}

export async function verifyStripeConnectConfiguration(
  dependencies?: ConnectVerificationDependencies,
): Promise<ConnectVerificationResult> {
  const config = getStripeConnectRuntimeConfig();
  const listAccounts = dependencies?.listAccounts ?? listAccountsWithStripe;
  const listWebhookEndpoints =
    dependencies?.listWebhookEndpoints ?? listWebhookEndpointsWithStripe;

  let accounts: { data: AccountSummary[] };
  try {
    accounts = await listAccounts({ limit: 1 });
  } catch (error) {
    failContract(
      "STRIPE_CONNECT_ACCOUNTS_UNREACHABLE",
      `Stripe could not list connected accounts: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const connectedAccountsExist = accounts.data.length > 0;

  let platformProfileStatus: ConnectVerificationResult["platformProfileStatus"];
  let platformProfileGuidance: string | undefined;
  if (config.environment !== "production") {
    // Test mode never enforces the platform profile, so a staging run can
    // neither prove nor disprove live readiness.
    platformProfileStatus = "not-enforced-in-test-mode";
  } else if (connectedAccountsExist) {
    // A live connected account cannot exist unless the platform profile is
    // complete, so this is a sufficient read-only proof.
    platformProfileStatus = "proven";
  } else {
    platformProfileStatus = "indeterminate";
    platformProfileGuidance = PLATFORM_PROFILE_INDETERMINATE_GUIDANCE;
  }

  const webhook = await checkConnectWebhookEndpoint(listWebhookEndpoints);

  return {
    environment: config.environment,
    ledgerEnvironment: config.ledgerEnvironment,
    connectApiReachable: true,
    connectedAccountsExist,
    platformProfileProven: platformProfileStatus === "proven",
    platformProfileStatus,
    ...(platformProfileGuidance ? { platformProfileGuidance } : {}),
    ...webhook,
  };
}
