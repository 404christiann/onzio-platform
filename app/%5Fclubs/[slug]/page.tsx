import HomePageClient from "@/components/HomePageClient";
import PathwayHero from "@/components/pathway/PathwayHero";
import PathwayRail from "@/components/pathway/PathwayRail";
import PathwayPartnerStrip from "@/components/pathway/PathwayPartnerStrip";
import { homeContent } from "@/components/pathway/content";
import { getClubContextBySlug } from "@/lib/club-context";
import { fetchHomepageHeroContent } from "@/lib/queries";
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

  // pathway@1 (MLA P1 Step 6): a fully custom homepage composed of hero
  // (centered) + pathway-rail (the signature Home-only stage spine) +
  // partner-strip, from hardcoded content.ts copy -- added ahead of the
  // shared HomePageClient return below, which stays byte-identical for
  // every other template.
  if (club.presentationTemplateKey === "pathway@1") {
    return (
      <>
        <PathwayHero {...homeContent.hero} />
        <PathwayRail {...homeContent.rail} />
        <PathwayPartnerStrip {...homeContent.partners} />
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
