"use client";

import { useState, type ReactNode } from "react";
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

function Loading({ section }: { section: "hero" | "shop" | "match" | "story" | "other" }) {
  const club = useClubContext();
  if (section === "hero") return <AcademyHeroLoadingSkeleton clubName={club.name} />;
  if (section === "shop") return <AcademyShopLoadingSkeleton />;
  if (section === "match") return <AcademyMatchLoadingSkeleton />;
  if (section === "story") return <AcademyStoryLoadingSkeleton />;
  return <AcademySectionLoadingSkeleton />;
}

const Hero = nextDynamic(() => import("@/components/Hero"), { ssr: false, loading: () => <Loading section="hero" /> });
const HomeShop = nextDynamic(() => import("@/components/AcademyHomeShopFeature"), { ssr: false, loading: () => <Loading section="shop" /> });
const NextMatch = nextDynamic(() => import("@/components/AcademyNextMatch"), { ssr: false, loading: () => <Loading section="match" /> });
const Story = nextDynamic(() => import("@/components/DevelopingNextGeneration"), { ssr: false, loading: () => <Loading section="story" /> });
const Photos = nextDynamic(() => import("@/components/PhotoSlideshow"), { ssr: false, loading: () => <Loading section="other" /> });
const Sponsors = nextDynamic(() => import("@/components/SponsorCarouselContainer"), { ssr: false, loading: () => <Loading section="other" /> });
const Standings = nextDynamic(() => import("@/components/LeagueStandingsContainer"), { ssr: false, loading: () => <Loading section="other" /> });
const Programs = nextDynamic(() => import("@/components/AcademyProgramsPathway"), { ssr: false, loading: () => <Loading section="other" /> });
const Video = nextDynamic(() => import("@/components/BehindTheRose"), { ssr: false, loading: () => <Loading section="other" /> });

export default function DiverseCityHomePage({ initialHeroContent, initialStoryContent, championsBadge }: {
  initialHeroContent: DBHomepageHeroContent | null;
  initialStoryContent?: HomepageStoryContent | null;
  championsBadge: ReactNode;
}) {
  const preview = useHomepagePreview();
  const [academyHeroReady, setAcademyHeroReady] = useState(false);
  const covered = preview === null && !academyHeroReady;

  return (
    <>
      <Hero initialContent={initialHeroContent} onAcademyMediaReady={() => setAcademyHeroReady(true)} />
      <div inert={covered} aria-hidden={covered} data-academy-home-content="">
        <HomeShop />
        {championsBadge}
        <NextMatch />
        <Story initialStoryContent={initialStoryContent} />
        <Photos />
        <Sponsors />
        <Standings />
        <Programs />
        <Video />
      </div>
    </>
  );
}
