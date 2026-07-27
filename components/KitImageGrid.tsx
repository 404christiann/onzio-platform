"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { kitPhotoDisplayMode } from "@/lib/shop-kit";

const AUTO_ADVANCE_MS = 4500;
const FADE_TRANSITION_MS = 900;

export type KitPhoto = {
  url: string;
  alt: string;
};

interface KitImageGridProps {
  photos: KitPhoto[];
  sizes: string;
  priority?: boolean;
}

export default function KitImageGrid({
  photos,
  sizes,
  priority = false,
}: KitImageGridProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const visiblePhotos = useMemo(
    () => photos.filter((photo) => !failedUrls.has(photo.url)),
    [failedUrls, photos],
  );
  const displayMode = kitPhotoDisplayMode(visiblePhotos.length);
  const photoSignature = photos.map((photo) => photo.url).join("|");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    setActiveSlide(0);
    setFailedUrls(new Set());
  }, [photoSignature]);

  useEffect(() => {
    if (displayMode === "static" || prefersReducedMotion) return;

    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % visiblePhotos.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(interval);
  }, [displayMode, photoSignature, prefersReducedMotion, visiblePhotos.length]);

  useEffect(() => {
    if (activeSlide < visiblePhotos.length) return;
    setActiveSlide(0);
  }, [activeSlide, visiblePhotos.length]);

  if (visiblePhotos.length === 0) return null;

  if (displayMode === "static") {
    const photo = visiblePhotos[0];
    return (
      <div className="pointer-events-none relative h-full w-full select-none">
        <Image
          src={photo.url}
          alt={photo.alt}
          fill
          className="object-contain object-bottom"
          sizes={sizes}
          priority={priority}
          draggable={false}
          onError={() => {
            setFailedUrls((current) => new Set(current).add(photo.url));
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none relative h-full w-full select-none overflow-hidden"
      aria-live="off"
    >
      {visiblePhotos.map((photo, index) => {
        const isActive = index === activeSlide;
        return (
          <div
            key={photo.url}
            className="absolute inset-0 transition-opacity ease-in-out"
            style={{
              opacity: isActive ? 1 : 0,
              transitionDuration: prefersReducedMotion
                ? "0ms"
                : `${FADE_TRANSITION_MS}ms`,
            }}
            aria-hidden={!isActive}
          >
            <Image
              src={photo.url}
              alt={photo.alt}
              fill
              className="object-contain object-bottom"
              sizes={sizes}
              priority={priority && index === 0}
              draggable={false}
              onError={() => {
                setFailedUrls((current) => new Set(current).add(photo.url));
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
