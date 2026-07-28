"use client";

import { useEffect, useRef } from "react";
import Image from "@/components/ResilientImage";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBAboutPageContent } from "@/lib/db-types";
import { useClubContext } from "@/components/ClubContextProvider";

gsap.registerPlugin(ScrollTrigger);

export default function AboutClubPageClient({
  content,
  animate = true,
}: {
  content: DBAboutPageContent;
  animate?: boolean;
}) {
  const club = useClubContext();
  const heroRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(heroRef.current, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" });
      gsap.fromTo(
        storyRef.current,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.15 },
      );
      gsap.fromTo(
        valuesRef.current?.children ?? [],
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.1,
          scrollTrigger: { trigger: valuesRef.current, start: "top 85%" },
        },
      );
      gsap.fromTo(
        closingRef.current,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: closingRef.current, start: "top 85%" },
        },
      );
    });
    return () => ctx.revert();
  }, [animate]);

  return (
    <div className="min-h-screen bg-white">
      <div
        ref={heroRef}
        className="pt-36 pb-14 px-6 lg:px-10 max-w-7xl mx-auto"
        style={{ opacity: animate ? 0 : 1 }}
      >
        <h1
          className="font-display font-black uppercase leading-none"
          style={{ fontSize: "clamp(3.4rem, 9vw, 7rem)", color: "var(--color-black)" }}
        >
          {content.hero_title}
        </h1>
        <div className="w-16 h-1 mt-6" style={{ backgroundColor: "var(--color-red)" }} />
      </div>

      <div
        ref={storyRef}
        className="px-6 lg:px-10 max-w-7xl mx-auto pb-24 grid md:grid-cols-5 gap-10 md:gap-16"
        style={{ opacity: animate ? 0 : 1 }}
      >
        <div className="md:col-span-3 space-y-5">
          {content.story_paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="font-body leading-relaxed"
              style={{ color: "rgba(20,20,20,0.7)", fontSize: "clamp(1rem, 1.5vw, 1.1rem)" }}
            >
              {paragraph}
            </p>
          ))}
        </div>

        {content.feature_image_url && <div className="md:col-span-2">
          <div
            className="relative h-full min-h-[320px] overflow-hidden rounded-xl"
            style={{ backgroundColor: "var(--color-black)" }}
          >
            <Image
              src={content.feature_image_url}
              alt={`${club.name} about page feature`}
              fallbackVariant="photo"
              fill
              sizes="(max-width: 768px) 100vw, 420px"
              className="object-cover"
            />
          </div>
        </div>}
      </div>

      <div className="px-6 lg:px-10 max-w-7xl mx-auto pb-24">
        <p
          className="font-display font-bold tracking-widest uppercase mb-8"
          style={{ color: "var(--color-black)", fontSize: "clamp(0.8rem, 1.3vw, 1rem)" }}
        >
          {content.values_heading}
        </p>
        <div ref={valuesRef} className="grid sm:grid-cols-3 gap-5">
          {content.values.map((value, i) => (
            <div
              key={`${value.title}-${i}`}
              className="rounded-xl p-6"
              style={{ border: "1px solid rgba(20,20,20,0.08)" }}
            >
              <p
                className="font-display font-black uppercase leading-none mb-4"
                style={{ fontSize: "1.6rem", color: "var(--color-red)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3
                className="font-display font-black uppercase leading-tight mb-3"
                style={{ fontSize: "1.15rem", color: "var(--color-black)" }}
              >
                {value.title}
              </h3>
              <p className="font-body leading-relaxed" style={{ color: "rgba(20,20,20,0.6)", fontSize: "0.92rem" }}>
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        ref={closingRef}
        className="px-6 lg:px-10 max-w-7xl mx-auto pb-32 text-center"
        style={{ opacity: animate ? 0 : 1 }}
      >
        <p
          className="font-display font-black uppercase leading-tight max-w-3xl mx-auto mb-8"
          style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.5rem)", color: "var(--color-black)" }}
        >
          {content.closing_text}
        </p>
        <Link
          href={content.closing_cta_href}
          className="inline-block font-body text-sm font-bold tracking-widest uppercase px-8 py-4 rounded-full transition-colors duration-300"
          style={{ backgroundColor: "var(--color-black)", color: "#ffffff" }}
        >
          {content.closing_cta_label}
        </Link>
      </div>
    </div>
  );
}
