export type ClubTier = "starter" | "pro";

const STARTER_FEATURES = new Set([
  "about",
  "branding",
  "contact",
  "homepage",
  "roster",
  "schedule",
]);

export function clubHasFeature(tier: ClubTier, feature: string): boolean {
  return tier === "pro" || STARTER_FEATURES.has(feature);
}
