"use client";

import {
  type KeyboardEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ResilientImage from "@/components/ResilientImage";
import PathwayImageFallback from "@/components/pathway/PathwayImageFallback";
import { imageDeliveryProps } from "@/lib/image-delivery";

export type PathwayEditorialCarouselPhoto = {
  src: string;
  alt: string;
};

export type PathwayEditorialCarouselProps = {
  photos: PathwayEditorialCarouselPhoto[];
};

const AUTO_ADVANCE_MS = 4500;

export default function PathwayEditorialCarousel({
  photos,
}: PathwayEditorialCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const goToPhoto = useCallback(
    (index: number) => {
      const nextIndex = (index + photos.length) % photos.length;
      const viewport = viewportRef.current;
      const slide = viewport?.querySelector<HTMLElement>(
        `[data-carousel-index="${nextIndex}"]`,
      );

      setActiveIndex(nextIndex);
      if (!viewport || !slide) return;

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      viewport.scrollTo({
        left:
          slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [photos.length],
  );

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (photos.length < 2) return;
    if (reducedMotion.matches) return;

    const intervalId = window.setInterval(() => {
      goToPhoto(activeIndex + 1);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(intervalId);
  }, [activeIndex, goToPhoto, photos.length]);

  if (photos.length === 0) return null;

  const updateActiveFromScroll = (event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
    const slides = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-carousel-index]"),
    );

    let closestIndex = activeIndex;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const slide of slides) {
      const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
      const distance = Math.abs(slideCenter - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = Number(slide.dataset.carouselIndex ?? 0);
      }
    }

    if (closestIndex !== activeIndex) setActiveIndex(closestIndex);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPhoto(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPhoto(activeIndex + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goToPhoto(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToPhoto(photos.length - 1);
    }
  };

  return (
    <section
      className="pathway-editorial-carousel-section"
      aria-label="Academy story gallery"
      aria-roledescription="carousel"
    >
      <div
        ref={viewportRef}
        className="pathway-editorial-carousel-viewport"
        tabIndex={0}
        aria-label="Automatically rotating gallery. Use arrow keys to browse."
        onKeyDown={handleKeyDown}
        onScroll={updateActiveFromScroll}
      >
        <ol className="pathway-editorial-carousel-track">
          {photos.map((photo, index) => (
            <li
              className="pathway-editorial-carousel-slide"
              data-active={index === activeIndex}
              data-carousel-index={index}
              aria-label={`${index + 1} of ${photos.length}`}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-roledescription="slide"
              key={photo.src}
            >
              <figure className="pathway-editorial-carousel-frame">
                <ResilientImage
                  className="pathway-editorial-carousel-image"
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 700px) 82vw, (max-width: 1200px) 54vw, 520px"
                  fallback={
                    <PathwayImageFallback
                      className="pathway-editorial-carousel-fallback"
                      label={`Gallery image ${index + 1} unavailable`}
                    />
                  }
                  {...imageDeliveryProps("photograph")}
                />
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
