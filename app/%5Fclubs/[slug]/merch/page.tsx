import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayMerchStore from "@/components/pathway/PathwayMerchStore";
import { merchContent } from "@/components/pathway/content";

// pathway@1 Merch page: two real jersey collections with independent color
// selectors. Ordering remains a direct club conversation; there is no cart.
export default async function TenantMerchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return <PathwayMerchStore {...merchContent} />;
}
