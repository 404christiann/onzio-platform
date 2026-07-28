"use client";

import { useEffect, useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";
import {
  DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS,
  DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS,
} from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";
import { useClubId } from "@/components/ClubContextProvider";
import ImageFallback from "@/components/ImageFallback";

gsap.registerPlugin(ScrollTrigger);

const SLIDE_DURATION = 4500;

export default function PhotoSlideshow() {
  const clubId = useClubId();
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [slides, setSlides] = useState<DBHomepageSlideshowPhoto[]>([]);
  const [failedSlideIds, setFailedSlideIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [seasonLabel, setSeasonLabel] = useState(
    DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS.season_label,
  );
  const sectionRef = useRef<HTMLElement>(null);
  const visibleSlides = slides.filter((slide) => !failedSlideIds.has(slide.id));
  const safeCurrent =
    visibleSlides.length === 0 ? 0 : current % visibleSlides.length;

  useEffect(() => {
    fetchHomepageContent(clubId)
      .then(({ slideshowPhotos, slideshowSettings }) => {
        setSlides(slideshowPhotos);
        setFailedSlideIds(new Set());
        setSeasonLabel(slideshowSettings.season_label);
        setCurrent(0);
        setPrev(null);
      })
      .catch((error) => {
        console.error("PhotoSlideshow:", error);
        setSlides([]);
        setSeasonLabel(DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS.season_label);
      });
  }, [clubId]);

  // Auto-advance
  useEffect(() => {
    if (visibleSlides.length <= 1) return;
    const timer = setInterval(() => {
      setPrev(safeCurrent);
      setCurrent((index) => (index + 1) % visibleSlides.length);
    }, SLIDE_DURATION);
    return () => clearInterval(timer);
  }, [safeCurrent, visibleSlides.length]);

  // Scroll reveal
  useEffect(() => {
    const section = sectionRef.current;
    if (visibleSlides.length === 0 || !section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        section,
        { opacity: 0 },
        {
          opacity: 1,
          duration: 1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: section,
            start: "top 85%",
          },
        }
      );
    }, section);
    return () => ctx.revert();
  }, [visibleSlides.length]);

  if (visibleSlides.length === 0) {
    if (slides.length === 0) return null;
    return (
      <section
        className="relative min-h-[560px] w-full overflow-hidden"
        style={{ height: "85vh", backgroundColor: "#141414" }}
      >
        <ImageFallback
          label="Club slideshow unavailable"
          variant="photo"
        />
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={{ height: "85vh", minHeight: "560px", opacity: 0, display: "block", margin: 0, padding: 0 }}
    >
      {/* Images */}
      {visibleSlides.map((slide, i) => (
        <div
          key={slide.id}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: i === safeCurrent ? 1 : 0 }}
        >
          <Image
            src={slide.url}
            alt={slide.alt}
            fill
            unoptimized
            className="object-cover object-center"
            sizes="100vw"
            onError={() => {
              setFailedSlideIds((currentIds) => {
                if (currentIds.has(slide.id)) return currentIds;
                const nextIds = new Set(currentIds);
                nextIds.add(slide.id);
                return nextIds;
              });
            }}
          />
        </div>
      ))}

      {/* Subtle dark overlay for legibility */}
      <div className="absolute inset-0 bg-black/10" style={{ zIndex: 1 }} />

      {/* Mobile: fade bottom into jersey section black */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 md:hidden pointer-events-none"
        style={{ background: "linear-gradient(to top, #000, transparent)", zIndex: 2 }}
      />

      {/* Slide counter + indicators */}
      <div
        className="absolute bottom-8 right-8 flex items-center gap-4"
        style={{ zIndex: 2 }}
      >
        {visibleSlides.length > 1 && (
          <>
            <span
              className="font-display text-white/60 text-sm tracking-widest"
            >
              {String(safeCurrent + 1).padStart(2, "0")} / {String(visibleSlides.length).padStart(2, "0")}
            </span>
            <div className="flex gap-1.5">
              {visibleSlides.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => { setPrev(safeCurrent); setCurrent(i); }}
                  className="transition-all duration-300"
                  style={{
                    width: i === safeCurrent ? "2rem" : "0.5rem",
                    height: "2px",
                    backgroundColor:
                      i === safeCurrent ? "var(--color-red)" : "rgba(255,255,255,0.4)",
                    border: "none",
                    cursor: "pointer",
                  }}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Optional label bottom-left */}
      <div
        className="absolute bottom-8 left-8 hidden md:block"
        style={{ zIndex: 2 }}
      >
        <p
          className="font-display text-xs font-semibold tracking-widest uppercase"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          {seasonLabel}
        </p>
      </div>
    </section>
  );
}
