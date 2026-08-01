"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { DEFAULT_HOMEPAGE_HERO_CONTENT } from "@/lib/homepage-content";
import { fetchHomepageContent } from "@/lib/queries";

export default function Hero() {
  const club = useClubContext();
  const branding = useClubBranding();
  const usesLegacyRoseCityHero = club.slug === "rose-city";
  const ctaRef   = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const [heroContent, setHeroContent] = useState(DEFAULT_HOMEPAGE_HERO_CONTENT);

  useEffect(() => {
    let cancelled = false;
    fetchHomepageContent(club.id)
      .then((content) => {
        if (!cancelled) setHeroContent(content.hero);
      })
      .catch((error: unknown) => {
        console.error(
          "Hero:",
          error instanceof Error ? error.message : "Failed to load homepage hero content",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    gsap.fromTo(
      ctaRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, ease: "power3.out", delay: 0.8 }
    );
  }, []);

  if (club.presentationTemplateKey === "clubhouse@1") {
    const headlineOne = heroContent.headline_line_one.trim() || club.name;
    const headlineTwo = heroContent.headline_line_two.trim();
    const intro = heroContent.intro.trim();
    const primaryHref = heroContent.primary_cta_href.trim() || "/schedule";
    const secondaryHref = heroContent.secondary_cta_href.trim() || "/roster";

    return (
      <section className="clubhouse-hero">
        <div className="clubhouse-hero-content">
          <div className="clubhouse-hero-copy">
            <h1>
              <span>{headlineOne}</span>
              {headlineTwo && <em>{headlineTwo}</em>}
            </h1>
            {intro && <p className="clubhouse-hero-intro">{intro}</p>}
            <div ref={ctaRef} className="clubhouse-hero-cta" style={{ opacity: 0 }}>
              <Link href={primaryHref}>
                {heroContent.primary_cta_label.trim() || "Next match"}
              </Link>
              <Link href={secondaryHref}>
                {heroContent.secondary_cta_label.trim() || "Meet the squad"}
              </Link>
            </div>
          </div>
          <div className="clubhouse-hero-media" aria-label={`${club.name} crest`}>
            {branding.clubLogoUrl && (
              <ResilientNativeImage
                src={branding.clubLogoUrl}
                alt={`${club.name} crest`}
                className="clubhouse-hero-crest"
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  if (!usesLegacyRoseCityHero) {
    const primaryColor = club.primaryColor ?? "#1B2958";
    const secondaryColor = club.secondaryColor ?? "#AD3234";
    const headlineOne = heroContent.headline_line_one.trim() || club.name;
    const headlineTwo = heroContent.headline_line_two.trim();
    const intro = heroContent.intro.trim();
    const primaryHref = heroContent.primary_cta_href.trim() || "/schedule";
    const secondaryHref = heroContent.secondary_cta_href.trim() || "/roster";

    return (
      <section
        className="relative flex min-h-[92svh] w-full items-center overflow-hidden text-white"
        style={{
          background:
            `linear-gradient(132deg, ${primaryColor} 0%, ${primaryColor} 48%, ${secondaryColor} 142%)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] skew-x-[-12deg] opacity-20 lg:block"
          style={{ backgroundColor: secondaryColor }}
        />
        <div className="relative z-10 mx-auto grid w-full max-w-[1500px] grid-cols-1 items-center gap-2 px-5 pb-8 pt-24 sm:gap-6 sm:px-8 md:pt-32 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-10 lg:px-12">
          <div className="order-2 pb-6 lg:order-1 lg:pb-0">
            {heroContent.eyebrow.trim() && (
              <p className="font-display mb-4 text-xs font-bold uppercase tracking-widest text-white/60">
                {heroContent.eyebrow}
              </p>
            )}
            <h1 className="font-display text-4xl font-black not-italic uppercase leading-[0.92] text-white sm:text-6xl lg:text-8xl">
              <span className="block lg:whitespace-nowrap">{headlineOne}</span>
              {headlineTwo && (
                <span className="block lg:whitespace-nowrap" style={{ color: "#F0F0F0" }}>
                  {headlineTwo}
                </span>
              )}
            </h1>
            {intro && (
              <p className="font-body mt-7 max-w-xl text-base leading-7 text-white/74">
                {intro}
              </p>
            )}
            <div
              ref={ctaRef}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
              style={{ opacity: 0 }}
            >
              <Link
                href={primaryHref}
                className="font-display inline-flex min-h-12 items-center justify-center rounded-md bg-white px-7 py-3 text-xs font-bold uppercase tracking-widest transition-transform duration-200 hover:-translate-y-0.5"
                style={{ color: primaryColor }}
              >
                {heroContent.primary_cta_label.trim() || "Next match"}
              </Link>
              <Link
                href={secondaryHref}
                className="font-display inline-flex min-h-12 items-center justify-center rounded-md border border-white/30 px-7 py-3 text-xs font-bold uppercase tracking-widest text-white transition-transform duration-200 hover:-translate-y-0.5"
                style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
              >
                {heroContent.secondary_cta_label.trim() || "Meet the squad"}
              </Link>
            </div>
          </div>
          <div
            className="order-1 grid min-h-[30svh] place-items-center sm:min-h-[38svh] lg:order-2 lg:min-h-[560px]"
            aria-label={`${club.name} crest`}
          >
            {branding.clubLogoUrl && (
              <ResilientNativeImage
                src={branding.clubLogoUrl}
                alt={`${club.name} crest`}
                className="h-auto w-[min(68vw,320px)] object-contain drop-shadow-[0_34px_46px_rgba(0,0,0,0.28)] sm:w-[min(78vw,430px)] lg:w-[min(100%,700px)]"
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-screen min-h-[600px] w-full overflow-hidden md:h-[50vh] md:min-h-[380px]">
      {/* Static hero background. The legacy hardcoded video source lived on a
          Supabase project that was permanently deleted in the Phase 8 closeout,
          so the poster is now the hero image rather than a placeholder for a
          clip that can never load. See PF-005 in docs/platform-findings.md. */}
      <div className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {usesLegacyRoseCityHero && (
          <ResilientNativeImage
            src="/images/hero-poster.jpg"
            alt=""
            hideOnError
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "177.78vh",
              height: "56.25vw",
              minWidth: "100%",
              minHeight: "100%",
              transform: "translate(-50%, -50%)",
              objectFit: "cover",
            }}
          />
        )}
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: usesLegacyRoseCityHero
            ? "rgba(0,0,0,0.52)"
            : "linear-gradient(135deg, var(--color-black), var(--color-red-dark))",
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        className="absolute inset-0 flex flex-col items-end justify-end px-6 pb-28 text-center md:pb-16"
        style={{ zIndex: 3 }}
      >
        {!usesLegacyRoseCityHero && (
          <h1 className="mb-10 w-full text-center font-display text-5xl font-black uppercase text-white sm:text-7xl">
            {club.name}
          </h1>
        )}
        <div
          ref={ctaRef}
          className="flex flex-col sm:flex-row gap-4 w-full justify-center"
          style={{ opacity: 0 }}
        >
          <Link
            href="/shop"
            className="font-display font-bold text-sm tracking-widest uppercase px-8 py-4 transition-all duration-200"
            style={{ backgroundColor: "var(--color-red)", color: "#fff" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red-dark)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-red)")
            }
          >
            Team Store
          </Link>
          <Link
            href="/roster"
            className="font-display font-bold text-sm tracking-widest uppercase px-8 py-4 border border-white/50 text-white transition-all duration-200 hover:border-white hover:bg-white/10"
          >
            Meet the Squad
          </Link>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 md:hidden"
        style={{ zIndex: 4 }}
      >
        <span className="font-display text-xs tracking-widest uppercase text-white/50">
          Scroll
        </span>
        <div className="w-px h-8 bg-white/30" />
      </div>
    </section>
  );
}
