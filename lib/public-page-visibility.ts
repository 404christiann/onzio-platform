/**
 * Owner-controlled switch that hides a whole public page from visitors
 * (onzio.clubs.public_page_visibility). Absent or true = shown; only an
 * explicit false hides the page, its nav/footer links and its embedded blocks.
 * Editors stay reachable so owners can keep working on a hidden page.
 */
export const PUBLIC_PAGE_KEYS = ["stadium", "chick-fil-a", "foothill-transit"] as const;

export type PublicPageKey = (typeof PUBLIC_PAGE_KEYS)[number];
export type PublicPageVisibility = Partial<Record<PublicPageKey, boolean>>;

export const PUBLIC_PAGE_PATHS: Record<PublicPageKey, string> = {
  stadium: "/stadium",
  "chick-fil-a": "/stadium/chick-fil-a",
  "foothill-transit": "/stadium/foothill-transit",
};

export function isPublicPageKey(value: unknown): value is PublicPageKey {
  return typeof value === "string" && (PUBLIC_PAGE_KEYS as readonly string[]).includes(value);
}

/** Keeps only known keys with boolean values; anything else reads as shown. */
export function parsePublicPageVisibility(raw: unknown): PublicPageVisibility {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const visibility: PublicPageVisibility = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPublicPageKey(key) && typeof value === "boolean") visibility[key] = value;
  }
  return visibility;
}

export function pageVisible(
  club: { publicPageVisibility?: PublicPageVisibility | null } | null | undefined,
  pageKey: PublicPageKey,
): boolean {
  return club?.publicPageVisibility?.[pageKey] !== false;
}

const pathOf = (href: string) => {
  const path = href.split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
};

type LinkLike = { href?: string };

/**
 * Drops menu links to a hidden page. Every href whose path is a hidden page's path goes, whatever its
 * query or #anchor (so "/stadium#parking-lot-no-5" leaves with "/stadium"). A group left without links
 * leaves too; a group that keeps links stays as it was (the nav never links a group itself).
 * Pure: stays out of the Shop switch, which `withoutShopLinks` owns.
 */
export function withoutHiddenPageLinks<T extends LinkLike & { children?: readonly LinkLike[] }>(
  items: readonly T[],
  club: { publicPageVisibility?: PublicPageVisibility | null } | null | undefined,
): T[] {
  const hidden = new Set(PUBLIC_PAGE_KEYS.filter((key) => !pageVisible(club, key)).map((key) => PUBLIC_PAGE_PATHS[key]));
  if (hidden.size === 0) return [...items];
  const isHidden = (link: LinkLike) => link.href !== undefined && hidden.has(pathOf(link.href));
  const kept: T[] = [];
  for (const item of items) {
    if (!item.children?.length) {
      if (!isHidden(item)) kept.push(item);
      continue;
    }
    const children = item.children.filter((child) => !isHidden(child));
    if (children.length > 0) kept.push(children.length === item.children.length ? item : { ...item, children });
  }
  return kept;
}

/** Shown at the top of an editor while its page is hidden (mirrors SHOP_OFF_BANNER). */
export const PAGE_HIDDEN_BANNER = "Hidden from visitors. You can keep editing. Turn this on to publish it again.";

/** Extra note on the Robinson Stadium editor: what else disappears with the page. */
export const ROBINSON_HIDDEN_NOTE =
  "Hiding Robinson Stadium also hides Stadium parking in the menu and the Stadium link in the footer. Guidelines, the fan code and media credentials stay visible.";

export const VISIBLE_TO_VISITORS_LABEL = "Visible to visitors";
