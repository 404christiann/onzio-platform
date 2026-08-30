"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import type { DBShopKitPhoto } from "@/lib/db-types";

const SHOP_SLIDE_DURATION = 4000;

/**
 * Multi-photo kit slideshow for editorial@1's store product stage.
 *
 * Presentational and caller-fed, like EditorialMatchdaySlideshow: the caller
 * passes the already-filtered, sort-ordered shop_kit_photos rows for one kit
 * variant. The interaction pattern is deliberately the same as the homepage
 * matchday gallery (4s auto-advance, cross-fade, "01 / 03" counter, prev/next
 * arrows, clickable progress dashes, pause on pointer/keyboard, autoplay off
 * under prefers-reduced-motion) so the store doesn't feel like a one-off --
 * but the markup is scoped to its own .store-product-slide* classes because
 * the store stage is a small light-background product box, not the
 * full-bleed dark cinematic section the .matchday-* rules size for.
 *
 * Only rendered when a variant has more than one photo. The single-photo case
 * stays a plain <ResilientImage> at the call site, unchanged.
 *
 * Callers mount this with key={variant} so switching kit tabs remounts it:
 * the slideshow returns to the first photo and restarts a fresh auto-advance
 * cycle instead of carrying the previous variant's slide index across.
 */
export default function EditorialShopKitSlideshow({
  photos,
  alt,
  priority = false,
}: {
  photos: DBShopKitPhoto[];
  alt: string;
  priority?: boolean;
}) {
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
    }, SHOP_SLIDE_DURATION);

    return () => window.clearInterval(timer);
  }, [paused, photos.length]);

  // Keep the active slide in range if the photo list changes underneath us.
  useEffect(() => {
    setCurrent((index) => (photos.length === 0 ? 0 : index % photos.length));
  }, [photos.length]);

  if (photos.length === 0) return null;

  const safeCurrent = current % photos.length;
  const selectSlide = (index: number) => setCurrent(index);
  const previousSlide = () =>
    setCurrent((index) => (index - 1 + photos.length) % photos.length);
  const nextSlide = () => setCurrent((index) => (index + 1) % photos.length);

  return (
    <div
      className="store-product-slideshow"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="store-product-slides" aria-live="polite">
        {photos.map((photo, index) => (
          <div
            className="store-product-slide"
            data-active={index === safeCurrent}
            key={photo.id}
            aria-hidden={index !== safeCurrent}
          >
            <ResilientImage
              src={photo.url}
              alt={index === 0 ? alt : `${alt} — photo ${index + 1}`}
              fill
              priority={priority && index === 0}
              sizes="(max-width: 1120px) 100vw, 62vw"
              {...imageDeliveryProps("shop-photo")}
            />
          </div>
        ))}
      </div>

      <div className="store-product-slideshow-controls">
        <div className="store-product-slideshow-arrows">
          <button type="button" onClick={previousSlide} aria-label="Previous kit photo">
            ←
          </button>
          <button type="button" onClick={nextSlide} aria-label="Next kit photo">
            →
          </button>
        </div>
        <span className="store-product-slideshow-count">
          {String(safeCurrent + 1).padStart(2, "0")} /{" "}
          {String(photos.length).padStart(2, "0")}
        </span>
        <div className="store-product-slideshow-progress" aria-label="Choose a kit photo">
          {photos.map((photo, index) => (
            <button
              type="button"
              key={photo.id}
              data-active={index === safeCurrent}
              aria-label={`Show kit photo ${index + 1}`}
              aria-current={index === safeCurrent ? "true" : undefined}
              onClick={() => selectSlide(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
