import { failContract } from "@/lib/contract-error";

export type StripeTier = "starter" | "pro";

export type StripeTierConfig = {
  starterPriceId?: unknown;
  proPriceId?: unknown;
  grandfatheredProPriceIds?: unknown;
};

function configuredPrices(
  config: StripeTierConfig = {},
): Record<StripeTier, string> & { grandfatheredPro: string[] } {
  const starter =
    typeof config.starterPriceId === "string"
      ? config.starterPriceId
      : process.env.STRIPE_PRICE_ID_STARTER;
  const pro =
    typeof config.proPriceId === "string"
      ? config.proPriceId
      : process.env.STRIPE_PRICE_ID_PRO;
  const grandfatheredPro = parseGrandfatheredProPriceIds(
    config.grandfatheredProPriceIds ??
      process.env.STRIPE_PRICE_IDS_PRO_GRANDFATHERED,
  );

  // Contract fixtures deliberately use non-secret Stripe test identifiers.
  if (process.env.NODE_ENV === "test") {
    const testPrices = {
      starter: starter || "price_test_starter",
      pro: pro || "price_test_pro",
      grandfatheredPro,
    };
    assertDisjointPrices(testPrices);
    return testPrices;
  }

  if (!starter || !pro || starter === pro) {
    failContract(
      "STRIPE_PRICE_CONFIGURATION_INVALID",
      "Distinct Starter and Pro Stripe Price IDs are required.",
    );
  }

  const prices = { starter, pro, grandfatheredPro };
  assertDisjointPrices(prices);
  return prices;
}

export function parseGrandfatheredProPriceIds(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];

  const candidates =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : null;

  if (!candidates) {
    failContract(
      "STRIPE_PRICE_CONFIGURATION_INVALID",
      "Grandfathered Pro Price IDs must be a comma-separated string or array.",
    );
  }

  const normalized = candidates.map((candidate) =>
    typeof candidate === "string" ? candidate.trim() : "",
  );

  if (
    normalized.some(
      (candidate) => !candidate || !candidate.startsWith("price_"),
    ) ||
    new Set(normalized).size !== normalized.length
  ) {
    failContract(
      "STRIPE_PRICE_CONFIGURATION_INVALID",
      "Grandfathered Pro Price IDs must be unique Stripe Price IDs.",
    );
  }

  return normalized;
}

function assertDisjointPrices(prices: {
  starter: string;
  pro: string;
  grandfatheredPro: string[];
}) {
  if (
    prices.grandfatheredPro.includes(prices.starter) ||
    prices.grandfatheredPro.includes(prices.pro)
  ) {
    failContract(
      "STRIPE_PRICE_CONFIGURATION_INVALID",
      "Grandfathered Pro Price IDs must not overlap standard tier Prices.",
    );
  }
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
  if (priceId === prices.pro || prices.grandfatheredPro.includes(priceId)) {
    return "pro";
  }
  failContract("UNKNOWN_PRICE");
}
