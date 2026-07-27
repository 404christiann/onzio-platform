"use client";

import { Fragment, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { DBShopKitPhoto, DBShopKitSection } from "@/lib/db-types";
import {
  kitPhotoAlt,
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
  titleLines,
} from "@/lib/shop-kit";
import KitImageGrid from "@/components/KitImageGrid";

gsap.registerPlugin(ScrollTrigger);

interface ShopKitSectionProps {
  section: DBShopKitSection;
  photos: DBShopKitPhoto[];
  headingTag?: "h1" | "h2";
  animate?: boolean;
  fadeImageToWhite?: boolean;
  ctaHref?: string;
  variantTabs?: ReactNode;
}

export default function ShopKitSection({
  section,
  photos,
  headingTag = "h2",
  animate = true,
  fadeImageToWhite = false,
  ctaHref,
  variantTabs,
}: ShopKitSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const Heading = headingTag;
  const validPhotos = photos.filter((photo) => photo.url.trim().length > 0);
  const kitPhotos = validPhotos.map((photo, index) => ({
    url: photo.url.trim(),
    alt: kitPhotoAlt(section.title, index, validPhotos.length),
  }));
  const bulletPoints = normalizeKitBulletPoints(section.bullet_points);
  const storeNote = normalizeKitStoreNote(section.store_note).trim();

  useEffect(() => {
    if (!animate) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        imageRef.current,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
        },
      );
      gsap.fromTo(
        textRef.current,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          delay: 0.2,
          scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
        },
      );
    }, sectionRef);
    return () => ctx.revert();
  }, [animate]);

  return (
    <section
      ref={sectionRef}
      className="relative w-full overflow-hidden"
      style={{ backgroundColor: "var(--color-white)" }}
    >
      <div className="flex flex-col md:flex-row">
        <div
          ref={imageRef}
          className="relative w-full md:w-1/2"
          style={{ opacity: animate ? 0 : 1 }}
        >
          <div
            className="relative w-full md:hidden"
            style={{ aspectRatio: "5262 / 4692" }}
          >
            <KitImageGrid photos={kitPhotos} sizes="50vw" />
          </div>
          <div className="absolute inset-0 hidden md:block">
            <KitImageGrid photos={kitPhotos} sizes="25vw" />
          </div>
          {fadeImageToWhite && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[52%]"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.52) 34%, rgba(255,255,255,0.92) 68%, #FFFFFF 92%)",
              }}
            />
          )}
        </div>

        <div
          ref={textRef}
          className="flex w-full flex-col justify-center px-6 py-12 sm:px-10 md:w-1/2 md:px-14 md:py-20 lg:px-20"
          style={{ opacity: animate ? 0 : 1 }}
        >
          <p
            className="font-display mb-4 font-bold uppercase tracking-widest"
            style={{
              color: "var(--color-red)",
              fontSize: "clamp(1rem, 2vw, 1.3rem)",
            }}
          >
            {section.eyebrow}
          </p>

          <Heading
            className="font-display mb-6 font-black uppercase leading-none"
            style={{
              fontSize: "clamp(2.8rem, 6vw, 5rem)",
              color: "var(--color-black)",
            }}
          >
            {titleLines(section.title).map((line, index, lines) => (
              <Fragment key={index}>
                {line}
                {index < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </Heading>

          <div
            className="mb-8 h-0.5 w-12"
            style={{ backgroundColor: "var(--color-red)" }}
          />

          {variantTabs && <div className="mb-8">{variantTabs}</div>}

          <p
            className="font-body mb-8 leading-relaxed"
            style={{
              color: "rgba(0,0,0,0.6)",
              fontSize: "clamp(0.9rem, 1.4vw, 1rem)",
            }}
          >
            {section.description}
          </p>

          <ul className="mb-8 flex flex-col gap-3">
            {bulletPoints.map((item, index) => (
              <li key={`${item}-${index}`} className="flex items-center gap-3">
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: "var(--color-red)" }}
                />
                <span
                  className="font-body text-sm"
                  style={{ color: "rgba(0,0,0,0.6)" }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>

          {storeNote && (
            <p
              className="font-body mb-8 whitespace-pre-line text-xs"
              style={{ color: "rgba(0,0,0,0.4)" }}
            >
              {storeNote}
            </p>
          )}

          {ctaHref ? (
            <Link
              href={ctaHref}
              className="font-display flex items-center justify-center gap-3 px-10 py-4 text-sm font-bold uppercase tracking-widest transition-all duration-200 md:inline-flex md:w-auto"
              style={{ backgroundColor: "var(--color-red)", color: "#fff" }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = "var(--color-red-dark)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "var(--color-red)";
              }}
            >
              {section.cta_label}
            </Link>
          ) : (
            <a
              href={section.cta_link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-display flex items-center justify-center gap-3 px-10 py-4 text-sm font-bold uppercase tracking-widest transition-all duration-200 md:inline-flex md:w-auto"
              style={{ backgroundColor: "var(--color-red)", color: "#fff" }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = "var(--color-red-dark)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = "var(--color-red)";
              }}
            >
              {section.cta_label}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
