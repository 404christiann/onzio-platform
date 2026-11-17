import type { ShopPhoto, ShopSnapshot, ShopVariant } from "@/lib/shop-editor/contract";
import { draftFromShopSnapshot, SHOP_VARIANTS, type ShopPageDraft } from "@/lib/shop-editor/model";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function kitNeedsPhoto(draft: ShopPageDraft, variant: ShopVariant) {
  const kit = draft.variants[variant];
  const content = Object.values(kit.section).some((value) => Array.isArray(value)
    ? value.some((point) => point.trim()) : value.trim());
  return content && kit.photos.length === 0;
}

export function photoKey(photo: ShopPhoto) {
  return photo.assetId ?? photo.rowId ?? photo.url;
}

export function currentShopPhotos(desired: ShopPhoto[], confirmed: ShopPhoto[]) {
  return desired.map((photo, order) => {
    const stored = confirmed.find((item) => photo.assetId ? item.assetId === photo.assetId : item.rowId === photo.rowId);
    return { ...photo, order, rowId: stored?.rowId ?? (photo.assetId ? null : photo.rowId) };
  });
}

export function confirmShopDraft(submitted: ShopPageDraft, current: ShopPageDraft, receipt: ShopSnapshot): ShopPageDraft {
  const fresh = draftFromShopSnapshot(receipt);
  for (const variant of SHOP_VARIANTS) {
    const before = submitted.variants[variant];
    const latest = current.variants[variant];
    const changedFields = Object.keys(latest.section).filter((field) =>
      !same(latest.section[field as keyof typeof latest.section], before.section[field as keyof typeof latest.section]));
    const photosChanged = !same(latest.photos, before.photos);
    if (changedFields.length || photosChanged) {
      fresh.variants[variant] = { ...fresh.variants[variant], exists: latest.exists,
        section: { ...fresh.variants[variant].section, ...Object.fromEntries(changedFields.map((field) => [field, latest.section[field as keyof typeof latest.section]])) },
        photos: photosChanged ? currentShopPhotos(latest.photos, fresh.variants[variant].photos) : fresh.variants[variant].photos,
      };
      fresh.changedVariants.push(variant);
    }
    if (!same(current.photoRows[variant], submitted.photoRows[variant])) {
      fresh.photoRows[variant] = currentShopPhotos(current.photoRows[variant], fresh.photoRows[variant]);
      fresh.changedRows.push(variant);
    }
  }
  for (const field of Object.keys(current.purchase) as Array<keyof typeof current.purchase>) {
    if (!same(current.purchase[field], submitted.purchase[field])) {
      fresh.purchase = { ...fresh.purchase, [field]: current.purchase[field] };
      fresh.purchaseChanged = true;
    }
  }
  return fresh;
}
