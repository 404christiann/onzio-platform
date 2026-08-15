import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySplitFeature from "@/components/pathway/PathwaySplitFeature";
import PathwaySpecList from "@/components/pathway/PathwaySpecList";
import PathwayPriceCards from "@/components/pathway/PathwayPriceCards";
import { academyContent } from "@/components/pathway/content";

// pathway@1 Academy page (MLA P1 Step 6): the flagship first stage of the
// pathway. Composition per the phase plan: hero (left) + split-feature +
// spec-list + price-cards, all sourced from content.ts's academyContent.
export default async function TenantAcademyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...academyContent.hero} />
      <PathwaySplitFeature {...academyContent.feature} />
      <PathwaySpecList {...academyContent.specs} />
      <PathwayPriceCards {...academyContent.packages} />
    </>
  );
}
