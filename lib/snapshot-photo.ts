export function createSnapshotPhotoHydrator(
  media: readonly { id: string; storage_bucket: string; storage_path: string }[],
  base: string | undefined,
) {
  const assets = new Map(media.map((asset) => [asset.id, asset]));
  return <T extends { assetId: string | null; url: string | null }>(photo: T): T => {
    const asset = photo.assetId ? assets.get(photo.assetId) : undefined;
    if (!base || !asset || asset.storage_bucket !== "onzio-media") return photo;
    const path = asset.storage_path.split("/").map(encodeURIComponent).join("/");
    return { ...photo, url: `${base}/storage/v1/object/public/onzio-media/${path}` };
  };
}
