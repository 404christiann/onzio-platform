"use client";

import { useEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";

const SLIDE_DURATION = 4000;

/**
 * Editorial "Matchday gallery" slideshow, ported from the approved concept
 * mockup (soccerplatformmockups src/components/public/MatchdaySlideshow.tsx).
 *
 * Presentational: the caller supplies the already-fetched, sort-ordered
 * `homepage_slideshow_photos` rows so this component stays independently
 * unit-testable (including the empty-list case) and never issues its own
 * fetch. Advances every four seconds, pauses on pointer or keyboard
 * interaction, exposes arrow and direct slide controls, disables autoplay
 * under `prefers-reduced-motion`, and hides the whole section when there are
 * no photos. The heading text (e.g. "This is how" / "Columbus roars.") comes
 * from `club_identity.slideshow_heading_top/em`, never hardcoded per club.
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
      className="matchday-slideshow"
      aria-labelledby="matchday-slideshow-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="matchday-slides" aria-live="polite">
        {photos.map((photo, index) => (
          <div
            className="matchday-slide"
            data-active={index === safeCurrent}
            key={photo.id}
            aria-hidden={index !== safeCurrent}
          >
            <Image
              className="matchday-slide-backdrop"
              src={photo.url}
              alt=""
              fill
              sizes="100vw"
              {...imageDeliveryProps("photograph")}
            />
            <div className="matchday-slide-shade" />
            <div className="matchday-slide-image">
              <Image
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
        <div className="matchday-copy">
          <h2 id="matchday-slideshow-title">
            {headingTop}
            {headingEm && (
              <>
                <br />
                <em>{headingEm}</em>
              </>
            )}
          </h2>
        </div>
      )}

      <div className="matchday-controls">
        <div className="matchday-arrows">
          <button type="button" onClick={previousSlide} aria-label="Previous matchday photo">
            ←
          </button>
          <button type="button" onClick={nextSlide} aria-label="Next matchday photo">
            →
          </button>
        </div>
        <span className="matchday-count">
          {String(safeCurrent + 1).padStart(2, "0")} /{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <div className="matchday-progress" aria-label="Choose a matchday photo">
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo.id}
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
