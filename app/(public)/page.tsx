"use client";

import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";

const EditorialHome = nextDynamic(
  () => import("@/components/editorial/EditorialHome"),
);

export const dynamic = "force-dynamic";

const Hero           = nextDynamic(() => import("@/components/Hero"),           { ssr: false });
const NextMatchCard   = nextDynamic(() => import("@/components/NextMatchCard"),  { ssr: false });
const ChampionsBadge = nextDynamic(() => import("@/components/ChampionsBadge"), { ssr: false });
const PhotoSlideshow = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false });
const SponsorCarousel = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false });
const LeagueStandings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false });
const ShopKitSection  = nextDynamic(() => import("@/components/ShopKitSectionContainer"), { ssr: false });
const BehindTheRose   = nextDynamic(() => import("@/components/BehindTheRose"),   { ssr: false });

export default function HomePage() {
  const club = useClubContext();
  // Editorial-template tenants render the real editorial homepage sections
  // (hero, next match, matchday gallery, story teaser); classic tenants
  // render exactly what they rendered before.
  if (club.siteTemplate === "editorial") {
    return <EditorialHome />;
  }
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
