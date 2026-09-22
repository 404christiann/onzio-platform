import type { HomepageDraft } from "./model";

export type HomepageSnapshot = {
  revision: string;
  designRevision: string;
  content: HomepageDraft;
  media: { id: string; storage_bucket: string; storage_path: string }[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: HomepageSnapshot };
};

/** Use only media returned by the tenant-scoped transaction, including receipts. */
export function hydrateHomepageSnapshot<T extends HomepageSnapshot>(snapshot: T): T {
  const assets = new Map(snapshot.media.map((asset) => [asset.id, asset]));
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      photos: {
        ...snapshot.content.photos,
        items: snapshot.content.photos.items.map((photo) => {
          const asset = photo.assetId ? assets.get(photo.assetId) : undefined;
          if (!asset || asset.storage_bucket !== "onzio-media" || !base) return photo;
          const path = asset.storage_path.split("/").map(encodeURIComponent).join("/");
          return { ...photo, url: `${base}/storage/v1/object/public/onzio-media/${path}` };
        }),
      },
    },
    ...(snapshot.operation?.status === "committed" ? {
      operation: { status: "committed" as const, receipt: hydrateHomepageSnapshot(snapshot.operation.receipt) },
    } : {}),
  };
}
