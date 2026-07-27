import type {
  DBShopPurchaseDetails,
  ShopPurchaseDetailCard,
} from "@/lib/db-types";

export const MAX_PURCHASE_DETAIL_CARDS = 4;

export const DEFAULT_SHOP_PURCHASE_DETAILS: DBShopPurchaseDetails = {
  id: 1,
  heading: "Purchase Details",
  cards: [
    {
      label: "What's Included",
      title: "Match jersey package",
      body: "Authentic home jersey, any name and number, league patch, sponsor badges, and raffle ticket entry.",
    },
    {
      label: "Customization",
      title: "Personalize the shirt",
      body: "Add your preferred player name and number at checkout. Custom name service is available as an add-on.",
    },
    {
      label: "Available At",
      title: "Niky's Sports Pasadena",
      body: "33 E Colorado Blvd, Pasadena, CA",
    },
    {
      label: "Purchase Options",
      title: "Online or in-store",
      body: "Order through Niky's online product page or visit the Pasadena shop for in-person pickup and sizing.",
    },
  ],
  cta_eyebrow: "Ready To Order",
  cta_text: "Buy online now or stop by Niky's Sports in Pasadena.",
  cta_label: "Buy Now →",
  cta_link:
    "https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey",
  updated_at: "",
};

export function normalizePurchaseDetailCards(value: unknown): ShopPurchaseDetailCard[] {
  if (!Array.isArray(value)) return [...DEFAULT_SHOP_PURCHASE_DETAILS.cards];

  const cards = value
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const candidate = card as Partial<ShopPurchaseDetailCard>;
      return {
        label: typeof candidate.label === "string" ? candidate.label : "",
        title: typeof candidate.title === "string" ? candidate.title : "",
        body: typeof candidate.body === "string" ? candidate.body : "",
      };
    })
    .filter((card): card is ShopPurchaseDetailCard => card !== null)
    .slice(0, MAX_PURCHASE_DETAIL_CARDS);

  return cards.length > 0 ? cards : [...DEFAULT_SHOP_PURCHASE_DETAILS.cards];
}

export function normalizeShopPurchaseDetails(
  value: DBShopPurchaseDetails | null,
): DBShopPurchaseDetails {
  if (!value) return DEFAULT_SHOP_PURCHASE_DETAILS;
  return {
    ...DEFAULT_SHOP_PURCHASE_DETAILS,
    ...value,
    heading: value.heading || DEFAULT_SHOP_PURCHASE_DETAILS.heading,
    cards: normalizePurchaseDetailCards(value.cards),
    cta_eyebrow: value.cta_eyebrow || DEFAULT_SHOP_PURCHASE_DETAILS.cta_eyebrow,
    cta_text: value.cta_text || DEFAULT_SHOP_PURCHASE_DETAILS.cta_text,
    cta_label: value.cta_label || DEFAULT_SHOP_PURCHASE_DETAILS.cta_label,
    cta_link: value.cta_link || DEFAULT_SHOP_PURCHASE_DETAILS.cta_link,
  };
}
