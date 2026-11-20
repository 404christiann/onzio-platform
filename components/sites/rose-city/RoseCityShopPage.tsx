import CinematicShopPage from "@/components/cinematic/CinematicShopPage";
import type { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicShopContent, fetchCinematicShopPurchase } from "@/lib/cinematic-shop-query";
import { fetchShopCarouselPhotos, fetchShopKitVariants, fetchSiteSponsorLogos } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

type Club = Awaited<ReturnType<typeof getClubContextBySlug>>;

/** Rose City's Shop, fetched on the server so the first paint is the real page, not a loading line. */
export default async function RoseCityShopPage({ club }: { club: Club }) {
  const initial = await (async () => {
    const client = (await createClient()).schema("onzio");
    const [kits, home, away, third, purchase, presentation, sponsors] = await Promise.all([
      fetchShopKitVariants("shop", club.id, client), fetchShopCarouselPhotos("home", club.id, client),
      fetchShopCarouselPhotos("away", club.id, client), fetchShopCarouselPhotos("third", club.id, client),
      fetchCinematicShopPurchase(club.id, client), fetchCinematicShopContent(club.id, client),
      fetchSiteSponsorLogos("carousel", club.id, client),
    ]);
    return { content: { kits, photoRows: { home, away, third }, purchase, presentation, sponsors }, failed: false };
  })().catch((error) => {
    console.error("RoseCityShopPage:", error);
    return { content: null, failed: true };
  });
  return <CinematicShopPage initial={initial} />;
}
