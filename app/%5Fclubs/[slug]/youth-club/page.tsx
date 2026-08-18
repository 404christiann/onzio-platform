import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayYouthJoin from "@/components/pathway/PathwayYouthJoin";
import { youthClubContent } from "@/components/pathway/content";

// pathway@1 Youth Club page (MLA P1 Step 6): the second pathway stage.
// The supplied invitation/photo opens the page before the focused transition
// from training into a team.
export default async function TenantYouthClubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayYouthJoin {...youthClubContent.join} headingLevel="h1" />
      <PathwayHero {...youthClubContent.hero} headingLevel="h2" />
    </>
  );
}
