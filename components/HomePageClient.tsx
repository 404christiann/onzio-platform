"use client";

import { useState } from "react";
import nextDynamic from "next/dynamic";
import { useClubContext } from "@/components/ClubContextProvider";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import type { DBHomepageHeroContent } from "@/lib/db-types";
import type { HomepageStoryContent } from "@/lib/homepage-story-content";
import {
  AcademyHeroLoadingSkeleton,
  AcademyShopLoadingSkeleton,
  AcademyMatchLoadingSkeleton,
  AcademyStoryLoadingSkeleton,
  AcademySectionLoadingSkeleton,
} from "@/components/AcademyLoadingSkeleton";

function AcademyFallback({ section }: { section: "hero" | "shop" | "match" | "story" | "other" }) {
  const club = useClubContext();
  if (club.presentationTemplateKey !== "academy@1") return null;
  if (section === "hero") return <AcademyHeroLoadingSkeleton clubName={club.name} />;
  if (section === "shop") return <AcademyShopLoadingSkeleton />;
  if (section === "match") return <AcademyMatchLoadingSkeleton />;
  if (section === "story") return <AcademyStoryLoadingSkeleton />;
  return <AcademySectionLoadingSkeleton />;
}

const Hero           = nextDynamic(() => import("@/components/Hero"),           { ssr: false, loading: () => <AcademyFallback section="hero" /> });
const NextMatchCard   = nextDynamic(() => import("@/components/NextMatchCard"),  { ssr: false });
const ChampionsBadge = nextDynamic(() => import("@/components/ChampionsBadge"), { ssr: false });
const PhotoSlideshow = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false, loading: () => <AcademyFallback section="other" /> });
const SponsorCarousel = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false, loading: () => <AcademyFallback section="other" /> });
const LeagueStandings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false, loading: () => <AcademyFallback section="other" /> });
const ShopKitSection  = nextDynamic(() => import("@/components/ShopKitSectionContainer"), { ssr: false });
const BehindTheRose   = nextDynamic(() => import("@/components/BehindTheRose"),   { ssr: false, loading: () => <AcademyFallback section="other" /> });
const ClubhouseHomePage = nextDynamic(() => import("@/components/ClubhouseHomePage"), { ssr: false });
const EditorialHome = nextDynamic(() => import("@/components/editorial/EditorialHome"), { ssr: false });
const DevelopingNextGeneration = nextDynamic(() => import("@/components/DevelopingNextGeneration"), { ssr: false, loading: () => <AcademyFallback section="story" /> });
const AcademyHomeShopFeature = nextDynamic(() => import("@/components/AcademyHomeShopFeature"), { ssr: false, loading: () => <AcademyFallback section="shop" /> });
const AcademyProgramsPathway = nextDynamic(() => import("@/components/AcademyProgramsPathway"), { ssr: false, loading: () => <AcademyFallback section="other" /> });
const AcademyNextMatch = nextDynamic(() => import("@/components/AcademyNextMatch"), { ssr: false, loading: () => <AcademyFallback section="match" /> });

export default function HomePageClient({
  initialHeroContent,
  initialStoryContent,
}: {
  /**
   * Hero content resolved server-side by the tenant homepage
   * (app/%5Fclubs/[slug]/page.tsx) so the first paint already shows this
   * club's own copy. Null only when no server value exists (legacy unscoped
   * route or a failed server fetch); Hero then client-fetches from a
   * tenant-neutral initial state.
   */
  initialHeroContent: DBHomepageHeroContent | null;
  initialStoryContent?: HomepageStoryContent | null;
}) {
  const club = useClubContext();
  const preview = useHomepagePreview();
  const [academyHeroReady, setAcademyHeroReady] = useState(false);
  if (club.presentationTemplateKey === "editorial@1") {
    return <EditorialHome initialHeroContent={initialHeroContent} />;
  }
  if (club.presentationTemplateKey === "clubhouse@1") {
    return <ClubhouseHomePage initialHeroContent={initialHeroContent} />;
  }
  const isAcademy = club.presentationTemplateKey === "academy@1";
  const covered = isAcademy && preview === null && !academyHeroReady;
  const sections = (
    <>
      {isAcademy ? (
        <AcademyHomeShopFeature />
      ) : (
        <ShopKitSection surface="home" fadeImageToWhite />
      )}
      {club.slug === "rose-city" && <ChampionsBadge />}
      {isAcademy ? <AcademyNextMatch /> : <NextMatchCard />}
      {isAcademy && <DevelopingNextGeneration initialStoryContent={initialStoryContent} />}
      <PhotoSlideshow />
      <SponsorCarousel />
      <LeagueStandings />
      {isAcademy && <AcademyProgramsPathway />}
      <BehindTheRose />
    </>
  );

  return (
    <>
      <Hero initialContent={initialHeroContent} onAcademyMediaReady={() => setAcademyHeroReady(true)} />
      {isAcademy ? (
        <div inert={covered} aria-hidden={covered} data-academy-home-content="">
          {sections}
        </div>
      ) : sections}
    </>
  );
}
