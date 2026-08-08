"use client";

import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import ResilientBunnyVideo from "@/components/ResilientBunnyVideo";
import { DIVERSE_CITY_STORY_VIDEO } from "@/lib/bunny-video";

/**
 * "Developing the Next Generation" homepage story section for `academy@1`.
 * Modeled on the approved sales mockup's `VerticalStory()`
 * (onzioProspects/diverse-city-fc/site/components/HomeSections.tsx) — same
 * layout, same real approved marketing copy, now backed by the actual
 * Bunny Stream club-reel video instead of the mockup's local file.
 */
export default function DevelopingNextGeneration() {
  const club = useClubContext();

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
          <h2 className="font-display text-[2.35rem] font-black uppercase italic leading-[.92] text-[#1E3653] sm:text-[3.2rem] md:text-[4rem] lg:text-[4.8rem]">
            Developing the next generation
          </h2>
          <p className="mt-7 font-body text-base leading-8 text-[#51667E]">
            {club.name} combines professional-level coaching, mentorship, and
            community support to help athletes progress from grassroots
            soccer to elite competition. The pathway emphasizes character,
            leadership, and personal growth.
          </p>
          <p className="mt-5 font-body text-base leading-8 text-[#51667E]">
            The club&rsquo;s vision is to become one of the nation&rsquo;s
            leading inclusive soccer organizations while ensuring every
            athlete has a meaningful opportunity to succeed.
          </p>
          <Link
            href="/club/about"
            className="mt-8 inline-block px-7 py-4 font-display text-sm font-bold uppercase text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-red)" }}
          >
            Our Story
          </Link>
        </div>
      </div>
    </section>
  );
}
