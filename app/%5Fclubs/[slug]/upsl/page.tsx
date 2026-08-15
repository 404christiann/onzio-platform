import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayInvertedFeature from "@/components/pathway/PathwayInvertedFeature";
import PathwayNumberedSteps from "@/components/pathway/PathwayNumberedSteps";
import { upslContent } from "@/components/pathway/content";

// pathway@1 UPSL page (MLA P1 Step 6): the fourth pathway stage, the club's
// senior league affiliation. Composition: hero (left) + inverted-feature
// (dark band, the one place Phase 1 breaks the paper-white rhythm) +
// numbered-steps explaining entry (informational only -- no payment
// affordances anywhere on this page).
export default async function TenantUpslPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...upslContent.hero} />
      <PathwayInvertedFeature {...upslContent.feature} />
      <PathwayNumberedSteps {...upslContent.steps} />
    </>
  );
}
