import type { DBShopCarouselPhoto, DBShopKitPhoto, DBShopKitSection, DBShopPurchaseDetails, ShopKitVariant } from "@/lib/db-types";
import { DEFAULT_KIT_BULLET_POINTS, DEFAULT_KIT_STORE_NOTE } from "@/lib/shop-kit";
import type { ShopPhoto, ShopSaveRequest, ShopSection, ShopSnapshot, ShopVariant } from "./contract";

export type KitDraft = { exists: boolean; section: ShopSection; photos: ShopPhoto[] };
export type ShopPageDraft = {
  variants: Record<ShopVariant, KitDraft>;
  photoRows: Record<ShopVariant, ShopPhoto[]>;
  purchase: NonNullable<ShopSnapshot["purchase"]>;
  changedVariants: ShopVariant[];
  changedRows: ShopVariant[];
  purchaseChanged: boolean;
};

export const SHOP_VARIANTS: ShopVariant[] = ["home", "third", "away"];

export function emptyShopSection(): ShopSection {
  return {
    eyebrow: "",
    title: "",
    description: "",
    bullet_points: [...DEFAULT_KIT_BULLET_POINTS],
    store_note: DEFAULT_KIT_STORE_NOTE,
    cta_label: "",
    cta_link: "",
  };
}

export function draftFromShopSnapshot(snapshot: ShopSnapshot): ShopPageDraft {
  const variants = Object.fromEntries(SHOP_VARIANTS.map((variant) => {
    const stored = snapshot.sections.find((section) => section.kit_variant === variant);
    return [variant, {
      exists: Boolean(stored),
      section: stored ? {
        eyebrow: stored.eyebrow,
        title: stored.title,
        description: stored.description,
        bullet_points: [...stored.bullet_points],
        store_note: stored.store_note,
        cta_label: stored.cta_label,
        cta_link: stored.cta_link,
      } : emptyShopSection(),
      photos: snapshot.photos.filter((photo) => photo.kit_variant === variant).map((photo) => ({
        rowId: photo.rowId,
        assetId: photo.assetId,
        url: photo.url,
        order: photo.order,
      })),
    }];
  })) as Record<ShopVariant, KitDraft>;
  const photoRows = Object.fromEntries(SHOP_VARIANTS.map((variant) => [
    variant,
    snapshot.photoRows.filter((photo) => photo.kit_variant === variant).map((photo) => ({
      rowId: photo.rowId,
      assetId: photo.assetId,
      url: photo.url,
      order: photo.order,
    })),
  ])) as Record<ShopVariant, ShopPhoto[]>;
  return {
    variants,
    photoRows,
    purchase: snapshot.purchase ?? { heading: "", cards: [], cta_eyebrow: "", cta_text: "", cta_label: "", cta_link: "" },
    changedVariants: [],
    changedRows: [],
    purchaseChanged: false,
  };
}

export function shopDraftDirty(draft: ShopPageDraft | undefined): boolean {
  return Boolean(draft && (draft.changedVariants.length > 0 || draft.changedRows.length > 0 || draft.purchaseChanged));
}

export function toShopSaveRequest(snapshot: ShopSnapshot, draft: ShopPageDraft, operationId: string): ShopSaveRequest {
  const variants: ShopSaveRequest["variants"] = {};
  for (const variant of draft.changedVariants) {
    const kit = draft.variants[variant];
    variants[variant] = {
      section: { ...kit.section, bullet_points: kit.section.bullet_points.map((point) => point.trim()).filter(Boolean) },
      photos: kit.photos.map((photo, order) => ({ rowId: photo.rowId, assetId: photo.assetId, order })),
    };
  }
  const photoRows: NonNullable<ShopSaveRequest["photoRows"]> = {};
  for (const variant of draft.changedRows) {
    photoRows[variant] = draft.photoRows[variant].map((photo, order) => ({ rowId: photo.rowId, assetId: photo.assetId, order }));
  }
  return {
    operationId,
    surface: snapshot.surface,
    expectedRevision: snapshot.revision,
    designRevision: snapshot.designRevision,
    variants,
    ...(draft.changedRows.length > 0 ? { photoRows } : {}),
    ...(draft.purchaseChanged ? { purchase: draft.purchase } : {}),
  };
}

export function publicKit(section: ShopSection, photos: ShopPhoto[], surface: "home" | "shop", variant: ShopKitVariant): {
  section: DBShopKitSection;
  photos: DBShopKitPhoto[];
} {
  return {
    section: { id: `editor-${surface}-${variant}`, surface, kit_variant: variant, ...section, updated_at: "" },
    photos: photos.map((photo, sort_order) => ({ id: photo.rowId ?? `draft-${variant}-${sort_order}`, surface, kit_variant: variant, url: photo.url, sort_order, created_at: "" })),
  };
}

export function publicPhotoRow(photos: ShopPhoto[], variant: ShopKitVariant): DBShopCarouselPhoto[] {
  return photos.map((photo, sort_order) => ({ id: photo.rowId ?? `draft-row-${variant}-${sort_order}`, kit_variant: variant, url: photo.url, sort_order, created_at: "" }));
}

export function publicPurchase(purchase: ShopPageDraft["purchase"]): DBShopPurchaseDetails {
  return { id: 1, ...purchase, updated_at: "" };
}
