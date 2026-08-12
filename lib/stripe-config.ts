import { ContractError, failContract } from "@/lib/contract-error";

export type OnzioEnvironment = "staging" | "production";

/**
 * Maps a `getStripeRuntimeConfig` failure to the code a caller should surface.
 *
 * `getStripeRuntimeConfig` distinguishes each configuration fault, and
 * collapsing them into one opaque code cost nine days of misdiagnosis during
 * DCFC-701. Callers report the specific code so the fault is identifiable from
 * the response alone. Only the code is surfaced, never the message, which can
 * name the offending variable.
 *
 * The distinguished codes are `STRIPE_ENVIRONMENT_INVALID`,
 * `STRIPE_CONFIGURATION_MISSING` (secret key or webhook secret),
 * `STRIPE_MODE_MISMATCH`, and `STRIPE_PORTAL_CONFIGURATION_MISSING`; anything
 * else falls back to the opaque `WEBHOOK_CONFIGURATION_INVALID`.
 */
export function stripeConfigurationErrorCode(error: unknown): string {
  return error instanceof ContractError
    ? error.code
    : "WEBHOOK_CONFIGURATION_INVALID";
}

function isStripeKeyForEnvironment(
  secretKey: string,
  environment: OnzioEnvironment,
): boolean {
  const mode = environment === "production" ? "live" : "test";
  return (
    secretKey.startsWith(`sk_${mode}_`) ||
    secretKey.startsWith(`rk_${mode}_`)
  );
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) failContract("STRIPE_CONFIGURATION_MISSING", `${name} is required.`);
  return value;
}

export function getStripeRuntimeConfig() {
  const environment = process.env.ONZIO_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") {
    failContract(
      "STRIPE_ENVIRONMENT_INVALID",
      "ONZIO_ENVIRONMENT must be staging or production.",
    );
  }

  const secretKey = required("STRIPE_SECRET_KEY");
  if (!isStripeKeyForEnvironment(secretKey, environment)) {
    failContract(
      "STRIPE_MODE_MISMATCH",
      "Stripe key mode does not match ONZIO_ENVIRONMENT.",
    );
  }

  const webhookSecret = required("STRIPE_WEBHOOK_SECRET");

  // The Portal configuration is validated here, in the shared check every
  // Stripe route runs, rather than in a portal-only helper. In August 2026 a
  // portal-only check let production go live with Checkout and the webhook
  // working while STRIPE_PORTAL_CONFIGURATION_ID was unset; the gap stayed
  // silent until a paying customer clicked "Manage billing". There is one
  // Stripe account and one Portal configuration for the whole platform, so no
  // deploy is correctly configured without it. The fault keeps its own code
  // (not the generic STRIPE_CONFIGURATION_MISSING) so it is identifiable from
  // the response alone — the DCFC-701 discipline.
  const portalConfigurationId =
    process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (!portalConfigurationId) {
    failContract(
      "STRIPE_PORTAL_CONFIGURATION_MISSING",
      "STRIPE_PORTAL_CONFIGURATION_ID is required.",
    );
  }

  return {
    environment,
    ledgerEnvironment: environment === "production" ? "production" : "test",
    webhookSecret,
    portalConfigurationId,
  } as const;
}

export function verifiedClubOrigin(primaryDomain: string): string {
  const isLocal =
    primaryDomain === "localhost" || primaryDomain.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${primaryDomain}`;
}
