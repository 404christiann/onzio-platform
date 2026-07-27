/** Maximum number of photos the shop photo strip can hold. */
export const MAX_PHOTO_STRIP_PHOTOS = 6;

/** Reuses the table-agnostic kit-photo reorder diff for the photo strip table. */
export {
  diffShopKitPhotos as diffPhotoStripPhotos,
  type DraftKitPhoto as DraftPhotoStripPhoto,
} from "@/lib/shop-kit";

export type PhotoStripDisplayMode = "hidden" | "shown";

/** 0 photos hides the strip entirely; any other count shows the full static row. */
export function photoStripDisplayMode(count: number): PhotoStripDisplayMode {
  return count > 0 ? "shown" : "hidden";
}

/** Gates the admin upload control at the 6-photo maximum. */
export function canAddPhotoStripPhoto(count: number): boolean {
  return count < MAX_PHOTO_STRIP_PHOTOS;
}

/** Builds descriptive alt text for a photo strip position. */
export function photoStripPhotoAlt(index: number, total: number): string {
  return `Rose City FC gear photo ${index + 1} of ${total}`;
}
