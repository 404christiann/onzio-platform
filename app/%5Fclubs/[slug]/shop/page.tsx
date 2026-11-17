import { notFound } from "next/navigation";
import ShopPage from "@/app/(public)/shop/page";
import { getClubContextBySlug } from "@/lib/club-context";

export const dynamic = "force-dynamic";

/** The public Shop exists only while the club's operator-only store switch is on. */
export default async function TenantShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (!club.storeEnabled) notFound();
  return <ShopPage />;
}
