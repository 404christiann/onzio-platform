"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import EditorialClubStoryView from "@/components/editorial/EditorialClubStoryView";
import { fetchAboutClubContent } from "@/lib/queries";

/**
 * Fetches the club's real story paragraphs (`about_page_content`, the same
 * tenant-scoped `fetchAboutClubContent` the classic `/club/about` page and
 * the homepage story teaser already use — no duplicate query added) once
 * here and passes them down to the presentational `EditorialClubStoryView`,
 * mirroring `EditorialRoster`/`EditorialSchedule`'s fetch-once-and-pass-down
 * container convention.
 */
export default function EditorialClubStory() {
  const club = useClubContext();
  const [storyParagraphs, setStoryParagraphs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAboutClubContent(club.id)
      .then(({ about }) => {
        if (!cancelled) setStoryParagraphs(about.story_paragraphs);
      })
      .catch((error) => {
        console.error("EditorialClubStory:", error);
        if (!cancelled) setStoryParagraphs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  return <EditorialClubStoryView storyParagraphs={storyParagraphs} />;
}
