import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySplitFeature from "@/components/pathway/PathwaySplitFeature";
import { bookTrainingContent } from "@/components/pathway/content";

// pathway@1 Book Training page (MLA P1 Step 6): hero (left) + split-feature.
// Phase 1 has no scheduler, so both the hero and the feature's own CTAs
// already route to /contact (see content.ts) -- no separate CTA block is
// needed on top of what bookTrainingContent already carries.
export default async function TenantBookTrainingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...bookTrainingContent.hero} />
      <PathwaySplitFeature {...bookTrainingContent.feature} />
    </>
  );
}
