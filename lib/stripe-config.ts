import { ContractError, failContract } from "@/lib/contract-error";

export type OnzioEnvironment = "staging" | "production";

/**
 * Maps a `getStripeRuntimeConfig` failure to the code a caller should surface.
 *
 * `getStripeRuntimeConfig` distinguishes four configuration faults, and
 * collapsing them into one opaque code cost nine days of misdiagnosis during
 * DCFC-701. Callers report the specific code so the fault is identifiable from
 * the response alone. Only the code is surfaced, never the message, which can
 * name the offending variable.
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

  return {
    environment,
    ledgerEnvironment: environment === "production" ? "production" : "test",
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  } as const;
}

export function getStripePortalConfigurationId(): string {
  return required("STRIPE_PORTAL_CONFIGURATION_ID");
}

export function verifiedClubOrigin(primaryDomain: string): string {
  const isLocal =
    primaryDomain === "localhost" || primaryDomain.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${primaryDomain}`;
}
