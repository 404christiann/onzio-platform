import { SHOP_EDITION_VARIANTS, isShopEditionShown, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";
import type { DBShopCarouselPhoto, ShopKitVariant } from "@/lib/db-types";
import type { ShopKitContent } from "@/lib/queries";

type PublicShopContent = {
  kits: Record<ShopKitVariant, ShopKitContent>;
  photoRows: Record<ShopKitVariant, DBShopCarouselPhoto[]>;
  presentation: CinematicShopPresentation;
};

/**
 * What visitors are sent: a switched-off jersey keeps only its switch and its place (option i is kit i), and its kit's words
 * and photos are dropped, except the Away lead photos or photo row a shown Third kit still borrows (Sam's rule).
 */
export function withoutHiddenJerseys<T extends PublicShopContent>(content: T): T {
  const editions = content.presentation.editions ?? [];
  const hidden = editions.map((edition, index) => isShopEditionShown(edition) ? null : SHOP_EDITION_VARIANTS[index]).filter((variant): variant is ShopKitVariant => variant !== null);
  if (!hidden.length) return content;
  const thirdEdition = editions[SHOP_EDITION_VARIANTS.indexOf("third")];
  const thirdShown = !!thirdEdition && isShopEditionShown(thirdEdition);
  // The Third kit borrows the Away lead photos and the Away photo row separately, each only while its own is empty.
  const borrowsLead = thirdShown && !content.kits.third.photos.length;
  const borrowsRow = thirdShown && !content.photoRows.third.length;
  const kits = { ...content.kits }, photoRows = { ...content.photoRows };
  for (const variant of hidden) {
    kits[variant] = { section: null, photos: variant === "away" && borrowsLead ? content.kits.away.photos : [] };
    if (!(variant === "away" && borrowsRow)) photoRows[variant] = [];
  }
  const sent = editions.map(edition => isShopEditionShown(edition) ? edition : { label: "", price: "", line: "", link: "", visible: false });
  return { ...content, kits, photoRows, presentation: { ...content.presentation, editions: sent } };
}
