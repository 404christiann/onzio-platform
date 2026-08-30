"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Single editorial GSAP/ScrollTrigger orchestration layer. Ported near-
 * verbatim (pure animation logic, no data dependencies) from the approved
 * concept mockup via the superseded claude/lions-fc-website-setup-ij0p7t
 * reference branch's EditorialMotion.tsx.
 *
 * Owns the hero timeline, interior-hero reveal, section scroll-reveal, card
 * stagger, restrained hero parallax, and footer column reveal. Behavior
 * contracts kept intact from the mockup:
 * - desktop/mobile gsap.matchMedia branching at 800px
 * - full prefers-reduced-motion early exit (nothing animates)
 * - route-change cleanup: matchMedia and context revert on unmount and on
 *   every navigation so no ScrollTrigger leaks across routes
 *
 * Until later phases add the editorial roster/schedule/tryouts page bodies,
 * some selectors (.fixture-row, .player-card, .staff-card,
 * .interior-hero) match nothing on this phase's home-page-only build; every
 * tween below is guarded so that is a safe no-op, not an error.
 */

const CARD_SELECTOR = [
  ".fixture-row",
  ".match-side",
  ".player-card",
  ".staff-card",
].join(",");

export default function EditorialMotion() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(
      '[data-site-template="editorial"] .public-main',
    );
    if (!root) return;

    const media = gsap.matchMedia();
    const context = gsap.context(() => {
      media.add(
        {
          desktop: "(min-width: 801px)",
          mobile: "(max-width: 800px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (match) => {
          const { desktop, reduceMotion } = match.conditions as {
            desktop: boolean;
            mobile: boolean;
            reduceMotion: boolean;
          };

          if (reduceMotion) return;

          const distance = desktop ? 38 : 22;
          const duration = desktop ? 0.82 : 0.62;
          const stagger = desktop ? 0.085 : 0.055;
          const revealStart = desktop ? "top 86%" : "top 92%";
          const hero = root.querySelector<HTMLElement>(".hero");
          const interiorHero = root.querySelector<HTMLElement>(".interior-hero");

          if (hero) {
            const heroTimeline = gsap.timeline({
              defaults: { duration, ease: "power3.out" },
            });

            if (hero.querySelector(".hero-media")) {
              heroTimeline.from(".hero-media", {
                autoAlpha: 0,
                x: desktop ? 56 : 0,
                y: desktop ? 0 : -18,
                scale: 0.97,
                duration: desktop ? 1 : 0.72,
              });
            }
            if (hero.querySelector("h1")) {
              heroTimeline.from(
                ".hero h1",
                { autoAlpha: 0, x: desktop ? -48 : -24 },
                "-=0.72",
              );
            }
            if (hero.querySelector(".hero-intro")) {
              heroTimeline.from(
                ".hero-intro",
                { autoAlpha: 0, y: desktop ? 14 : 9 },
                "-=0.48",
              );
            }
            if (hero.querySelector(".hero-cta")) {
              heroTimeline.from(
                ".hero-cta",
                { autoAlpha: 0, y: distance * 0.65 },
                "-=0.5",
              );
            }

            const heroImage = hero.querySelector<HTMLElement>(
              ".hero-media > img",
            );
            if (heroImage) {
              gsap.set(heroImage, { scale: desktop ? 1.07 : 1.035 });
              gsap.to(heroImage, {
                yPercent: desktop ? 9 : 4,
                ease: "none",
                scrollTrigger: {
                  trigger: hero,
                  start: "top top",
                  end: "bottom top",
                  scrub: desktop ? 0.8 : 0.45,
                },
              });
            }
          }

          if (interiorHero) {
            const heroElements = interiorHero.querySelectorAll<HTMLElement>(
              ".eyebrow, h1, .schedule-controls",
            );
            if (heroElements.length) {
              gsap.from(heroElements, {
                autoAlpha: 0,
                y: distance,
                duration,
                ease: "power3.out",
                stagger,
              });
            }
          }

          root
            .querySelectorAll<HTMLElement>("section:not(.hero)")
            .forEach((section) => {
              gsap.from(section, {
                autoAlpha: 0,
                y: distance,
                duration,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: section,
                  start: revealStart,
                  once: true,
                },
              });

              const cards = section.querySelectorAll<HTMLElement>(CARD_SELECTOR);
              if (!cards.length) return;

              gsap.from(cards, {
                autoAlpha: 0,
                y: desktop ? 30 : 18,
                duration: duration * 0.9,
                ease: "power2.out",
                stagger,
                scrollTrigger: {
                  trigger: section,
                  start: revealStart,
                  once: true,
                },
              });
            });

          const footerColumns = document.querySelectorAll<HTMLElement>(
            '[data-site-template="editorial"] .footer-main > *, [data-site-template="editorial"] .footer-bottom > *',
          );
          const footer = document.querySelector<HTMLElement>(
            '[data-site-template="editorial"] .site-footer',
          );
          if (footer && footerColumns.length) {
            gsap.from(footerColumns, {
              autoAlpha: 0,
              y: desktop ? 24 : 14,
              duration: duration * 0.85,
              ease: "power2.out",
              stagger: stagger * 0.75,
              scrollTrigger: {
                trigger: footer,
                start: revealStart,
                once: true,
              },
            });
          }
        },
      );
    }, root);

    ScrollTrigger.refresh();

    return () => {
      media.revert();
      context.revert();
    };
  }, [pathname]);

  return null;
}
