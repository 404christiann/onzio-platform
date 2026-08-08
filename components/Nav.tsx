"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/ResilientImage";
import { usePathname } from "next/navigation";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { SHOW_SHOP_HERO } from "@/lib/site-flags";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { fetchPrograms, type ProgramContent } from "@/lib/queries";

const MIGRATED_LOGO_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/32ceba0b-4e25-52c2-bb6b-d82fb87637a7/branding`;

const affiliationLogos = [
  {
    colorSrc: `${MIGRATED_LOGO_BASE}/e6567f14-dd84-5bc2-9ad5-feba2bb7ebcd.webp`,
    whiteSrc: `${MIGRATED_LOGO_BASE}/9e07acc2-58e7-57e9-8cb3-6e3e6c6f62ab.webp`,
    alt: "US Soccer",
    className: "h-7 w-7 sm:h-10 sm:w-10",
    sizes: "(max-width: 639px) 28px, 40px",
  },
  {
    colorSrc: `${MIGRATED_LOGO_BASE}/156cf559-3506-54d2-b76d-fe1467a38ecb.webp`,
    whiteSrc: `${MIGRATED_LOGO_BASE}/372c1717-8e41-523c-9e77-10619c84510a.webp`,
    alt: "FIFA",
    className: "h-7 w-11 sm:h-10 sm:w-16",
    sizes: "(max-width: 639px) 44px, 64px",
  },
  {
    colorSrc: `${MIGRATED_LOGO_BASE}/ac5777e3-e529-5c35-a661-e215bc56fc17.webp`,
    whiteSrc: `${MIGRATED_LOGO_BASE}/56f60999-1821-566e-8769-f2b472d652e4.webp`,
    alt: "Lamar Hunt U.S. Open Cup",
    className: "h-7 w-7 sm:h-10 sm:w-10",
    sizes: "(max-width: 639px) 28px, 40px",
  },
  {
    colorSrc: `${MIGRATED_LOGO_BASE}/84a9350a-be9e-50ae-bc78-f197288c2bfb.webp`,
    whiteSrc: `${MIGRATED_LOGO_BASE}/39d5d7ca-17f1-54a7-8310-645128d401ce.webp`,
    alt: "UPSL",
    className: "h-7 w-7 sm:h-10 sm:w-10",
    sizes: "(max-width: 639px) 28px, 40px",
  },
];

const lionsLocalAffiliations = [
  {
    src: "/images/logo/affiliations/us-soccer-color.png",
    alt: "US Soccer",
    className: "h-8 w-8",
    sizes: "32px",
  },
  {
    src: "/images/logo/affiliations/fifa-color.png",
    alt: "FIFA",
    className: "h-8 w-14",
    sizes: "56px",
  },
  {
    src: "/images/logo/affiliations/upsl-color.png",
    alt: "UPSL",
    className: "h-8 w-8",
    sizes: "32px",
  },
];

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

type NavLink = {
  label: string;
  // Omitted for parent items that are hover/tap-only triggers with no page
  // of their own — "Club" exists purely to reveal its dropdown children.
  href?: string;
  children?: { label: string; href: string }[];
};

const navLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Roster", href: "/roster" },
  {
    label: "Club",
    children: [
      { label: "About Club", href: "/club/about" },
      { label: "Club Logo", href: "/club/logo" },
    ],
  },
  { label: "Schedule", href: "/schedule" },
  { label: "Shop", href: "/shop" },
];

const lionsNavLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Schedule", href: "/schedule" },
  { label: "Shop", href: "/shop" },
];

function academyNavLinks(programs: ProgramContent[]): NavLink[] {
  return [
    { label: "Home", href: "/" },
    { label: "About", href: "/club/about" },
    { label: "Roster", href: "/roster" },
    {
      label: "Schedule",
      href: "/schedule",
      children: [
        { label: "Fixtures", href: "/schedule" },
        { label: "Tryouts", href: "/tryouts" },
      ],
    },
    {
      label: "Programs", href: "/programs",
      children: programs.map((program) => ({
        label: program.navLabel || program.displayTitle,
        href: `/programs/${program.slug}`,
      })),
    },
    { label: "Store", href: "/shop" },
    { label: "Contact", href: "/contact" },
  ];
}

function isLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, link: NavLink) {
  if (link.href) return isLinkActive(pathname, link.href);
  return link.children?.some((child) => pathname === child.href) ?? false;
}

export default function Nav() {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const rewrittenPathname = usePathname();
  const pathname = rewrittenPathname.replace(/^\/_clubs\/[^/]+/, "") || "/";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedMobileLink, setExpandedMobileLink] = useState<string | null>(null);
  const [academyPrograms, setAcademyPrograms] = useState<ProgramContent[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const isAcademy = club.presentationTemplateKey === "academy@1";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setExpandedMobileLink(null);
  }, [pathname]);

  // academy@1's mobile menu is a full-viewport overlay (mockup parity), so
  // lock page scroll behind it while it is open.
  useEffect(() => {
    if (!isAcademy) return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAcademy, menuOpen]);

  useEffect(() => {
    if (club.presentationTemplateKey !== "academy@1") {
      setAcademyPrograms([]);
      return;
    }
    fetchPrograms(club.id)
      .then(setAcademyPrograms)
      .catch((error) => {
        console.error("Academy navigation programs:", error);
        setAcademyPrograms([]);
      });
  }, [club.id, club.presentationTemplateKey]);

  // Transparent nav only on desktop for shop (mobile shop hero is compact, not full-bleed)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // /club/logo is a full-page dark infographic — the nav stays in its
  // transparent/white-text state throughout, since it never needs to
  // contrast against a light background there.
  const isAlwaysTransparentPage = pathname === "/club/logo";
  // academy@1 program detail pages open on a full-bleed photo hero, so the
  // nav starts transparent over it exactly like the mockup (which lists the
  // four /programs/<slug> routes in its usesTransparentNav set). The
  // /programs index page's hero is a solid navy band and keeps a solid nav.
  const isAcademyProgramDetail =
    isAcademy && /^\/programs\/[^/]+$/.test(pathname);
  const isDarkHeroPage =
    pathname === "/" ||
    isAcademyProgramDetail ||
    (pathname === "/shop" && SHOW_SHOP_HERO && !isMobile);
  // Mockup parity: an open mobile menu forces the solid light header strip
  // (mock: `transparent = usesTransparentNav && !scrolled && !open`).
  const isHero =
    isAlwaysTransparentPage ||
    (isDarkHeroPage && !scrolled && !(isAcademy && menuOpen));
  const activeNavLinks = club.presentationTemplateKey === "academy@1"
    ? academyNavLinks(academyPrograms)
    : navLinks;

  if (club.presentationTemplateKey === "clubhouse@1") {
    const isHomeTop = pathname === "/" && !scrolled;
    return (
      <header
        ref={navRef}
        className="clubhouse-site-header"
        data-home={pathname === "/"}
        data-scrolled={scrolled}
        data-brand-visible={!isHomeTop || menuOpen}
      >
        <Link
          href="/"
          className="clubhouse-brand-lockup"
          aria-label={`${club.name} Home`}
        >
          {clubLogoUrl ? (
            <Image
              src={clubLogoUrl}
              alt={club.name}
              width={82}
              height={82}
              priority
              {...imageDeliveryProps("club-logo")}
            />
          ) : (
            <span>{club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}</span>
          )}
        </Link>
        <div className="clubhouse-affiliation-lockup" aria-label="Club affiliations">
          <span aria-hidden="true" />
          <div>
            {lionsLocalAffiliations.map((logo) => (
              <div key={logo.alt} className={`relative flex-shrink-0 ${logo.className}`}>
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  fill
                  className="object-contain"
                  sizes={logo.sizes}
                  {...imageDeliveryProps("small-graphic")}
                />
              </div>
            ))}
          </div>
        </div>
        <nav className="clubhouse-desktop-nav" aria-label="Primary navigation">
          {lionsNavLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href ?? "/"}
              data-active={link.href ? isLinkActive(pathname, link.href) : false}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="clubhouse-header-actions">
          <button
            type="button"
            className="clubhouse-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-label="Toggle menu"
          >
            <span />
            <span />
          </button>
        </div>
        {menuOpen && (
          <div className="clubhouse-mobile-menu">
            <div>
              {lionsNavLinks.map((link, index) => (
                <Link key={link.href} href={link.href ?? "/"}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>
    );
  }

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
          <Link href="/" className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center sm:h-24 sm:w-24" aria-label={`${club.name} Home`}>
            {clubLogoUrl ? (
              <Image
                src={clubLogoUrl}
                alt={club.name}
                fill
                className="object-contain transition-all duration-300"
                sizes="(max-width: 639px) 64px, 96px"
                priority
                {...imageDeliveryProps("club-logo")}
              />
            ) : (
              <span className="font-display text-xl font-black uppercase text-current">
                {club.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3)}
              </span>
            )}
          </Link>

          {(club.slug === "rose-city" || club.presentationTemplateKey === "academy@1") && <>
            <div
              className="flex-shrink-0"
              style={{ width: "1px", height: "28px", backgroundColor: isHero ? "rgba(255,255,255,0.3)" : "rgba(20,20,20,0.15)" }}
            />

            <div className="flex items-center gap-1 sm:gap-2">
              {(club.slug === "rose-city" ? affiliationLogos : academyAffiliations).map((logo) => (
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
          </>}
        </div>

        {/* Desktop Links */}
        <ul className="hidden md:flex items-center gap-8">
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
                {link.children && (
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
                {link.href ? (
                  <Link href={link.href} className={triggerClassName} style={triggerStyle}>
                    {triggerContent}
                  </Link>
                ) : (
                  <span className={`${triggerClassName} cursor-default`} style={triggerStyle}>
                    {triggerContent}
                  </span>
                )}

                {/* Dropdown — mirrors the nav's own transparent/opaque state */}
                {link.children && (
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
                      {link.children.map((child) => {
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
        >
          <span className={`block w-6 h-0.5 transition-all duration-300 origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
          <span className={`block w-6 h-0.5 transition-all duration-300 ${menuOpen ? "opacity-0 scale-x-0" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
          <span className={`block w-6 h-0.5 transition-all duration-300 origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            style={{ backgroundColor: isHero ? "#ffffff" : "var(--color-black)" }} />
        </button>
      </nav>

      {/* Mobile Menu Drawer — academy@1 gets the mockup's full-viewport
          overlay panel (page cannot bleed through below the last link);
          other templates keep the compact drawer. */}
      <div
        className={
          isAcademy
            ? `absolute inset-x-0 top-24 h-[calc(100dvh-6rem)] overflow-hidden bg-white transition-[opacity,visibility] duration-300 sm:top-28 sm:h-[calc(100dvh-7rem)] md:hidden ${
                menuOpen ? "visible opacity-100" : "invisible opacity-0"
              }`
            : `md:hidden bg-white border-t border-gray-100 overflow-hidden transition-all duration-300 ${
                menuOpen ? "max-h-[30rem] opacity-100" : "max-h-0 opacity-0"
              }`
        }
      >
        <ul className={isAcademy ? "flex h-full flex-col justify-center px-8 pb-16" : "flex flex-col px-8 py-6 gap-6"}>
          {activeNavLinks.map((link, index) => {
            const isActive = isNavItemActive(pathname, link);
            const isExpanded = expandedMobileLink === link.label;
            const labelClassName = isAcademy
              ? `font-display text-3xl font-black uppercase italic block py-4 ${
                  isActive ? "text-[var(--color-red)]" : "text-[var(--color-black)]"
                }`
              : `font-body text-lg font-semibold tracking-widest uppercase block py-1 ${
                  isActive ? "text-[var(--color-red)]" : "text-[var(--color-black)]"
                }`;
            const indexBadge = isAcademy ? (
              <span
                className="font-body text-xs flex-shrink-0"
                style={{ fontStyle: "normal", color: "var(--color-gray-mid)" }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
            ) : null;
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
                className={isAcademy ? "border-b" : undefined}
                style={isAcademy ? { borderColor: "rgba(30,54,83,0.1)" } : undefined}
              >
                {link.href ? (
                  <div className="flex items-center justify-between gap-3">
                    <Link href={link.href} className={labelClassName}>
                      {link.label}
                    </Link>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {indexBadge}
                      {link.children && (
                        <button
                          type="button"
                          aria-label={isExpanded ? `Collapse ${link.label} menu` : `Expand ${link.label} menu`}
                          onClick={() => setExpandedMobileLink(isExpanded ? null : link.label)}
                          className="p-2 -mr-2"
                        >
                          {chevron}
                        </button>
                      )}
                    </div>
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
                      {indexBadge}
                      {chevron}
                    </div>
                  </button>
                )}

                {link.children && (
                  <ul
                    className={`overflow-hidden transition-all duration-300 ${
                      isExpanded ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0"
                    }`}
                  >
                    {link.children.map((child) => {
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
