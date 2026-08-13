"use client";

import { useEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";

const SLIDE_DURATION = 4000;

/**
 * Editorial "Matchday gallery" slideshow, ported near-verbatim from the
 * approved concept mockup via the superseded reference branch's
 * EditorialMatchdaySlideshow.tsx -- its data source (homepage_slideshow_photos
 * via DBHomepageSlideshowPhoto) is unchanged by the Lions E1 schema work, so
 * no data rewiring was needed here, only the import paths.
 *
 * Presentational: the caller supplies the already-fetched, sort-ordered
 * homepage_slideshow_photos rows so this component stays independently
 * unit-testable (including the empty-list case) and never issues its own
 * fetch. Advances every four seconds, pauses on pointer or keyboard
 * interaction, exposes arrow and direct slide controls, disables autoplay
 * under prefers-reduced-motion, and hides the whole section when there are
 * no photos. The heading text (e.g. "This is how" / "Columbus roars.") comes
 * from club_identity.slideshow_heading_top/em, never hardcoded per club.
 */
export default function EditorialMatchdaySlideshow({
  photos,
}: {
  photos: DBHomepageSlideshowPhoto[];
}) {
  const club = useClubContext();
  const { identity } = useEditorialIdentity();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (
      photos.length < 2 ||
      paused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrent((index) => (index + 1) % photos.length);
    }, SLIDE_DURATION);

    return () => window.clearInterval(timer);
  }, [paused, photos.length]);

  // Keep the active slide in range if the photo list changes underneath us.
  useEffect(() => {
    setCurrent((index) => (photos.length === 0 ? 0 : index % photos.length));
  }, [photos.length]);

  if (photos.length === 0) return null;

  const headingTop = identity?.slideshowHeadingTop ?? "";
  const headingEm = identity?.slideshowHeadingEm ?? "";
  const safeCurrent = current % photos.length;

  const selectSlide = (index: number) => setCurrent(index);
  const previousSlide = () =>
    setCurrent((index) => (index - 1 + photos.length) % photos.length);
  const nextSlide = () => setCurrent((index) => (index + 1) % photos.length);

  return (
    <section
      className="matchday-slideshow relative min-h-[720px] overflow-hidden bg-ed-ink text-ed-on-dark"
      aria-labelledby="matchday-slideshow-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="matchday-slides absolute inset-0" aria-live="polite">
        {photos.map((photo, index) => (
          <div
            className="matchday-slide absolute inset-0 opacity-0 transition-opacity duration-700 data-[active=true]:opacity-100"
            data-active={index === safeCurrent}
            key={photo.id}
            aria-hidden={index !== safeCurrent}
          >
            <Image
              className="matchday-slide-backdrop object-cover opacity-25 blur-md scale-105"
              src={photo.url}
              alt=""
              fill
              sizes="100vw"
              {...imageDeliveryProps("photograph")}
            />
            <div className="matchday-slide-shade absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-black/70" />
            <div className="matchday-slide-image absolute bottom-0 right-0 top-0 w-full md:w-[62%]">
              <Image
                className="object-cover"
                src={photo.url}
                alt={photo.alt || `${club.name} matchday photo ${index + 1}`}
                fill
                sizes="(max-width: 800px) 100vw, 58vw"
                {...imageDeliveryProps("photograph")}
              />
            </div>
          </div>
        ))}
      </div>

      {(headingTop || headingEm) && (
        <div className="matchday-copy relative z-10 flex min-h-[720px] max-w-[1180px] items-center px-5 md:mx-auto md:px-8">
          <h2 id="matchday-slideshow-title" className="max-w-[8ch] font-display text-[clamp(3.75rem,11vw,9rem)] font-black uppercase leading-[0.82]">
            {headingTop}
            {headingEm && (
              <>
                <br />
                <em className="not-italic text-ed-accent">{headingEm}</em>
              </>
            )}
          </h2>
        </div>
      )}

      <div className="matchday-controls absolute inset-x-5 bottom-6 z-20 mx-auto flex max-w-[1180px] flex-wrap items-center gap-4 md:inset-x-8">
        <div className="matchday-arrows flex gap-2">
          <button className="grid size-11 place-items-center border border-white/25 font-display text-lg font-black transition hover:border-ed-accent hover:text-ed-accent" type="button" onClick={previousSlide} aria-label="Previous matchday photo">
            &lt;
          </button>
          <button className="grid size-11 place-items-center border border-white/25 font-display text-lg font-black transition hover:border-ed-accent hover:text-ed-accent" type="button" onClick={nextSlide} aria-label="Next matchday photo">
            &gt;
          </button>
        </div>
        <span className="matchday-count font-display text-xs font-black uppercase tracking-[0.16em] text-ed-on-dark-nav">
          {String(safeCurrent + 1).padStart(2, "0")} /{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <div className="matchday-progress flex flex-1 gap-2" aria-label="Choose a matchday photo">
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo.id}
              className="h-1 min-w-8 flex-1 bg-white/25 transition data-[active=true]:bg-ed-accent"
              data-active={index === safeCurrent}
              aria-label={`Show matchday photo ${index + 1}`}
              aria-current={index === safeCurrent ? "true" : undefined}
              onClick={() => selectSlide(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
