import { getStripeClient } from "@/lib/stripe-client";

type PriceInterval = "day" | "week" | "month" | "year";

type StripePriceForDisplay = {
  currency: string;
  unit_amount: number | null;
  recurring: {
    interval: PriceInterval;
    interval_count?: number | null;
  } | null;
};

const INTERVAL_LABELS: Record<PriceInterval, string> = {
  day: "day",
  week: "week",
  month: "mo",
  year: "yr",
};

function pluralizeInterval(interval: PriceInterval) {
  return interval === "month" ? "months" : `${interval}s`;
}

export function formatStripePriceLabel(price: StripePriceForDisplay) {
  if (price.unit_amount === null) {
    return null;
  }

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price.unit_amount / 100);

  if (!price.recurring) {
    return amount;
  }

  const intervalCount = price.recurring.interval_count ?? 1;
  const interval = price.recurring.interval;

  if (intervalCount <= 1) {
    return `${amount}/${INTERVAL_LABELS[interval]}`;
  }

  return `${amount} every ${intervalCount} ${pluralizeInterval(interval)}`;
}

export async function getConfiguredStripePriceLabel() {
  const priceId = process.env.STRIPE_PRICE_ID;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!priceId || !secretKey) {
    return null;
  }

  try {
    const price = await getStripeClient().prices.retrieve(priceId);
    return formatStripePriceLabel(price);
  } catch {
    return null;
  }
}
