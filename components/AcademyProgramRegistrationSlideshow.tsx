"use client";

import { useEffect, useState } from "react";
import ResilientImage from "@/components/ResilientImage";

export type RegistrationSlide = {
  src: string;
  alt: string;
};

const slideInterval = 5000;

// Port of the sales mockup's SpecialOlympicsRegistrationSection slideshow
// region (the 4-photo cross-fade beside the "Ready to take the field?" copy):
// 5s auto-advance that pauses on hover/focus and honors
// prefers-reduced-motion, identical carousel semantics and framing classes.
// Slides are passed in by the server component so the photo set stays a
// rendering input rather than component-owned content.
export default function AcademyProgramRegistrationSlideshow({
  slides,
  label,
}: {
  slides: RegistrationSlide[];
  label: string;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener("change", updateMotionPreference);

    return () =>
      mediaQuery.removeEventListener("change", updateMotionPreference);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || isHovered || hasFocus || slides.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentSlide((slide) => (slide + 1) % slides.length);
    }, slideInterval);

    return () => window.clearInterval(timer);
  }, [hasFocus, isHovered, prefersReducedMotion, slides.length]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={`${label} photo slideshow. Focus or hover to pause.`}
      tabIndex={0}
      className="group relative aspect-[16/10] overflow-hidden bg-[#1E3653] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF1616] lg:aspect-auto lg:h-[clamp(24rem,60svh,34rem)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setHasFocus(false);
        }
      }}
    >
      {slides.map((slide, index) => (
        <div
          key={slide.src}
          aria-hidden={index !== currentSlide}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === currentSlide ? "opacity-100" : "opacity-0"
          } motion-reduce:transition-none`}
        >
          <ResilientImage
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 1023px) 100vw, 1280px"
            className="object-contain"
          />
        </div>
      ))}
    </div>
  );
}
