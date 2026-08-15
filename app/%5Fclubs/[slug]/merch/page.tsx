import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayPriceCards from "@/components/pathway/PathwayPriceCards";
import { merchContent } from "@/components/pathway/content";

// pathway@1 Merch page (MLA P1 Step 6): hero (left) + price-cards (kits).
// Informational display only -- no store is open yet in Phase 1.
export default async function TenantMerchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...merchContent.hero} />
      <PathwayPriceCards {...merchContent.kits} />
    </>
  );
}
