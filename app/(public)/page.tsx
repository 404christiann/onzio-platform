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

export default function HomePage() {
  const club = useClubContext();
  if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseHomePage />;

  return (
    <>
      <Hero />
      <ShopKitSection surface="home" fadeImageToWhite />
      {club.slug === "rose-city" && <ChampionsBadge />}
      <NextMatchCard />
      <PhotoSlideshow />
      <SponsorCarousel />
      <LeagueStandings />
      <BehindTheRose />
    </>
  );
}
