"use client";

import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";

export const dynamic = "force-dynamic";

const Hero           = nextDynamic(() => import("@/components/Hero"),           { ssr: false });
const NextMatchCard   = nextDynamic(() => import("@/components/NextMatchCard"),  { ssr: false });
const ChampionsBadge = nextDynamic(() => import("@/components/ChampionsBadge"), { ssr: false });
const PhotoSlideshow = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false });
const SponsorCarousel = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false });
const LeagueStandings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false });
const ShopKitSection  = nextDynamic(() => import("@/components/ShopKitSectionContainer"), { ssr: false });
const BehindTheRose   = nextDynamic(() => import("@/components/BehindTheRose"),   { ssr: false });
const ClubhouseHomePage = nextDynamic(() => import("@/components/ClubhouseHomePage"), { ssr: false });
const DevelopingNextGeneration = nextDynamic(() => import("@/components/DevelopingNextGeneration"), { ssr: false });
const AcademyHomeShopFeature = nextDynamic(() => import("@/components/AcademyHomeShopFeature"), { ssr: false });
const AcademyProgramsPathway = nextDynamic(() => import("@/components/AcademyProgramsPathway"), { ssr: false });

export default function HomePage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseHomePage />;
  const isAcademy = club.presentationTemplateKey === "academy@1";

  return (
    <>
      <Hero />
      {isAcademy ? (
        <AcademyHomeShopFeature />
      ) : (
        <ShopKitSection surface="home" fadeImageToWhite />
      )}
      {club.slug === "rose-city" && <ChampionsBadge />}
      <NextMatchCard />
      {isAcademy && <DevelopingNextGeneration />}
      <PhotoSlideshow />
      <SponsorCarousel />
      <LeagueStandings />
      {isAcademy && <AcademyProgramsPathway />}
      <BehindTheRose />
    </>
  );
}
