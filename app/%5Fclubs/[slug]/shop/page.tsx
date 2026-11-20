import { notFound } from "next/navigation";
import ShopPage from "@/app/(public)/shop/page";
import CinematicShopPage from "@/components/cinematic/CinematicShopPage";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchCinematicShopContent, fetchCinematicShopPurchase } from "@/lib/cinematic-shop-query";
import { fetchShopCarouselPhotos, fetchShopKitVariants, fetchSiteSponsorLogos } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * The public Shop exists only while the club's operator-only store switch is on. Rose City's cinematic@2 Shop is
 * fetched here so the first paint is the real page; every other template renders the existing client page.
 */
export default async function TenantShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (!club.storeEnabled) notFound();
  if (club.presentationTemplateKey !== "cinematic@2") return <ShopPage />;
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
    console.error("TenantShopPage:", error);
    return { content: null, failed: true };
  });
  return <CinematicShopPage initial={initial} />;
}
