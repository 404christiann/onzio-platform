import { failContract } from "@/lib/contract-error";

export type OnzioEnvironment = "staging" | "production";

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
  if (
    (environment === "staging" && !secretKey.startsWith("sk_test_")) ||
    (environment === "production" && !secretKey.startsWith("sk_live_"))
  ) {
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
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  } as const;
}

export function verifiedClubOrigin(primaryDomain: string): string {
  const isLocal =
    primaryDomain === "localhost" || primaryDomain.endsWith(".localhost");
  return `${isLocal ? "http" : "https"}://${primaryDomain}`;
}
