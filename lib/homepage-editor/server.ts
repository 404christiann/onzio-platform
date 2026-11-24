import type { CinematicArtwork, CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
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
  const hydrateArt = <T extends CinematicArtwork>(art: T): T => {
    const asset = art.assetId ? assets.get(art.assetId) : undefined;
    if (!asset || asset.storage_bucket !== "onzio-media" || !base) return { ...art, url: null };
    return { ...art, url: `${base}/storage/v1/object/public/onzio-media/${asset.storage_path.split("/").map(encodeURIComponent).join("/")}` };
  };
  const revamp = snapshot.content.revamp;
  const hydratedRevamp: CinematicHomepageContent | undefined = revamp ? {
    ...revamp,
    navigation: { ...revamp.navigation, destinations: { tryouts: revamp.navigation.destinations?.tryouts ?? "", mediaCredentials: revamp.navigation.destinations?.mediaCredentials ?? "", nationalAnthem: revamp.navigation.destinations?.nationalAnthem ?? "" } },
    raffle: hydrateArt(revamp.raffle), ticket: { ...hydrateArt(revamp.ticket), visible: revamp.ticket.visible },
    footerLogo: hydrateArt(revamp.footerLogo ?? { assetId: null, url: null, alt: "" }),
    championship: { ...revamp.championship, trophy: hydrateArt(revamp.championship.trophy) },
    presentation: { ...revamp.presentation, headerPartner: hydrateArt(revamp.presentation.headerPartner), heroPoster: hydrateArt(revamp.presentation.heroPoster), seatsBackground: hydrateArt(revamp.presentation.seatsBackground), episodePoster: hydrateArt(revamp.presentation.episodePoster) },
  } : undefined;
  return {
    ...snapshot,
    content: {
      ...snapshot.content,
      ...(hydratedRevamp ? { revamp: hydratedRevamp } : {}),
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
