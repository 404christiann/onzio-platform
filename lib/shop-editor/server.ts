import type { ShopSnapshot } from "@/lib/shop-editor/contract";
import { withShopDefaults } from "@/lib/cinematic-shop-content";

/** Resolve only published, tenant-scoped assets included in the page snapshot. */
export function hydrateShopSnapshot(snapshot: ShopSnapshot): ShopSnapshot {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const assets = new Map(snapshot.media.map((asset) => [asset.id, asset]));
  const hydrate = <T extends { assetId: string | null; url: string }>(photo: T): T => {
    const asset = photo.assetId ? assets.get(photo.assetId) : undefined;
    if (!base || !asset || asset.storage_bucket !== "onzio-media") return photo;
    const path = asset.storage_path.split("/").map(encodeURIComponent).join("/");
    return { ...photo, url: `${base}/storage/v1/object/public/onzio-media/${path}` };
  };
  return {
    ...snapshot,
    photos: snapshot.photos.map(hydrate),
    photoRows: snapshot.photoRows.map(hydrate),
    ...(snapshot.presentation ? { presentation: (presentation => ({
      ...presentation,
      mapUrl: hydrate({ assetId: presentation.mapAssetId, url: "" }).url,
      mapWidth: presentation.mapAssetId ? assets.get(presentation.mapAssetId)?.width : undefined,
      mapHeight: presentation.mapAssetId ? assets.get(presentation.mapAssetId)?.height : undefined,
      details: presentation.details.map(({ url: _url, width: _width, height: _height, ...detail }) => ({
        ...detail,
        url: hydrate({ assetId: detail.assetId, url: "" }).url,
        width: detail.assetId ? assets.get(detail.assetId)?.width : undefined,
        height: detail.assetId ? assets.get(detail.assetId)?.height : undefined,
      })),
    }))(withShopDefaults(snapshot.presentation)) } : {}),
    ...(snapshot.operation?.status === "committed"
      ? { operation: { status: "committed" as const, receipt: hydrateShopSnapshot(snapshot.operation.receipt) } }
      : {}),
  };
}
