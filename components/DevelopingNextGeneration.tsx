"use client";

import { useEffect, useState } from "react";
import { HomepageMissingPiece, HomepagePieceGroup, useHomepagePiece, useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientBunnyVideo from "@/components/ResilientBunnyVideo";
import { DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";
import {
  resolveHomepageStorySection,
  type HomepageStoryContent,
} from "@/lib/homepage-story-content";
import { fetchHomepageStorySection } from "@/lib/queries";
import { AcademyStoryLoadingSkeleton } from "@/components/AcademyLoadingSkeleton";

/**
 * Homepage story section for `academy@1`. Modeled on the approved sales
 * mockup's `VerticalStory()`
 * (onzioProspects/diverse-city-fc/site/components/HomeSections.tsx).
 *
 * The heading, both paragraphs, and the CTA label used to be literals here.
 * They are real club content — the paragraphs state facts about the club and
 * name it — so they now come from `onzio.homepage_story_section`, editable at
 * /admin/homepage, falling back to the approved academy@1 wording in
 * lib/homepage-story-content.ts when a club has not changed them.
 *
 * The CTA destination stays template navigation structure (DCFC-D007), and the
 * Bunny Stream club reel stays a constant: video is outside the text-and-images
 * content boundary (DCFC-D131).
 */
export default function DevelopingNextGeneration({ initialStoryContent }: { initialStoryContent?: HomepageStoryContent | null }) {
  const preview = useHomepagePreview();
  const editing = preview !== null;
  const buttonPiece = useHomepagePiece("story.cta");
  const club = useClubContext();
  const [loadedStory, setStory] = useState<HomepageStoryContent>(() =>
    initialStoryContent ?? resolveHomepageStorySection(null, club.name),
  );
  const [loading, setLoading] = useState(!initialStoryContent);

  const story = preview ? resolveHomepageStorySection({ visible: preview.draft.story.visible, heading: preview.draft.story.heading, body_primary: preview.draft.story.bodyPrimary, body_secondary: preview.draft.story.bodySecondary, cta_label: preview.draft.story.ctaLabel }, club.name) : loadedStory;
  useEffect(() => {
    if (editing || initialStoryContent) return;
    let active = true;
    fetchHomepageStorySection(club.id, club.name)
      .then((content) => {
        if (active) setStory(content);
      })
      .catch((error) => {
        console.error("DevelopingNextGeneration:", error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [club.id, club.name, editing, initialStoryContent]);

  if (!editing && loading) return <AcademyStoryLoadingSkeleton />;
  if (!story.visible) return <HomepageMissingPiece piece="story.text">Your club’s story · Hidden from homepage</HomepageMissingPiece>;

  return (
    <section className="grid bg-[#F9FAFD] lg:grid-cols-[0.9fr_1.1fr]">
      <div className="relative min-h-[420px] overflow-hidden bg-[#1E3653] lg:min-h-[680px]">
        <ResilientBunnyVideo
          guid={DIVERSE_CITY_STORY_VIDEO.guid}
          posterSrc={DIVERSE_CITY_STORY_VIDEO.posterSrc}
          alt={`${club.name} club reel`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="flex min-w-0 items-center px-6 py-16 md:px-12 lg:px-20">
        <div className="w-full min-w-0 max-w-2xl">
          <HomepagePieceGroup piece="story.text"><h2 className="font-display text-[2.35rem] font-black uppercase italic leading-[.92] text-[#1E3653] sm:text-[3.2rem] md:text-[4.4rem] lg:text-[5.8rem]">
            {story.heading}
          </h2>
          <p className="mt-7 font-body text-base leading-8 text-[#51667E]">
            {story.bodyPrimary}
          </p>
          {story.bodySecondary ? (
            <p className="mt-5 font-body text-base leading-8 text-[#51667E]">
              {story.bodySecondary}
            </p>
          ) : null}
          </HomepagePieceGroup>
          {story.ctaLabel ? (
            <Link {...buttonPiece}
              href="/club/about"
              className="mt-8 inline-block px-7 py-4 font-display text-sm font-bold uppercase text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-red)" }}
            >
              {story.ctaLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
