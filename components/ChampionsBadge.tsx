"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function ChampionsBadge() {
  const sectionRef = useRef<HTMLElement>(null);
  const trophyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        trophyRef.current,
        { y: 50, opacity: 0, scale: 0.9 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
          },
        }
      );
      gsap.fromTo(
        textRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.9,
          ease: "power2.out",
          delay: 0.2,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden px-6 py-20 md:flex md:h-[50vh] md:min-h-[620px] md:items-center md:py-8 lg:min-h-[780px] lg:px-10"
      style={{ backgroundColor: "#0D0D0D" }}
    >
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col items-center gap-10 md:flex-row md:justify-center md:gap-8 lg:gap-12">
        {/* Trophy */}
        <div ref={trophyRef} className="flex w-full flex-shrink-0 justify-center md:w-[52%]" style={{ opacity: 0 }}>
          <div className="relative aspect-square w-[min(100vw,950px)] drop-shadow-2xl md:w-full md:max-w-[650px] lg:max-w-[700px]">
            <Image
              src="/images/home/trophy.png"
              alt="UPSL Championship Trophy"
              fill
              className="object-contain"
              sizes="(max-width: 767px) 100vw, (max-width: 1280px) 52vw, 700px"
            />
          </div>
        </div>

        {/* Text block */}
        <div ref={textRef} className="w-full max-w-xl md:w-[48%]" style={{ opacity: 0 }}>
          {/* Eyebrow */}
          <p
            className="font-display font-bold tracking-widest uppercase mb-4"
            style={{ color: "var(--color-red)", fontSize: "clamp(1rem, 2vw, 1.4rem)" }}
          >
            UPSL SoCal North Conference
          </p>

          <h2
            className="font-display font-black uppercase text-white leading-none"
            style={{ fontSize: "clamp(3rem, 5vw, 4.5rem)" }}
          >
            2024
            <br />
            Champions
          </h2>

          <div
            className="mt-6 w-16 h-1"
            style={{ backgroundColor: "var(--color-red)" }}
          />

          <p
            className="font-body mt-6 max-w-lg leading-relaxed text-white/70"
            style={{ fontSize: "clamp(1rem, 1.25vw, 1.125rem)" }}
          >
            Rose City Futbol Club captured the 2024 UPSL SoCal North Conference
            Championship, cementing our place as Pasadena&apos;s premier club.
            The journey continues — and the best is still ahead.
          </p>
        </div>
      </div>
    </section>
  );
}
