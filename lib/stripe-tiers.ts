import { failContract } from "@/lib/contract-error";

export type StripeTier = "starter" | "pro";

export type StripeTierConfig = {
  starterPriceId?: unknown;
  proPriceId?: unknown;
};

function configuredPrices(
  config: StripeTierConfig = {},
): Record<StripeTier, string> {
  const starter =
    typeof config.starterPriceId === "string"
      ? config.starterPriceId
      : process.env.STRIPE_PRICE_ID_STARTER;
  const pro =
    typeof config.proPriceId === "string"
      ? config.proPriceId
      : process.env.STRIPE_PRICE_ID_PRO;

  // Contract fixtures deliberately use non-secret Stripe test identifiers.
  if (process.env.NODE_ENV === "test") {
    return {
      starter: starter || "price_test_starter",
      pro: pro || "price_test_pro",
    };
  }

  if (!starter || !pro || starter === pro) {
    failContract(
      "STRIPE_PRICE_CONFIGURATION_INVALID",
      "Distinct Starter and Pro Stripe Price IDs are required.",
    );
  }

  return { starter, pro };
}

export function priceIdForTier(
  tier: StripeTier,
  config: StripeTierConfig = {},
): string {
  if (tier !== "starter" && tier !== "pro") {
    failContract("UNKNOWN_TIER");
  }
  return configuredPrices(config)[tier];
}

export function tierForPriceId(
  priceId: string,
  config: StripeTierConfig = {},
): StripeTier {
  const prices = configuredPrices(config);
  if (priceId === prices.starter) return "starter";
  if (priceId === prices.pro) return "pro";
  failContract("UNKNOWN_PRICE");
}
