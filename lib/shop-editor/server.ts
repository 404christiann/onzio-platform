import { createSnapshotPhotoHydrator } from "@/lib/snapshot-photo";
import type { ShopSnapshot } from "@/lib/shop-editor/contract";

/** Resolve only published, tenant-scoped assets included in the page snapshot. */
export function hydrateShopSnapshot(snapshot: ShopSnapshot): ShopSnapshot {
  const hydrate = createSnapshotPhotoHydrator(snapshot.media, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return {
    ...snapshot,
    photos: snapshot.photos.map(hydrate),
    photoRows: snapshot.photoRows.map(hydrate),
    ...(snapshot.operation?.status === "committed"
      ? { operation: { status: "committed" as const, receipt: hydrateShopSnapshot(snapshot.operation.receipt) } }
      : {}),
  };
}
