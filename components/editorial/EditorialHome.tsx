"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import EditorialHero from "@/components/editorial/EditorialHero";
import EditorialNextMatch from "@/components/editorial/EditorialNextMatch";
import EditorialMatchdaySlideshow from "@/components/editorial/EditorialMatchdaySlideshow";
import EditorialStoryTeaser from "@/components/editorial/EditorialStoryTeaser";
import { fetchAboutClubContent, fetchHomepageContent, fetchSchedule } from "@/lib/queries";
import type { Fixture } from "@/lib/data";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";

/**
 * Real Starter-tier Lions homepage for the editorial template.
 *
 * Section order: Hero → Next Match → Matchday gallery → "Our story" teaser.
 * No kit/store, sponsor, or season-selector content — Starter scope per
 * `lib/club-features.ts` (`about`, `branding`, `homepage`, `roster`,
 * `schedule` only).
 *
 * Fetches fixtures, slideshow photos, and the about-page excerpt once here
 * and passes them down as props, so each section stays a small,
 * independently testable presentational component instead of duplicating
 * data fetching per section.
 */
export default function EditorialHome() {
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
      .catch((error) => {
        console.error("EditorialHome: fetchSchedule:", error);
        if (!cancelled) setFixtures([]);
      });

    fetchHomepageContent(club.id)
      .then(({ slideshowPhotos: photos }) => {
        if (!cancelled) setSlideshowPhotos(photos);
      })
      .catch((error) => {
        console.error("EditorialHome: fetchHomepageContent:", error);
        if (!cancelled) setSlideshowPhotos([]);
      });

    fetchAboutClubContent(club.id)
      .then(({ about }) => {
        if (!cancelled) setStoryExcerpt(about.story_paragraphs[0] ?? null);
      })
      .catch((error) => {
        console.error("EditorialHome: fetchAboutClubContent:", error);
        if (!cancelled) setStoryExcerpt(null);
      });

    return () => {
      cancelled = true;
    };
  }, [club.id]);

  return (
    <>
      <EditorialHero />
      <EditorialNextMatch fixtures={fixtures} />
      <EditorialMatchdaySlideshow photos={slideshowPhotos} />
      <EditorialStoryTeaser excerpt={storyExcerpt} />
    </>
  );
}
