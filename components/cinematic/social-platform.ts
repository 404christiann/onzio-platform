import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import { socialPlatformOf } from "@/lib/social-links";

const PLATFORMS: readonly SiteSocialPlatform[] = ["instagram", "facebook", "tiktok", "youtube", "x"];

/** Imported social rows can have UUID primary keys; their existing icon identifies the brand. */
export const cinematicSocialPlatform = socialPlatformOf;

/** Metadata is safe to supply for an explicitly entered link; destinations are always club data. */
const ICON_METADATA: Record<SiteSocialPlatform, { label: string; icon: string; order: number }> = {
  instagram: { label: "Instagram", icon: "/images/logo/instagramLogo.svg", order: 0 },
  facebook: { label: "Facebook", icon: "/images/logo/facebookLogo.svg", order: 1 },
  tiktok: { label: "TikTok", icon: "/images/logo/tiktokLogo.svg", order: 2 },
  x: { label: "X", icon: "/images/logo/xLogo.svg", order: 3 },
  youtube: { label: "YouTube", icon: "/images/logo/youtubeLogo.svg", order: 4 },
};

export function cinematicDisplaySocialLinks(rows: readonly DBSiteSocialLink[], overrides?: Partial<Record<string, string>>): DBSiteSocialLink[] {
  const selected = new Map<string, DBSiteSocialLink>();
  for (const row of rows) {
    const platform = cinematicSocialPlatform(row);
    const key = platform ? `platform:${platform}` : `row:${row.id}`;
    const previous = selected.get(key);
    // A saved canonical row owns the platform even when its href is blank.
    if (!previous || (platform && row.id === platform && previous.id !== platform)) selected.set(key, row);
  }
  const hasOverride = (key: string) => overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, key) && typeof overrides[key] === "string";
  const displayed: DBSiteSocialLink[] = [];
  for (const row of selected.values()) {
    const platform = cinematicSocialPlatform(row);
    const overrideKey = platform && hasOverride(platform) ? platform : hasOverride(row.id) ? row.id : null;
    const href = overrideKey ? overrides?.[overrideKey] ?? "" : row.href;
    if (href.trim()) displayed.push({ ...row, href });
  }
  for (const platform of PLATFORMS) {
    if (selected.has(`platform:${platform}`) || !hasOverride(platform)) continue;
    const href = overrides?.[platform] ?? "";
    if (!href.trim()) continue;
    const metadata = ICON_METADATA[platform];
    displayed.push({ id: platform, label: metadata.label, href, icon: metadata.icon, sort_order: metadata.order, updated_at: "" });
  }
  return displayed.sort((left, right) => left.sort_order - right.sort_order);
}
