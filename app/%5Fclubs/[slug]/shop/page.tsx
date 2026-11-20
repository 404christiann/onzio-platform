import { notFound } from "next/navigation";
import ShopPage from "@/app/(public)/shop/page";
import { getClubContextBySlug } from "@/lib/club-context";
import { publicPagesFor } from "@/lib/site-public-pages";

export const dynamic = "force-dynamic";

/**
 * The public Shop exists only while the club's operator-only store switch is on. A club's site package may
 * server-render it; every other club renders the shared client page.
 */
export default async function TenantShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (!club.storeEnabled) notFound();
  const SitePage = publicPagesFor(club)?.shop;
  return SitePage ? <SitePage club={club} /> : <ShopPage />;
}
