"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientBunnyVideo from "@/components/ResilientBunnyVideo";
import { DIVERSE_CITY_HERO_VIDEO } from "@/lib/bunny-video";
import { useHomepagePiece, useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import { EMPTY_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";
import { fetchHomepageHeroContent } from "@/lib/queries";
import type { DBHomepageHeroContent } from "@/lib/db-types";
import { AcademyHeroLoadingSkeleton } from "./LoadingSkeleton";
import { loadAcademyHeroContent } from "./hero-content-load";
import { academyHref } from "./routes";

export default function Hero({
  initialContent,
  onAcademyMediaReady,
}: {
  /**
   * The tenant's hero content, resolved server-side before any HTML is sent
   * (see app/%5Fclubs/[slug]/page.tsx). Required so no consumer can silently
   * fall back to first-painting another club's branding — the Diverse City
   * "Rose City FC" flash. Pass null only when no server value exists (legacy
   * unscoped route, or the server fetch failed); Hero then client-fetches,
   * starting from the tenant-neutral empty state.
   */
  initialContent: DBHomepageHeroContent | null;
  onAcademyMediaReady?: () => void;
}) {
  const preview = useHomepagePreview();
  const editing = preview !== null;
  const selecting = editing && !preview.playback;
  const headingPiece = useHomepagePiece("hero.heading");
  const smallHeadingPiece = useHomepagePiece("hero.eyebrow");
  const paragraphPiece = useHomepagePiece("hero.intro");
  const buttonsPiece = useHomepagePiece("hero.cta");
  const club = useClubContext();
  const hasServerContent = initialContent !== null;
  const [loadedHeroContent, setHeroContent] = useState<DBHomepageHeroContent>(
    initialContent ?? EMPTY_HOMEPAGE_HERO_CONTENT,
  );
  const [heroLoading, setHeroLoading] = useState(initialContent === null);
  const [academyMediaReady, setAcademyMediaReady] = useState(false);

  const heroContent = preview?.draft.hero ?? loadedHeroContent;

  useEffect(() => {
    if (editing || hasServerContent) return;
    return loadAcademyHeroContent({
      read: () => fetchHomepageHeroContent(club.id),
      onContent: setHeroContent,
      onReady: () => setHeroLoading(false),
      onError: (error: unknown) => {
        console.error(
          "Hero:",
          error instanceof Error ? error.message : "Failed to load homepage hero content",
        );
      },
    });
  }, [club.id, hasServerContent, editing]);

  if (!editing && heroLoading) {
    return <AcademyHeroLoadingSkeleton clubName={club.name} />;
  }

  const headlineOne = heroContent.headline_line_one.trim() || club.name;
  const headlineTwo = heroContent.headline_line_two.trim();
  const intro = heroContent.intro.trim();
  const primaryHref = heroContent.primary_cta_href.trim() || academyHref("schedule");
  const secondaryHref = heroContent.secondary_cta_href.trim() || academyHref("roster");

  // Mockup-parity hero (DCFC-D132 pass): section frame, gradient, headline
  // scale/colors, and CTA treatment copied from the sales mockup's
  // Hero.tsx (onzioProspects/diverse-city-fc/site) — second headline line
  // renders in the sky accent, primary CTA is the sharp-cornered red
  // button with the darken-on-hover state. Content stays admin-editable.
  return (
    <section className="relative h-[100svh] min-h-[600px] max-h-[720px] overflow-hidden bg-[#1E3653] text-white md:h-[82svh] md:max-h-[760px]">
      <div className="absolute inset-0">
        <ResilientBunnyVideo
          guid={DIVERSE_CITY_HERO_VIDEO.guid}
          posterSrc={DIVERSE_CITY_HERO_VIDEO.posterSrc}
          alt={`${club.name} hero video`}
          className="h-full w-full object-cover"
          showPosterUntilPlaying
          onVisualReady={() => {
            setAcademyMediaReady(true);
            onAcademyMediaReady?.();
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#14283F] via-[#14283F]/45 to-[#14283F]/30" />
      <div
        className={`relative z-10 mx-auto flex h-full max-w-7xl items-end px-6 pb-12 pt-36 md:pb-8 lg:px-10 ${!editing && !academyMediaReady ? "invisible" : ""}`}
        inert={!editing && !academyMediaReady}
        aria-hidden={!editing && !academyMediaReady}
      >
        <div className="w-full min-w-0 max-w-5xl">
          {(heroContent.eyebrow.trim() || selecting) && (
            <p {...smallHeadingPiece} className="font-display mb-4 text-xs font-bold uppercase tracking-widest text-white/70">
              {heroContent.eyebrow}
            </p>
          )}
          <h1 {...headingPiece} className="max-w-5xl font-display font-black uppercase italic leading-[.88]">
            <span className="block text-[1.9rem] text-[#F9FAFD] sm:text-[2.7rem] md:text-[3.4rem]">
              {headlineOne}
            </span>
            {headlineTwo && (
              <span className="mt-1 block whitespace-nowrap text-[clamp(2rem,8.6vw,2.25rem)] text-[#B9E3F6] sm:text-[3.7rem] md:text-[4.4rem]">
                {headlineTwo}
              </span>
            )}
          </h1>
          {(intro || selecting) && (
            <p {...paragraphPiece} className="mt-7 max-w-2xl font-body text-base leading-7 text-white/80 md:text-lg">
              {intro}
            </p>
          )}
          <div
            {...buttonsPiece}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            style={{ opacity: 1 }}
          >
            <Link
              href={primaryHref}
              className="bg-[#FF1616] px-7 py-4 text-center font-display text-sm font-bold uppercase text-[#F9FAFD] transition-colors hover:bg-[#D70000]"
            >
              {heroContent.primary_cta_label.trim() || "Next match"}
            </Link>
            <Link
              href={secondaryHref}
              className="border border-white/50 px-7 py-4 text-center font-display text-sm font-bold uppercase text-white transition-colors hover:border-white hover:bg-white/10"
            >
              {heroContent.secondary_cta_label.trim() || "Meet the squad"}
            </Link>
          </div>
        </div>
      </div>
      {!editing && !academyMediaReady && (
        <AcademyHeroLoadingSkeleton clubName={club.name} />
      )}
    </section>
  );
}
