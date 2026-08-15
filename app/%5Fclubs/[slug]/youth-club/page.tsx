import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySplitFeature from "@/components/pathway/PathwaySplitFeature";
import PathwaySpecList from "@/components/pathway/PathwaySpecList";
import { youthClubContent } from "@/components/pathway/content";

// pathway@1 Youth Club page (MLA P1 Step 6): the second pathway stage.
// Composition: hero (left) + split-feature + spec-list.
export default async function TenantYouthClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...youthClubContent.hero} />
      <PathwaySplitFeature {...youthClubContent.feature} />
      <PathwaySpecList {...youthClubContent.specs} />
    </>
  );
}
