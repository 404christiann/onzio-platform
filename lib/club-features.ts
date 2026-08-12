export type ClubTier = "starter" | "pro";

// Feature keys not listed here (e.g. "shop", "standings", "sponsors",
// "stats", "seasons") are Pro-only by omission: `clubHasFeature` grants every
// feature to "pro" unconditionally and only checks this allowlist for
// "starter". The public `/shop` route and its nav link are gated on the
// "shop" key platform-wide (both classic and editorial templates) — see
// components/Nav.tsx and app/(public)/shop/page.tsx.
const STARTER_FEATURES = new Set([
  "about",
  "branding",
  "homepage",
  "roster",
  "schedule",
]);

export function clubHasFeature(tier: ClubTier, feature: string): boolean {
  return tier === "pro" || STARTER_FEATURES.has(feature);
}
