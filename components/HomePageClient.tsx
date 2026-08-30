"use client";

import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBHomepageHeroContent } from "@/lib/db-types";

const Hero           = nextDynamic(() => import("@/components/Hero"),           { ssr: false });
const NextMatchCard   = nextDynamic(() => import("@/components/NextMatchCard"),  { ssr: false });
const ChampionsBadge = nextDynamic(() => import("@/components/ChampionsBadge"), { ssr: false });
const PhotoSlideshow = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false });
const SponsorCarousel = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false });
const LeagueStandings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false });
const ShopKitSection  = nextDynamic(() => import("@/components/ShopKitSectionContainer"), { ssr: false });
const BehindTheRose   = nextDynamic(() => import("@/components/BehindTheRose"),   { ssr: false });
const ClubhouseHomePage = nextDynamic(() => import("@/components/ClubhouseHomePage"), { ssr: false });
const EditorialHome = nextDynamic(() => import("@/components/editorial/EditorialHome"), { ssr: false });
const DevelopingNextGeneration = nextDynamic(() => import("@/components/DevelopingNextGeneration"), { ssr: false });
const AcademyHomeShopFeature = nextDynamic(() => import("@/components/AcademyHomeShopFeature"), { ssr: false });
const AcademyProgramsPathway = nextDynamic(() => import("@/components/AcademyProgramsPathway"), { ssr: false });
const AcademyNextMatch = nextDynamic(() => import("@/components/AcademyNextMatch"), { ssr: false });

export default function HomePageClient({
  initialHeroContent,
}: {
  /**
   * Hero content resolved server-side by the tenant homepage
   * (app/%5Fclubs/[slug]/page.tsx) so the first paint already shows this
   * club's own copy. Null only when no server value exists (legacy unscoped
   * route or a failed server fetch); Hero then client-fetches from a
   * tenant-neutral initial state.
   */
  initialHeroContent: DBHomepageHeroContent | null;
}) {
  const club = useClubContext();
  if (club.presentationTemplateKey === "editorial@1") {
    return <EditorialHome initialHeroContent={initialHeroContent} />;
  }
  if (club.presentationTemplateKey === "clubhouse@1") {
    return <ClubhouseHomePage initialHeroContent={initialHeroContent} />;
  }
  const isAcademy = club.presentationTemplateKey === "academy@1";

  return (
    <>
      <Hero initialContent={initialHeroContent} />
      {isAcademy ? (
        <AcademyHomeShopFeature />
      ) : (
        <ShopKitSection surface="home" fadeImageToWhite />
      )}
      {club.slug === "rose-city" && <ChampionsBadge />}
      {isAcademy ? <AcademyNextMatch /> : <NextMatchCard />}
      {isAcademy && <DevelopingNextGeneration />}
      <PhotoSlideshow />
      <SponsorCarousel />
      <LeagueStandings />
      {isAcademy && <AcademyProgramsPathway />}
      <BehindTheRose />
    </>
  );
}
