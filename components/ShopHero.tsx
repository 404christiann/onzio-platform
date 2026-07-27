"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

const SLIDES = [
  "/images/shop/shoppic1.jpeg",
  "/images/shop/shoppic2.jpeg",
  "/images/shop/shoppic3.jpeg",
  "/images/shop/shoppic4.jpeg",
];
const DESKTOP_OBJECT_POSITIONS = [
  "center center",
  "12% center",
  "center center",
  "center center",
];

const DURATION = 5000;
const PEEK_DESKTOP = 48;
const MOBILE_BREAKPOINT = 640;
const BUY_NOW_URL =
  "https://www.nikys-sports.com/products/nike-rose-city-fc-home-mens-dri-fit-soccer-jersey";

export default function ShopHero() {
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const dragStart = useRef<number | null>(null);
  const activeSlides = SLIDES;

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const goTo = useCallback((idx: number) => {
    setCurrent(Math.max(0, Math.min(activeSlides.length - 1, idx)));
  }, [activeSlides.length]);

  const goPrev = () => goTo(current - 1);
  const goNext = useCallback(
    () => goTo(current + 1 < activeSlides.length ? current + 1 : 0),
    [activeSlides.length, current, goTo]
  );

  useEffect(() => {
    if (dragging) return;
    const t = setTimeout(goNext, DURATION);
    return () => clearTimeout(t);
  }, [current, goNext, dragging]);

  const onDragStart = (clientX: number) => {
    if (isMobile) return;
    dragStart.current = clientX;
    setDragging(true);
    setDragOffset(0);
  };

  const onDragMove = (clientX: number) => {
    if (!dragging || dragStart.current === null || isMobile) return;
    setDragOffset(clientX - dragStart.current);
  };

  const onDragEnd = () => {
    if (!dragging || isMobile) return;
    if (dragOffset < -50) goNext();
    else if (dragOffset > 50) goPrev();
    setDragging(false);
    setDragOffset(0);
    dragStart.current = null;
  };

  const slideWidthStyle = `calc(100% - ${PEEK_DESKTOP}px)`;

  const overlay = (
    <>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 45%, transparent 100%)",
          zIndex: 3,
        }}
      />

      <div
        className="absolute bottom-0 left-0 right-0 px-6 lg:px-12 pb-10 md:pb-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6"
        style={{ zIndex: 4, pointerEvents: "none" }}
      >
        <div />

        <div
          className={`flex flex-col items-start sm:items-end gap-4 ${
            isMobile ? "w-full" : ""
          }`}
          style={{ pointerEvents: "auto" }}
        >
          <a
            href={BUY_NOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-display font-bold tracking-widest uppercase px-8 py-3.5 transition-all duration-200 ${
              isMobile ? "w-full text-center" : ""
            }`}
            style={{
              backgroundColor: "var(--color-red)",
              color: "#fff",
              fontSize: "clamp(0.8rem, 1.2vw, 0.9rem)",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red-dark)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red)")
            }
          >
            Buy Now →
          </a>

          <div className="flex items-center gap-2">
            <span className="font-display font-black text-white" style={{ fontSize: "1rem" }}>
              {String(current + 1).padStart(2, "0")}
            </span>
            <div className="flex gap-1.5">
              {activeSlides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  style={{
                    width: i === current ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === current ? "white" : "rgba(255,255,255,0.3)",
                    transition: "width 0.3s ease, background-color 0.3s ease",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <span className="font-display text-white" style={{ fontSize: "0.7rem", opacity: 0.35 }}>
              {String(activeSlides.length).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <section
        className="w-full select-none"
        style={{ backgroundColor: "var(--color-white)" }}
      >
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "2560 / 1387", backgroundColor: "var(--color-white)" }}
        >
          {activeSlides.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0 transition-opacity duration-700 ease-out"
              style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 1 : 0 }}
            >
              <Image
                src={src}
                alt={`Rose City FC Kit ${i + 1}`}
                fill
                priority={i === 0}
                draggable={false}
                className="object-cover object-center"
                sizes="100vw"
                style={{ pointerEvents: "none", objectPosition: "center 62%" }}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative w-full overflow-hidden select-none"
      style={{ height: "clamp(280px, 56vw, 100svh)", minHeight: 280, backgroundColor: "#000" }}
    >
      <div
        className="absolute inset-0 flex"
        style={{
          transform: `translateX(calc(${current} * (${PEEK_DESKTOP}px - 100%) + ${dragOffset}px))`,
          transition: dragging ? "none" : "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          cursor: dragging ? "grabbing" : "grab",
          willChange: "transform",
        }}
        onMouseDown={(e) => onDragStart(e.clientX)}
        onMouseMove={(e) => onDragMove(e.clientX)}
        onMouseUp={onDragEnd}
        onMouseLeave={onDragEnd}
        onTouchStart={(e) => onDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => {
          e.preventDefault();
          onDragMove(e.touches[0].clientX);
        }}
        onTouchEnd={onDragEnd}
      >
        {activeSlides.map((src, i) => (
          <div
            key={src}
            className="relative flex-shrink-0 h-full overflow-hidden"
            style={{ width: i === activeSlides.length - 1 ? "100%" : slideWidthStyle }}
          >
            <Image
              src={src}
              alt={`Rose City FC Kit ${i + 1}`}
              fill
              priority={i === 0}
              draggable={false}
              className="object-cover object-center"
              sizes="100vw"
              style={{
                pointerEvents: "none",
                objectPosition: DESKTOP_OBJECT_POSITIONS[i] ?? "center center",
              }}
            />
          </div>
        ))}
      </div>

      {current > 0 && (
        <button
          onClick={goPrev}
          aria-label="Previous"
          className="absolute left-8 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center transition-all duration-200"
          style={{ width: 44, height: 44, border: "1px solid rgba(255,255,255,0.3)", backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", color: "rgba(255,255,255,0.8)" }}
          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "rgba(0,0,0,0.55)"; el.style.borderColor = "rgba(255,255,255,0.7)"; el.style.color = "#fff"; }}
          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "rgba(0,0,0,0.25)"; el.style.borderColor = "rgba(255,255,255,0.3)"; el.style.color = "rgba(255,255,255,0.8)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.5L3.5 6.5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      )}

      <button
        onClick={goNext}
        aria-label="Next"
        className="absolute right-8 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center transition-all duration-200"
        style={{ width: 44, height: 44, border: "1px solid rgba(255,255,255,0.3)", backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(6px)", color: "rgba(255,255,255,0.8)" }}
        onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "rgba(0,0,0,0.55)"; el.style.borderColor = "rgba(255,255,255,0.7)"; el.style.color = "#fff"; }}
        onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "rgba(0,0,0,0.25)"; el.style.borderColor = "rgba(255,255,255,0.3)"; el.style.color = "rgba(255,255,255,0.8)"; }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4.5 1.5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none" style={{ zIndex: 5 }}>
        <span className="font-display text-xs tracking-widest uppercase text-white/50">Scroll</span>
        <div className="w-px h-8 bg-white/30" />
      </div>

      {overlay}
    </section>
  );
}
