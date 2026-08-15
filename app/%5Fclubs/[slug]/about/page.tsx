import { notFound } from "next/navigation";
import { getClubContextBySlug } from "@/lib/club-context";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwaySplitFeature from "@/components/pathway/PathwaySplitFeature";
import { aboutContent } from "@/components/pathway/content";

// pathway@1 About page (MLA P1 Step 6): the flat `/about` route (distinct
// from the sports-CMS `club/about` route, which pathway@1 does not use --
// see the notFound() guard added to app/%5Fclubs/[slug]/club/about/page.tsx).
// Composition: hero (left) + split-feature.
export default async function TenantPathwayAboutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);
  if (club.presentationTemplateKey !== "pathway@1") notFound();

  return (
    <>
      <PathwayHero {...aboutContent.hero} />
      <PathwaySplitFeature {...aboutContent.feature} />
    </>
  );
}
