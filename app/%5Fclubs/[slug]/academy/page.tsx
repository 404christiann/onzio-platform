import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayAcademyEditorial from "@/components/pathway/PathwayAcademyEditorial";
import { academyContent } from "@/components/pathway/content";

// pathway@1 Academy page (MLA P1 Step 6): the flagship first stage of the
// pathway. The supplied Academy story/photo now opens the page, followed by
// the focused technical-work invitation; all copy remains in content.ts.
export default async function TenantAcademyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayAcademyEditorial
        {...academyContent.editorial}
        headingLevel="h1"
      />
      <PathwayHero {...academyContent.hero} headingLevel="h2" />
    </>
  );
}
