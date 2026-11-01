"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import Image from "@/components/ResilientImage";
import { usePathname } from "next/navigation";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { SHOW_SHOP_HERO } from "@/lib/site-flags";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchPrograms, type ProgramContent } from "@/lib/queries";
import { useAcademyPageScrollLock } from "./LoadingSkeleton";
import { academyNavItems, isNavItemActive } from "./navigation";
import { academyHeroHeader, academyHref, academyPathname } from "./routes";

// Standard US Soccer/FIFA/UPSL federation badges for the academy@1 template.
// Scoped to the template key, not any single club's slug — see EPIC.md's
// locked boundary against per-club tenant branches in presentation code.
const academyAffiliations = [
  {
    colorSrc: "/images/logo/affiliations/us-soccer-color.png",
    whiteSrc: "/images/logo/affiliations/us-soccer-white.png",
    alt: "US Soccer",
    className: "h-7 w-7 sm:h-10 sm:w-10",
    sizes: "(max-width: 639px) 28px, 40px",
  },
  {
    colorSrc: "/images/logo/affiliations/fifa-color.png",
    whiteSrc: "/images/logo/affiliations/fifa-white.png",
    alt: "FIFA",
    className: "h-7 w-11 sm:h-10 sm:w-16",
    sizes: "(max-width: 639px) 44px, 64px",
  },
  {
    colorSrc: "/images/logo/affiliations/upsl-color.png",
    whiteSrc: "/images/logo/affiliations/upsl-white.png",
    alt: "UPSL",
    className: "h-7 w-7 sm:h-10 sm:w-10",
    sizes: "(max-width: 639px) 28px, 40px",
  },
];

export const ACADEMY_PROGRAMS_FALLBACK_MS = 5_000;

export function loadAcademyNavPrograms(
  load: () => Promise<ProgramContent[]>,
  onReady: (programs: ProgramContent[]) => void,
  onUnavailable: () => void,
): () => void {
  let active = true;
  const timeout = globalThis.setTimeout(() => {
    if (active) onUnavailable();
  }, ACADEMY_PROGRAMS_FALLBACK_MS);

  void load().then((programs) => {
    if (!active) return;
    globalThis.clearTimeout(timeout);
    onReady(programs);
  }).catch((error) => {
    if (!active) return;
    globalThis.clearTimeout(timeout);
    console.error("Academy navigation programs:", error);
    onUnavailable();
  });

  return () => {
    active = false;
    globalThis.clearTimeout(timeout);
  };
}

export default function Nav({ loadingAppearance = false }: { loadingAppearance?: boolean }) {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const preview = useHomepagePreview();
  const rewrittenPathname = usePathname();
  const pathname = preview ? academyHref("home") : academyPathname(rewrittenPathname);
  const heroHeader = academyHeroHeader(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedMobileLink, setExpandedMobileLink] = useState<string | null>(null);
  const [academyPrograms, setAcademyPrograms] = useState<ProgramContent[]>([]);
  const [programsState, setProgramsState] = useState<"loading" | "ready" | "error">("loading");
  const navRef = useRef<HTMLElement>(null);
  const [pageLoading, setPageLoading] = useState(!preview && heroHeader !== undefined);

  useEffect(() => {
    if (preview) return;
    const sync = () => setPageLoading(Boolean(document.querySelector("[data-academy-page-loading]")));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [preview]);

  useEffect(() => {
    const viewport = navRef.current?.ownerDocument.defaultView ?? window;
    const onScroll = () => setScrolled(viewport.scrollY > 40);
    onScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setExpandedMobileLink(null);
  }, [pathname]);

  // The full-viewport mobile menu shares its scroll lock with the hero veil.
  // Closing one must not unlock the page while the other still covers it.
  useAcademyPageScrollLock(menuOpen);

  useEffect(() => {
    return loadAcademyNavPrograms(
      () => fetchPrograms(club.id),
      (programs) => {
        setAcademyPrograms(programs);
        setProgramsState("ready");
      },
      () => {
        setAcademyPrograms([]);
        setProgramsState("error");
      },
    );
  }, [club.id]);

  // Transparent nav only on desktop for shop (mobile shop hero is compact, not full-bleed)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const viewport = navRef.current?.ownerDocument.defaultView ?? window;
    const check = () => setIsMobile(viewport.innerWidth < 640);
    check();
    viewport.addEventListener("resize", check);
    return () => viewport.removeEventListener("resize", check);
  }, []);

  // /club/logo is a full-page dark infographic — the nav stays in its
  // transparent/white-text state throughout, since it never needs to
  // contrast against a light background there.
  const isAlwaysTransparentPage = heroHeader === "always";
  const isDarkHeroPage =
    heroHeader === "scroll" ||
    (heroHeader === "scroll-desktop" && SHOW_SHOP_HERO && !isMobile);
  // Mockup parity: an open mobile menu forces the solid light header strip
  // (mock: `transparent = usesTransparentNav && !scrolled && !open`).
  const isHero =
    !(loadingAppearance || pageLoading) &&
    (isAlwaysTransparentPage || (isDarkHeroPage && !scrolled && !menuOpen));
  // The shared /club-logo route has a legacy Rose City fallback. Keep this
  // tenant's initials visible until its scoped branding read has a real URL.
  const displayedLogoUrl = clubLogoUrl;
  const activeNavLinks = academyNavItems(academyPrograms);

  return (
    <header
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isHero
          ? "bg-transparent"
          : "bg-white/95 backdrop-blur-sm shadow-sm"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-10 flex items-center justify-between h-24 sm:h-28">
        {/* Logo row */}
        <div className="flex min-w-0 flex-shrink-0 items-center gap-2 sm:gap-3">
          <Link href={academyHref("home")} className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center sm:h-24 sm:w-24" aria-label={`${club.name} Home`}>
            {displayedLogoUrl ? (
              <Image
                src={displayedLogoUrl}
                alt={club.name}
                fill
                className="object-contain transition-all duration-300"
                sizes="(max-width: 639px) 64px, 96px"
                priority
                fallback={<span className="font-display text-xl font-black uppercase text-current">{club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}</span>}
                {...imageDeliveryProps("club-logo")}
              />
            ) : (
              <span className="font-display text-xl font-black uppercase text-current">
                {club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}
              </span>
            )}
          </Link>

          <div
            className="flex-shrink-0"
            style={{ width: "1px", height: "28px", backgroundColor: isHero ? "rgba(255,255,255,0.3)" : "rgba(20,20,20,0.15)" }}
          />

          <div className="flex items-center gap-1 sm:gap-2">
            {academyAffiliations.map((logo) => (
              <div key={logo.alt} className={`relative flex-shrink-0 ${logo.className}`}>
                <Image
                  src={isHero ? logo.whiteSrc : logo.colorSrc}
                  alt={logo.alt}
                  fill
                  className="object-contain transition-all duration-300"
                  sizes={logo.sizes}
                  priority
                  onError={(event) => {
                    if (event.currentTarget.dataset.fallbackApplied === "true") return;
                    event.currentTarget.dataset.fallbackApplied = "true";
                    event.currentTarget.srcset = "";
                    event.currentTarget.src = isHero ? logo.colorSrc : logo.whiteSrc;
                  }}
                  {...imageDeliveryProps("small-graphic")}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Links. Below xl (1280px, where max-w-7xl caps out) this
            stays a normal flex sibling of the logo, same as before — at
            those widths the nav content already spans the full viewport, so
            the links already sit flush against the true right edge and
            there's no room to spare (an absolute right-anchor here would
            overlap the logo on narrower "desktop" widths like ~820px).
            Only past xl, once mx-auto starts centering the capped content
            and leaving real margin, do the links pin to the header's own
            right edge (header is fixed, already the containing block) so
            they keep hugging the true page edge instead of stopping at the
            1280px box. Logo position is untouched either way. */}
        <ul className="hidden md:flex items-center gap-8 xl:absolute xl:right-[6.5rem] xl:top-1/2 xl:-translate-y-1/2">
          {activeNavLinks.map((link) => {
            const isActive = isNavItemActive(pathname, link);
            const triggerClassName =
              "font-nav text-sm font-semibold tracking-widest uppercase transition-colors duration-300 relative group/link inline-flex items-center gap-1.5";
            const triggerStyle = {
              color: isActive
                ? isHero
                  ? "#ffffff"
                  : "var(--color-red)"
                : isHero
                ? "rgba(255,255,255,0.85)"
                : "var(--color-black)",
            };
            const triggerContent = (
              <>
                {link.label}
                {"children" in link && (
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="transition-transform duration-200 group-hover:rotate-180"
                    style={{ opacity: isHero ? 0.85 : 0.55 }}
                  >
                    <path
                      d="M2 3.5L5 6.5L8 3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {/* Active / hover underline */}
                <span
                  className={`absolute -bottom-1 left-0 h-0.5 transition-all duration-300 ${
                    isActive ? "w-full" : "w-0 group-hover/link:w-full"
                  }`}
                  style={{ backgroundColor: isHero ? "var(--color-red)" : "var(--color-black)" }}
                />
              </>
            );
            return (
              <li key={link.label} className="relative group">
                {"href" in link ? (
                  <Link href={link.href} className={triggerClassName} style={triggerStyle}>
                    {triggerContent}
                  </Link>
                ) : (
                  <span className={`${triggerClassName} cursor-default`} style={triggerStyle}>
                    {triggerContent}
                  </span>
                )}

                {/* Dropdown — mirrors the nav's own transparent/opaque state */}
                {"children" in link && (
                  <div className="absolute left-1/2 top-full w-max -translate-x-1/2 pt-3 opacity-0 pointer-events-none transition-opacity duration-200 group-hover:opacity-100 group-hover:pointer-events-auto">
                    <div
                      className="overflow-hidden rounded-lg"
                      style={{
                        backgroundColor: isHero ? "rgba(20,20,20,0.82)" : "#ffffff",
                        backdropFilter: isHero ? "blur(10px)" : undefined,
                        WebkitBackdropFilter: isHero ? "blur(10px)" : undefined,
                        border: isHero
                          ? "1px solid rgba(255,255,255,0.14)"
                          : "1px solid rgba(20,20,20,0.08)",
                        boxShadow: isHero
                          ? "0 16px 32px rgba(0,0,0,0.4)"
                          : "0 16px 32px rgba(20,20,20,0.12)",
                      }}
                    >
                      {link.label === "Programs" && programsState === "loading" ? (
                        <div className={`flex items-center gap-2 px-5 py-4 font-nav text-xs ${isHero ? "text-white/80" : "text-[#51667E]"}`} aria-label="Loading programs" role="status">
                          <span className={`h-3.5 w-3.5 rounded-full border-2 motion-safe:animate-spin ${isHero ? "border-white/35 border-t-white" : "border-[#cad8e3] border-t-[#426c88]"}`} aria-hidden="true" />
                          Loading programs…
                        </div>
                      ) : link.label === "Programs" && link.children.length === 0 ? (
                        <p className={`px-5 py-3 font-nav text-xs ${isHero ? "text-white/80" : "text-[#51667E]"}`} role="status">
                          {programsState === "error" ? "Programs unavailable" : "No programs available"}
                        </p>
                      ) : link.children.map((child) => {
                        const isChildActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-5 py-3 font-nav text-xs font-semibold tracking-widest uppercase transition-colors duration-200 ${
                              isHero
                                ? isChildActive
                                  ? "text-white"
                                  : "text-white/80 hover:text-white"
                                : isChildActive
                                ? "text-[var(--color-red)]"
                                : "text-[var(--color-black)] hover:text-[var(--color-red)]"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={`block w-6 h-0.5 transition-all duration-300 origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
          <span className={`block w-6 h-0.5 transition-all duration-300 ${menuOpen ? "opacity-0 scale-x-0" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
          <span className={`block w-6 h-0.5 transition-all duration-300 origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
        </button>
      </nav>

      {/* Mobile Menu Drawer — the mockup's full-viewport overlay panel
          (page cannot bleed through below the last link). */}
      <div
        className={`absolute inset-x-0 top-24 h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain bg-white transition-[opacity,visibility] duration-300 sm:top-28 sm:h-[calc(100dvh-7rem)] md:hidden ${
          menuOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <ul className="flex min-h-full flex-col justify-center px-8 pb-16">
          {activeNavLinks.map((link) => {
            const isActive = isNavItemActive(pathname, link);
            const isExpanded = expandedMobileLink === link.label;
            const labelClassName = `font-display text-3xl font-black uppercase italic block py-4 ${
              isActive ? "text-[var(--color-red)]" : "text-[var(--color-black)]"
            }`;
            const chevron = (
              <svg
                width="12"
                height="12"
                viewBox="0 0 10 10"
                fill="none"
                className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                style={{ color: "var(--color-black)", opacity: 0.55 }}
              >
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
            return (
              <li
                key={link.label}
                className="border-b"
                style={{ borderColor: "rgba(30,54,83,0.1)" }}
              >
                {"href" in link ? (
                  <div className="flex items-center justify-between gap-3">
                    <Link href={link.href} className={labelClassName}>
                      {link.label}
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0" />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedMobileLink(isExpanded ? null : link.label)}
                    className="flex items-center justify-between gap-3 w-full text-left"
                  >
                    <span className={labelClassName}>{link.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {chevron}
                    </div>
                  </button>
                )}

                {"children" in link && (
                  <ul
                    className={`overflow-hidden transition-all duration-300 ${
                      isExpanded ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0"
                    }`}
                  >
                    {link.label === "Programs" && programsState === "loading" ? (
                      <li className="flex items-center gap-2 px-4 py-2 font-body text-sm text-[#51667E]" role="status" aria-label="Loading programs">
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-[#cad8e3] border-t-[#426c88] motion-safe:animate-spin" aria-hidden="true" />
                        Loading programs…
                      </li>
                    ) : link.label === "Programs" && link.children.length === 0 ? (
                      <li className="px-4 py-2 font-body text-sm text-[#51667E]" role="status">
                        {programsState === "error" ? "Programs unavailable" : "No programs available"}
                      </li>
                    ) : link.children.map((child) => {
                      const isChildActive = pathname === child.href;
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            className={`font-body text-sm font-semibold tracking-widest uppercase block py-2 pl-4 border-l-2 ${
                              isChildActive
                                ? "text-[var(--color-red)] border-[var(--color-red)]"
                                : "text-[var(--color-black)]/70 border-[var(--color-black)]/15"
                            }`}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
