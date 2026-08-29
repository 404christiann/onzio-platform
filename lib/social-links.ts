import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";

export const DEFAULT_SITE_SOCIAL_LINKS: DBSiteSocialLink[] = [
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/rosecityfutbolclub/",
    icon: "/images/logo/instagramLogo.svg",
    sort_order: 0,
    updated_at: "",
  },
  {
    id: "facebook",
    label: "Facebook",
    href: "https://www.facebook.com/search/top?q=rose%20city%20futbol%20club",
    icon: "/images/logo/facebookLogo.svg",
    sort_order: 1,
    updated_at: "",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@rosecityfc",
    icon: "/images/logo/tiktokLogo.svg",
    sort_order: 2,
    updated_at: "",
  },
  {
    id: "x",
    label: "X",
    href: "https://x.com/RoseCityFutbol",
    icon: "/images/logo/xLogo.svg",
    sort_order: 3,
    updated_at: "",
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@RoseCityFC",
    icon: "/images/logo/youtubeLogo.svg",
    sort_order: 4,
    updated_at: "",
  },
];

export function normalizeSiteSocialLinks(rows: DBSiteSocialLink[]): DBSiteSocialLink[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return DEFAULT_SITE_SOCIAL_LINKS.map((fallback) => {
    const row = rowById.get(fallback.id);
    // DEFAULT_SITE_SOCIAL_LINKS is seed/placeholder content for a platform
    // that has never been configured at all — i.e. no row exists yet for
    // this club/id. Once a row exists, its own (possibly empty) href is
    // authoritative: an admin who explicitly clears the field must get a
    // genuinely blank, hidden link back, not silently reset to the
    // hardcoded template default. See lib/social-links.ts history /
    // app/admin/(protected)/branding/page.tsx for the cross-tenant leak
    // this previously caused (`"".trim() || fallback.href` always won).
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
