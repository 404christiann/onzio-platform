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

function getStripeBaseRuntimeConfig() {
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
  } as const;
}

/** Billing-specific Stripe configuration. Keep this API stable for billing. */
export function getStripeRuntimeConfig() {
  const baseConfig = getStripeBaseRuntimeConfig();
  // The Portal configuration is validated in the shared billing check every
  // billing Stripe route runs. In August 2026 a portal-only check let
  // production go live with Checkout and the webhook working while the Portal
  // ID was unset. Connect deliberately uses its own smaller configuration.
  const portalConfigurationId =
    process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (!portalConfigurationId) {
    failContract(
      "STRIPE_PORTAL_CONFIGURATION_MISSING",
      "STRIPE_PORTAL_CONFIGURATION_ID is required.",
    );
  }

  return {
    ...baseConfig,
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    portalConfigurationId,
  } as const;
}

/**
 * Connect has a separate webhook endpoint and deliberately does not depend on
 * the platform subscription Price configuration.
 */
export function getStripeConnectRuntimeConfig() {
  return {
    ...getStripeBaseRuntimeConfig(),
    webhookSecret: required("STRIPE_CONNECT_WEBHOOK_SECRET"),
  } as const;
}

/** This review build is deliberately incapable of registration live-mode calls. */
export function getStripeRegistrationRuntimeConfig() {
  const config = getStripeConnectRuntimeConfig();
  if (config.environment !== "staging" || config.ledgerEnvironment !== "test") {
    failContract(
      "REGISTRATION_STRIPE_TEST_MODE_REQUIRED",
      "Registration payments are restricted to Stripe test mode in this build.",
    );
  }
  return config;
}

/** $0 registrations need only the isolated local/test ledger environment. */
export function getRegistrationLedgerEnvironment(): "test" {
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    failContract(
      "REGISTRATION_STRIPE_TEST_MODE_REQUIRED",
      "Registrations are restricted to the staging/test environment in this build.",
    );
  }
  return "test";
}

export function verifiedClubOrigin(primaryDomain: string): string {
  const isLocal =
    primaryDomain === "localhost" || primaryDomain.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${primaryDomain}`;
}

/**
 * Keeps hosted redirects pinned to the verified primary domain while allowing
 * a matching tenant localhost (and its development port) in staging only.
 */
export function verifiedClubRequestOrigin(input: {
  primaryDomain: string;
  clubSlug: string;
  requestHost: string | null;
}): string {
  const canonical = verifiedClubOrigin(input.primaryDomain);
  if (process.env.ONZIO_ENVIRONMENT !== "staging") return canonical;

  let request: URL;
  try {
    request = new URL(`http://${input.requestHost ?? ""}`);
  } catch {
    return canonical;
  }
  if (request.username || request.password) return canonical;
  const hostname = request.hostname.toLowerCase().replace(/\.$/, "");
  const matchingSubdomain = hostname === `${input.clubSlug}.localhost`;
  const matchingBareLocalhost = hostname === "localhost" &&
    process.env.ONZIO_LOCAL_TENANT_SLUG === input.clubSlug;
  if (
    matchingSubdomain || matchingBareLocalhost
  ) {
    return request.origin;
  }
  return canonical;
}
