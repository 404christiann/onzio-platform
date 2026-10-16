import { createSnapshotPhotoHydrator } from "@/lib/snapshot-photo";
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
  const hydrate = createSnapshotPhotoHydrator(snapshot.media, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      photos: {
        ...snapshot.content.photos,
        items: snapshot.content.photos.items.map(hydrate),
      },
    },
    ...(snapshot.operation?.status === "committed" ? {
      operation: { status: "committed" as const, receipt: hydrateHomepageSnapshot(snapshot.operation.receipt) },
    } : {}),
  };
}
