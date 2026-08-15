import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySpecList from "@/components/pathway/PathwaySpecList";
import { seniorClubContent } from "@/components/pathway/content";

// pathway@1 Senior Club page (MLA P1 Step 6): the third pathway stage.
// Composition: hero (left) + spec-list. seniorClubContent.specs carries a
// heavy proportion of TBC rows deliberately -- the senior club is the least
// settled stage of the club, and that's the honest state, not a bug.
export default async function TenantSeniorClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...seniorClubContent.hero} />
      <PathwaySpecList {...seniorClubContent.specs} />
    </>
  );
}
