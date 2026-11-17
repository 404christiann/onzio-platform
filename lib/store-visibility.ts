export const SHOP_PATH = "/shop";

/** Drops links to the public Shop when the club's operator-only store switch is off. */
export function withoutShopLinks<T extends object>(
  links: readonly T[],
  storeEnabled: boolean,
): T[] {
  return storeEnabled
    ? [...links]
    : links.filter((link) => !("href" in link && link.href === SHOP_PATH));
}

/**
 * Shown at the top of the Shop editor while the club's Shop switch is off.
 * Owners can still prepare and save kits; nothing reaches visitors until Onzio
 * turns the Shop on (Christian, 2026-11-05).
 */
export const SHOP_OFF_BANNER = "Your shop is off. Visitors can't see it yet.";
