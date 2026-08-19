"use client";

import { useEffect, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchAboutClubContent } from "@/lib/queries";
import type { DBAboutPageContent } from "@/lib/db-types";

/**
 * crest.feature-band -- carries club-identity copy (contentDomain "about",
 * emptyBehavior "hide").
 *
 * Reuses fetchAboutClubContent, the same "about" domain fetch
 * components/ClubhouseHomePage.tsx's ClubhouseClubStory and
 * components/editorial/EditorialHome.tsx already use for their own
 * shared.history-equivalent bands, rather than introducing a second query
 * for content the platform already fetches one way.
 *
 * 2026-08-19: this was an inverted black/navy band (white text on a dark
 * fill). Live-measured MLA (the real pathway@1 reference site) has no
 * dark/inverted section anywhere on the page -- every section is white or
 * barely-off-white, with color coming from a brand-colored headline and
 * accent text against that light ground, not from a dark section fill.
 * Reworked to match: near-white background (--crest-surface-subtle, see
 * styles/globals.css's `.crest-home` block), dark ink body copy, and the
 * heading in red (the template's primary action color, standing in for
 * MLA's navy-as-headline-color choice at this size/weight -- verified
 * against the contrast validator, see .crest-feature-band-head h2's CSS
 * comment). All markup/JSX below is unchanged from before this pass; only
 * styles/globals.css's `.crest-feature-band*` rules changed.
 */
export default function CrestFeatureBand() {
  const club = useClubContext();
  const [about, setAbout] = useState<DBAboutPageContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAboutClubContent(club.id)
      .then((content) => {
        if (!cancelled) setAbout(content.about);
      })
      .catch((error: unknown) => {
        console.error("CrestFeatureBand: fetchAboutClubContent:", error);
        if (!cancelled) setAbout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  const heading = about?.hero_title?.trim() ?? "";
  const story = about?.story_paragraphs?.[0]?.trim() ?? "";
  const values = about?.values?.map((value) => value.title).filter(Boolean) ?? [];

  // emptyBehavior "hide": nothing worth showing yet.
  if (!heading && !story) return null;

  return (
    <section className="crest-feature-band">
      <div className="crest-feature-band-inner">
        <header className="crest-feature-band-head">
          <span className="crest-feature-band-kicker">Our identity</span>
          {heading && <h2>{heading}</h2>}
        </header>
        {story && <p className="crest-feature-band-story">{story}</p>}
        {values.length > 0 && (
          <ul className="crest-feature-band-values" aria-label={`What defines ${club.name}`}>
            {values.slice(0, 3).map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
