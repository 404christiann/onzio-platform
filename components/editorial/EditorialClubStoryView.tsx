"use client";

import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";

/**
 * Presentational editorial club-story page (`/club`), ported from the
 * approved concept mockup's `ClubScreen.tsx` (soccerplatformmockups
 * src/components/public/ClubScreen.tsx): an interior hero, a manifesto
 * section (founded-year story mark, story paragraphs, mission blockquote),
 * a club-highlights list, and a "Find us" info block.
 *
 * Per Christian's already-approved decision from the planning phase, this is
 * story + "Find us" info only — the mockup's decorative, non-functional
 * contact form is intentionally NOT ported. A real contact page/form is
 * explicitly deferred to a later session.
 *
 * The caller (`EditorialClubStory`) supplies the already-fetched
 * `about_page_content.story_paragraphs`; every other field (heading,
 * founded year, mission, highlights, venue, contact) comes from the shared
 * `club_identity` the tenant layout already fetches once for the whole
 * template, via `useEditorialIdentity()` — no duplicate fetch, following the
 * same presentational-view convention `EditorialRosterView`/
 * `EditorialScheduleView` established.
 */
export default function EditorialClubStoryView({
  storyParagraphs,
}: {
  storyParagraphs: string[];
}) {
  const { identity } = useEditorialIdentity();

  const headingTop = identity?.storyHeadingTop ?? "";
  const headingEm = identity?.storyHeadingEm ?? "";
  const foundedYear = identity?.foundedYear ?? null;
  const mission = identity?.mission ?? "";
  const highlights = identity?.highlights ?? [];
  const venue = identity?.venue ?? "";
  const contactAddress = identity?.contactAddress ?? "";
  const contactEmail = identity?.contactEmail ?? "";
  const contactPhone = identity?.contactPhone ?? "";

  return (
    <div className="interior club-page">
      <header className="interior-hero">
        <span className="eyebrow">Our club</span>
        {(headingTop || headingEm) && (
          <h1>
            {headingTop}
            {headingEm && (
              <>
                <br />
                <em>{headingEm}</em>
              </>
            )}
          </h1>
        )}
      </header>

      <section className="manifesto">
        {foundedYear != null && (
          <span className="story-mark" title={`Founded ${foundedYear}`}>
            {String(foundedYear).slice(-2)}
          </span>
        )}
        <div>
          {storyParagraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        {mission && <blockquote>&ldquo;{mission}&rdquo;</blockquote>}
      </section>

      {highlights.length > 0 && (
        <section className="club-highlights">
          <span className="eyebrow">Club highlights</span>
          <ul>
            {highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="find-us">
        <span className="eyebrow">Find us</span>
        <h2>Club contact</h2>
        <div className="find-us-grid">
          <div className="find-us-item">
            <span>Venue</span>
            {venue && <p>{venue}</p>}
            {contactAddress && <p>{contactAddress}</p>}
          </div>
          <div className="find-us-item">
            <span>Contact</span>
            {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
            {contactPhone && <p>{contactPhone}</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
