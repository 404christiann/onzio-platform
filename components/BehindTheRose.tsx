"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBBehindTheRoseSection } from "@/lib/db-types";
import { DEFAULT_BEHIND_THE_ROSE_SECTION } from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";
import { useClubId } from "@/components/ClubContextProvider";

gsap.registerPlugin(ScrollTrigger);

export default function BehindTheRose() {
  const clubId = useClubId();
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef  = useRef<HTMLDivElement>(null);
  const videoRef   = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<DBBehindTheRoseSection>(
    { ...DEFAULT_BEHIND_THE_ROSE_SECTION, visible: false },
  );

  useEffect(() => {
    fetchHomepageContent(clubId)
      .then(({ behindTheRose }) => setContent(behindTheRose))
      .catch((error) => {
        console.error("BehindTheRose:", error);
        setContent({ ...DEFAULT_BEHIND_THE_ROSE_SECTION, visible: false });
      });
  }, [clubId]);

  useEffect(() => {
    if (!content.visible) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        headerRef.current,
        { y: 40, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 1, ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
        }
      );
      gsap.fromTo(
        videoRef.current,
        { y: 50, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 1.1, ease: "power3.out", delay: 0.2,
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [content.visible]);

  if (!content.visible) return null;

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden pt-10 pb-20 md:pt-16 md:pb-32 px-6"
      style={{ backgroundColor: "var(--color-black)" }}
    >
      {/* Header */}
      <div ref={headerRef} className="max-w-3xl mx-auto text-center mb-12 md:mb-16" style={{ opacity: 0 }}>
        <p
          className="font-display font-bold tracking-widest uppercase mb-4"
          style={{ color: "var(--color-red)", fontSize: "clamp(0.58rem, 2.6vw, 1.3rem)", whiteSpace: "nowrap" }}
        >
          {content.eyebrow}
        </p>
        <h2
          className="font-display font-black uppercase text-white leading-none mb-6"
          style={{ fontSize: "clamp(1.85rem, 8.5vw, 6rem)", whiteSpace: "nowrap" }}
        >
          {content.title}
        </h2>
        <p
          className="font-body leading-relaxed max-w-xl mx-auto"
          style={{ color: "rgba(255,255,255,0.5)", fontSize: "clamp(0.9rem, 1.5vw, 1.05rem)" }}
        >
          {content.description}
        </p>
      </div>

      {/* Video embed */}
      <div
        ref={videoRef}
        className="max-w-5xl mx-auto"
        style={{ opacity: 0 }}
      >
        {/* 16:9 aspect ratio wrapper */}
        <div
          className="relative w-full overflow-hidden"
          style={{
            paddingBottom: "56.25%",
            boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <iframe
            src={content.video_url}
            title={content.video_title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>

        {/* Caption */}
        <p
          className="font-display text-xs tracking-widest uppercase text-center mt-6"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          {content.caption}
        </p>
      </div>

      {/* Subtle bottom fade for mobile continuity */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16 md:hidden pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(10,10,10,0.8), transparent)" }}
      />
    </section>
  );
}
