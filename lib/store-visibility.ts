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
