"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import EditorialHero from "@/components/editorial/EditorialHero";
import EditorialNextMatch from "@/components/editorial/EditorialNextMatch";
import EditorialMatchdaySlideshow from "@/components/editorial/EditorialMatchdaySlideshow";
import EditorialStoryTeaser from "@/components/editorial/EditorialStoryTeaser";
import { fetchAboutClubContent, fetchHomepageContent, fetchSchedule } from "@/lib/queries";
import type { Fixture } from "@/lib/data";
import type { DBHomepageHeroContent, DBHomepageSlideshowPhoto } from "@/lib/db-types";

/**
 * Real editorial@1 Lions homepage. Section order: Hero -> Next Match ->
 * Matchday gallery -> "Our story" teaser -- same composition the superseded
 * reference branch's EditorialHome.tsx used, rewired to this branch's real
 * data sources (see components/editorial/EditorialHero.tsx and
 * components/editorial/EditorialShell.tsx for the schema-level rewiring
 * notes).
 *
 * Fetches fixtures, slideshow photos, and the about-page excerpt once here
 * and passes them down as props, so each section stays a small,
 * independently testable presentational component instead of duplicating
 * data fetching per section -- the same shape EditorialHome used on the
 * reference branch. initialHeroContent is the one exception: it is resolved
 * server-side by app/%5Fclubs/[slug]/page.tsx and threaded through
 * HomePageClient exactly like every other template's Hero, so this
 * component only forwards it to EditorialHero rather than re-fetching it.
 */
export default function EditorialHome({
  initialHeroContent,
}: {
  initialHeroContent: DBHomepageHeroContent | null;
}) {
  const club = useClubContext();
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [slideshowPhotos, setSlideshowPhotos] = useState<DBHomepageSlideshowPhoto[]>([]);
  const [storyExcerpt, setStoryExcerpt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchSchedule(undefined, club.id)
      .then((rows) => {
        if (!cancelled) setFixtures(rows);
      })
      .catch((error: unknown) => {
        console.error("EditorialHome: fetchSchedule:", error);
        if (!cancelled) setFixtures([]);
      });

    fetchHomepageContent(club.id)
      .then(({ slideshowPhotos: photos }) => {
        if (!cancelled) setSlideshowPhotos(photos);
      })
      .catch((error: unknown) => {
        console.error("EditorialHome: fetchHomepageContent:", error);
        if (!cancelled) setSlideshowPhotos([]);
      });

    fetchAboutClubContent(club.id)
      .then(({ about }) => {
        if (!cancelled) setStoryExcerpt(about.story_paragraphs[0] ?? null);
      })
      .catch((error: unknown) => {
        console.error("EditorialHome: fetchAboutClubContent:", error);
        if (!cancelled) setStoryExcerpt(null);
      });

    return () => {
      cancelled = true;
    };
  }, [club.id]);

  return (
    <>
      <EditorialHero initialHeroContent={initialHeroContent} />
      <EditorialNextMatch fixtures={fixtures} />
      <EditorialMatchdaySlideshow photos={slideshowPhotos} />
      <EditorialStoryTeaser excerpt={storyExcerpt} />
    </>
  );
}
