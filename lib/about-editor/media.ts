import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";
import { normalizeClubLogoFeatures, normalizeClubLogoColorCards } from "@/lib/about-content";
const marker = "/storage/v1/object/public/onzio-media/";
/** SQL stores asset paths without an untrusted origin. Preserve legacy images. */
export function aboutEditorMediaUrl(url: string): string {
  if (typeof url !== "string" || !url.startsWith(marker)) return url;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  return `${base.replace(/\/$/, "")}${url}`;
}
export function hydrateAboutEditorMedia<T extends DBAboutPageContent | DBClubLogoPageContent>(content: T): T {
  if ("feature_image_url" in content) return { ...content, feature_image_url: aboutEditorMediaUrl(content.feature_image_url) };
  return { ...content, annotated_image_url: aboutEditorMediaUrl(content.annotated_image_url), map_image_url: aboutEditorMediaUrl(content.map_image_url),
    features: normalizeClubLogoFeatures(content.features, []).map(feature => ({ ...feature, patch_url: aboutEditorMediaUrl(feature.patch_url), icon_url: aboutEditorMediaUrl(feature.icon_url) })),
    color_cards: normalizeClubLogoColorCards(content.color_cards, []).map(card => ({ ...card, image_url: aboutEditorMediaUrl(card.image_url) })) };
}
