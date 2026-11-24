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
 * and photos are dropped, unless the shown Third kit still borrows the Away photos (Sam's rule) - then those photos stay.
 */
export function withoutHiddenJerseys<T extends PublicShopContent>(content: T): T {
  const editions = content.presentation.editions ?? [];
  const hidden = editions.map((edition, index) => isShopEditionShown(edition) ? null : SHOP_EDITION_VARIANTS[index]).filter((variant): variant is ShopKitVariant => variant !== null);
  if (!hidden.length) return content;
  const thirdEdition = editions[SHOP_EDITION_VARIANTS.indexOf("third")];
  const thirdBorrowsAway = !!thirdEdition && isShopEditionShown(thirdEdition) && !content.kits.third.photos.length;
  const kits = { ...content.kits }, photoRows = { ...content.photoRows };
  for (const variant of hidden) {
    const keepPhotos = variant === "away" && thirdBorrowsAway;
    kits[variant] = { section: null, photos: keepPhotos ? content.kits.away.photos : [] };
    if (!keepPhotos) photoRows[variant] = [];
  }
  const sent = editions.map(edition => isShopEditionShown(edition) ? edition : { label: "", price: "", line: "", link: "", visible: false });
  return { ...content, kits, photoRows, presentation: { ...content.presentation, editions: sent } };
}
