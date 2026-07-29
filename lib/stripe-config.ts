import { failContract } from "@/lib/contract-error";
import { parseGrandfatheredProPriceIds } from "@/lib/stripe-tiers";

export type OnzioEnvironment = "staging" | "production";

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
    starterPriceId: required("STRIPE_PRICE_ID_STARTER"),
    proPriceId: required("STRIPE_PRICE_ID_PRO"),
    grandfatheredProPriceIds: parseGrandfatheredProPriceIds(
      process.env.STRIPE_PRICE_IDS_PRO_GRANDFATHERED,
    ),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  } as const;
}

export function verifiedClubOrigin(primaryDomain: string): string {
  const isLocal =
    primaryDomain === "localhost" || primaryDomain.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${primaryDomain}`;
}
