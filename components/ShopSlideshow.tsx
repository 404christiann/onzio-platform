"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

interface Props {
  images: string[];
}

export default function ShopSlideshow({ images }: Props) {
  const [current, setCurrent] = useState(0);
  const [animating, setAnimating] = useState(false);

  const goTo = useCallback(
    (idx: number) => {
      if (animating || idx === current) return;
      setAnimating(true);
      setCurrent(idx);
      setTimeout(() => setAnimating(false), 600);
    },
    [animating, current]
  );

  const prev = () => goTo((current - 1 + images.length) % images.length);
  const next = useCallback(() => goTo((current + 1) % images.length), [current, goTo, images.length]);

  // Auto-advance every 4s
  useEffect(() => {
    const t = setInterval(next, 4000);
    return () => clearInterval(t);
  }, [next]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
      {images.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
        >
          <Image
            src={src}
            alt={`Shop image ${i + 1}`}
            fill
            className="object-contain object-center"
            sizes="(max-width: 768px) 100vw, 60vw"
            priority={i === 0}
          />
        </div>
      ))}


      {/* Prev / Next arrows */}
      <button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center transition-opacity duration-200 opacity-50 hover:opacity-100"
        aria-label="Previous"
        style={{ backgroundColor: "rgba(0,0,0,0.4)", borderRadius: "50%" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 2L4 7l5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center transition-opacity duration-200 opacity-50 hover:opacity-100"
        aria-label="Next"
        style={{ backgroundColor: "rgba(0,0,0,0.4)", borderRadius: "50%" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2l5 5-5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="transition-all duration-300"
            style={{
              width: i === current ? 20 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === current ? "var(--color-red)" : "rgba(255,255,255,0.4)",
            }}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
