"use client";

import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";
import DiverseCityHomePage from "@/components/sites/diverse-city/HomePage";
import type { DBHomepageHeroContent } from "@/lib/db-types";
import type { HomepageStoryContent } from "@/lib/homepage-story-content";

const Hero = nextDynamic(() => import("@/components/Hero"), { ssr: false });
const NextMatchCard = nextDynamic(() => import("@/components/NextMatchCard"), { ssr: false });
const ChampionsBadge = nextDynamic(() => import("@/components/ChampionsBadge"), { ssr: false });
const PhotoSlideshow = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false });
const SponsorCarousel = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false });
const LeagueStandings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false });
const ShopKitSection = nextDynamic(() => import("@/components/ShopKitSectionContainer"), { ssr: false });
const BehindTheRose = nextDynamic(() => import("@/components/BehindTheRose"), { ssr: false });
const ClubhouseHomePage = nextDynamic(() => import("@/components/ClubhouseHomePage"), { ssr: false });
const EditorialHome = nextDynamic(() => import("@/components/editorial/EditorialHome"), { ssr: false });

export default function HomePageClient({
  initialHeroContent,
  initialStoryContent,
}: {
  initialHeroContent: DBHomepageHeroContent | null;
  initialStoryContent?: HomepageStoryContent | null;
}) {
  const club = useClubContext();
  if (club.presentationTemplateKey === "editorial@1") {
    return <EditorialHome initialHeroContent={initialHeroContent} />;
  }
  if (club.presentationTemplateKey === "clubhouse@1") {
    return <ClubhouseHomePage initialHeroContent={initialHeroContent} />;
  }
  const championsBadge = club.slug === "rose-city" ? <ChampionsBadge /> : null;
  if (club.presentationTemplateKey === "academy@1") {
    return (
      <DiverseCityHomePage
        initialHeroContent={initialHeroContent}
        initialStoryContent={initialStoryContent}
        championsBadge={championsBadge}
      />
    );
  }
  return (
    <>
      <Hero initialContent={initialHeroContent} />
      <ShopKitSection surface="home" fadeImageToWhite />
      {championsBadge}
      <NextMatchCard />
      <PhotoSlideshow />
      <SponsorCarousel />
      <LeagueStandings />
      <BehindTheRose />
    </>
  );
}
