import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";

export const DEFAULT_SITE_SOCIAL_LINKS: DBSiteSocialLink[] = [
  {
    id: "instagram",
    label: "Instagram",
    href: "",
    icon: "/images/logo/instagramLogo.svg",
    sort_order: 0,
    updated_at: "",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "",
    icon: "/images/logo/facebookLogo.svg",
    sort_order: 1,
    updated_at: "",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "",
    icon: "/images/logo/tiktokLogo.svg",
    sort_order: 2,
    updated_at: "",
  },
  {
    id: "x",
    label: "X",
    href: "",
    icon: "/images/logo/xLogo.svg",
    sort_order: 3,
    updated_at: "",
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "",
    icon: "/images/logo/youtubeLogo.svg",
    sort_order: 4,
    updated_at: "",
  },
];

export function normalizeSiteSocialLinks(rows: DBSiteSocialLink[]): DBSiteSocialLink[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return DEFAULT_SITE_SOCIAL_LINKS.map((fallback) => {
    const row = rowById.get(fallback.id);
    // DEFAULT_SITE_SOCIAL_LINKS supplies each platform's label and icon with
    // a blank href, so an unconfigured platform stays hidden. It must never
    // carry a real club's URLs: those leaked into every new club's admin.
    if (!row) return fallback;
    return {
      ...fallback,
      ...row,
      id: fallback.id,
      label: row.label?.trim() || fallback.label,
      href: row.href?.trim() ?? "",
      icon: row.icon?.trim() || fallback.icon,
    };
  });
}

export function socialLinkLabel(platform: SiteSocialPlatform): string {
  return DEFAULT_SITE_SOCIAL_LINKS.find((link) => link.id === platform)?.label ?? platform;
}

const PLATFORM_IDS: readonly SiteSocialPlatform[] = ["instagram", "facebook", "tiktok", "youtube", "x"];
const ICON_PLATFORMS: Record<string, SiteSocialPlatform> = {
  "instagramlogo.svg": "instagram", "facebooklogo.svg": "facebook", "tiktoklogo.svg": "tiktok", "youtubelogo.svg": "youtube", "xlogo.svg": "x",
};

/** The platform a stored row is for. Imported rows can have UUID primary keys; their icon file identifies the brand. */
export function socialPlatformOf(social: { id: string; icon: string }): SiteSocialPlatform | null {
  if ((PLATFORM_IDS as readonly string[]).includes(social.id)) return social.id as SiteSocialPlatform;
  try {
    const path = new URL(social.icon, "https://asset.invalid/").pathname;
    return ICON_PLATFORMS[path.split("/").at(-1)?.toLowerCase() ?? ""] ?? null;
  } catch {
    return null;
  }
}

/**
 * The one legacy -> standard id mapper (RC-ADMIN-4c), used by the Branding load and save. Each row that is for a
 * known platform comes back under that platform's standard id. A row already stored under the standard id wins over
 * a legacy row for the same platform, even when its href is blank (the public footer follows the same rule); among
 * legacy rows the first one wins. Rows it cannot identify are left out (they are never written or deleted here).
 */
export function canonicalizeSocialRows(rows: readonly DBSiteSocialLink[]): DBSiteSocialLink[] {
  const chosen = new Map<SiteSocialPlatform, DBSiteSocialLink>();
  for (const row of rows) {
    const platform = socialPlatformOf(row);
    if (!platform) continue;
    const previous = chosen.get(platform);
    if (!previous || (row.id === platform && previous.id !== platform)) chosen.set(platform, row);
  }
  return [...chosen.entries()].map(([platform, row]) => ({ ...row, id: platform }));
}
