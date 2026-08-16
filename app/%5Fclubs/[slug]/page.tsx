import HomePageClient from "@/components/HomePageClient";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayInvertedFeature from "@/components/pathway/PathwayInvertedFeature";
import PathwayRail from "@/components/pathway/PathwayRail";
import PathwayFeatureGrid from "@/components/pathway/PathwayFeatureGrid";
import PathwayPartnerStrip from "@/components/pathway/PathwayPartnerStrip";
import PathwayMission from "@/components/pathway/PathwayMission";
import { HOME_PHOTO_SLOTS, homeContent } from "@/components/pathway/content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchHomepageHeroContent, fetchPathwayHomePhotos } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

// Resolves the homepage hero server-side (same pattern as
// app/%5Fclubs/[slug]/club/about/page.tsx) so the first paint already shows
// this tenant's own copy. Previously this file re-exported the client
// homepage, whose Hero initialized from the hardcoded Rose City default and
// only swapped in the real club's content after a client-side fetch — every
// other club's homepage briefly flashed "Rose City FC" / "Team Store" /
// "Meet the Squad" on load (reported by Diverse City FC).
export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const club = await getClubContextBySlug((await params).slug);

  // pathway@1 (MLA P1 Step 6 + Home sections pass): a fully custom homepage
  // composed of hero (centered), the leader/bio dark band, pathway-rail
  // (the signature Home-only stage spine), the expect-grid, partner-strip
  // and the closing mission statement -- copy from hardcoded content.ts,
  // photographs resolved server-side from the club's
  // homepage_slideshow_photos rows by the HOME_PHOTO_SLOTS sort_order
  // convention. Added ahead of the shared HomePageClient return below,
  // which stays byte-identical for every other template.
  if (club.presentationTemplateKey === "pathway@1") {
    const onzio = (await createClient()).schema("onzio");
    const photos = await fetchPathwayHomePhotos(club.id, onzio).catch(
      (error: unknown) => {
        console.error("TenantHomePage pathway photos:", error);
        return new Map<number, { src: string; alt: string }>();
      },
    );
    const gridSlots = [
      HOME_PHOTO_SLOTS.agility,
      HOME_PHOTO_SLOTS.footSkills,
      HOME_PHOTO_SLOTS.teamwork,
    ];
    return (
      <>
        <PathwayHero
          {...homeContent.hero}
          backgroundMedia={photos.get(HOME_PHOTO_SLOTS.heroBackground)}
        />
        <PathwayInvertedFeature
          {...homeContent.leader}
          media={photos.get(HOME_PHOTO_SLOTS.leader)}
        />
        <PathwayRail {...homeContent.rail} />
        <PathwayFeatureGrid
          {...homeContent.expect}
          columns={homeContent.expect.columns.map((column, index) => ({
            ...column,
            media: photos.get(gridSlots[index]),
          }))}
        />
        <PathwayPartnerStrip {...homeContent.partners} />
        <PathwayMission {...homeContent.mission} />
      </>
    );
  }

  const onzio = (await createClient()).schema("onzio");
  const heroContent = await fetchHomepageHeroContent(club.id, onzio).catch(
    (error: unknown) => {
      console.error("TenantHomePage:", error);
      return null;
    },
  );
  return <HomePageClient initialHeroContent={heroContent} />;
}
