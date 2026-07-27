"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

// Portrait-oriented player photos — better suited for mobile
const SLIDES = [
  "/images/shop/rosecityshirt1.webp",
  "/images/shop/rosecityshirt2.jpeg",
  "/images/shop/rosecityshirt3.jpeg",
  "/images/shop/rosecityshirt4.jpeg",
];

const DURATION = 4500;

export default function ShopHeroMobile() {
  const [current, setCurrent] = useState(0);
  const touchStart = useRef<number | null>(null);

  const goTo = useCallback((idx: number) => {
    setCurrent((idx + SLIDES.length) % SLIDES.length);
  }, []);

  const goNext = useCallback(() => goTo(current + 1), [current, goTo]);
  const goPrev = useCallback(() => goTo(current - 1), [current, goTo]);

  useEffect(() => {
    const t = setTimeout(goNext, DURATION);
    return () => clearTimeout(t);
  }, [current, goNext]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
    touchStart.current = null;
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "80svh", minHeight: 500, backgroundColor: "#000" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Photos — crossfade */}
      {SLIDES.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
        >
          <Image
            src={src}
            alt={`Rose City FC Kit ${i + 1}`}
            fill
            priority={i === 0}
            className="object-cover object-center"
            sizes="100vw"
          />
        </div>
      ))}

      {/* Bottom gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.3) 35%, transparent 60%)",
          zIndex: 2,
        }}
      />

      {/* Bottom content */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 pb-8 flex flex-col gap-4"
        style={{ zIndex: 3 }}
      >
        <div>
          <p
            className="font-display font-bold tracking-widest uppercase mb-1"
            style={{ color: "var(--color-red)", fontSize: "0.8rem" }}
          >
            Rose City FC · 2026
          </p>
          <h2
            className="font-display font-black uppercase text-white leading-none"
            style={{ fontSize: "clamp(2.2rem, 10vw, 3rem)" }}
          >
            Thorn Edition
          </h2>
        </div>

        {/* Full-width CTA */}
        <a
          href="https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center font-display font-bold tracking-widest uppercase py-4"
          style={{ backgroundColor: "var(--color-red)", color: "#fff", fontSize: "0.9rem" }}
        >
          Buy Now →
        </a>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: i === current ? 24 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === current ? "#fff" : "rgba(255,255,255,0.3)",
                transition: "width 0.3s ease, background-color 0.3s ease",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
