"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import PathwayAffiliationBar from "@/components/pathway/PathwayAffiliationBar";
import PathwayTrainingTrigger from "@/components/pathway/PathwayTrainingTrigger";

/**
 * Pathway public site header (shell chrome, MLA P1 Step 4), presented in the
 * accepted Presidential White direction: one crisp horizontal tier with the
 * tenant crest and standard affiliation lockup at the start, the route set
 * centered, and one filled "Book Training" action at the end. Crest data still comes from
 * useClubBranding() with the same initials fallback Nav.tsx /
 * EditorialHeader use; the link list is the same hardcoded-array pattern as
 * academyNavLinks() in components/Nav.tsx, but living here in the pathway
 * shell.
 *
 * The visible link row carries eight top-level destinations from pathway@1's
 * defaultRoutes
 * (packages/presentation/index.ts templateRegistry["pathway@1"]) resolved
 * through routeRegistry to the real paths the app serves:
 * home → /, academy → /academy, youth-club → /youth-club,
 * senior-club → /senior-club, league → /upsl, merch → /merch,
 * about → /about, contact → /contact. Roster and Fixtures remain children
 * of UPSL, so adding the routes does not disturb the centered composition.
 *
 * One defaultRoute is deliberately absent from this array because it is
 * already reachable from adjacent chrome, so listing it again only
 * lengthens the row: training (the primaryCta pill below).
 * PathwayFooter intentionally keeps the fuller link
 * set and remains the site's complete sitemap — this trim is scoped to the
 * primary nav only.
 */

type NavLink = { label: string; href: string };

const pathwayNavLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Academy", href: "/academy" },
  { label: "Youth Club", href: "/youth-club" },
  { label: "Senior Club", href: "/senior-club" },
  { label: "UPSL", href: "/upsl" },
  { label: "Merch", href: "/merch" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

// The href remains a functional full-page fallback. The explicit training
// trigger opens the shared selector for ordinary same-tab clicks.
const primaryCta: NavLink = { label: "Book Training", href: "/book-training" };
const upslRosterLink: NavLink = { label: "Roster", href: "/roster" };
const upslFixturesLink: NavLink = { label: "Fixtures", href: "/schedule" };

function isLinkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PathwayNav() {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [open, setOpen] = useState(false);
  const [desktopUpslOpen, setDesktopUpslOpen] = useState(false);
  const [mobileUpslOpen, setMobileUpslOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const desktopUpslRef = useRef<HTMLDivElement>(null);
  const desktopUpslButtonRef = useRef<HTMLButtonElement>(null);
  const rewrittenPathname = usePathname();
  // Tenant routes render at /_clubs/<slug>/... internally; strip that prefix
  // for active-link comparisons, exactly like Nav.tsx / EditorialHeader.
  const pathname = rewrittenPathname.replace(/^\/_clubs\/[^/]+/, "") || "/";

  // Opening the mobile menu locks background page scrolling, matching
  // EditorialHeader's treatment.
  useLayoutEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setDesktopUpslOpen(false);
    setMobileUpslOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!desktopUpslOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (desktopUpslRef.current?.contains(event.target as Node)) return;
      setDesktopUpslOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDesktopUpslOpen(false);
      desktopUpslButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [desktopUpslOpen]);

  const upslSectionActive = isLinkActive(pathname, "/upsl") || isLinkActive(pathname, upslRosterLink.href) || isLinkActive(pathname, upslFixturesLink.href);

  const clubInitials = club.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <header className="pathway-header">
      <div className="pathway-brand-row">
        <div className="pathway-identity-lockup">
          <Link
            className="pathway-brand-lockup"
            href="/"
            aria-label={`${club.name} home`}
            onClick={() => setOpen(false)}
          >
            {clubLogoUrl ? (
              <Image
                src={clubLogoUrl}
                alt=""
                width={84}
                height={84}
                priority
                {...imageDeliveryProps("club-logo")}
              />
            ) : (
              <span className="pathway-brand-initials">{clubInitials}</span>
            )}
            <span className="pathway-brand-name">{club.name}</span>
          </Link>

          <PathwayAffiliationBar />
        </div>

        <nav className="pathway-nav-row" aria-label="Main navigation">
          {pathwayNavLinks.map((link) => {
            const active = isLinkActive(pathname, link.href);
            if (link.href === "/upsl") {
              return (
                <div
                  className="pathway-nav-item pathway-nav-item-upsl"
                  data-active={upslSectionActive}
                  key={link.href}
                  ref={desktopUpslRef}
                  onMouseEnter={() => setDesktopUpslOpen(true)}
                  onMouseLeave={() => setDesktopUpslOpen(false)}
                  onFocus={() => setDesktopUpslOpen(true)}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    ) {
                      setDesktopUpslOpen(false);
                    }
                  }}
                >
                  <Link
                    className="pathway-nav-parent-link"
                    href={link.href}
                    data-active={upslSectionActive}
                    aria-current={pathname === "/upsl" ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                  <button
                    ref={desktopUpslButtonRef}
                    type="button"
                    className="pathway-nav-disclosure"
                    aria-expanded={desktopUpslOpen}
                    aria-controls="pathway-upsl-desktop-menu"
                    aria-label="Toggle UPSL navigation"
                    onClick={() => setDesktopUpslOpen((current) => !current)}
                  >
                    <span aria-hidden="true" />
                  </button>
                  {desktopUpslOpen && (
                    <div
                      className="pathway-nav-dropdown"
                      id="pathway-upsl-desktop-menu"
                    >
                      <Link
                        href={upslRosterLink.href}
                        aria-current={pathname === upslRosterLink.href ? "page" : undefined}
                        onClick={() => setDesktopUpslOpen(false)}
                      >
                        {upslRosterLink.label}
                      </Link>
                      <Link
                        href={upslFixturesLink.href}
                        aria-current={pathname === upslFixturesLink.href ? "page" : undefined}
                        onClick={() => setDesktopUpslOpen(false)}
                      >
                        {upslFixturesLink.label}
                      </Link>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                className="pathway-nav-link"
                key={link.href}
                href={link.href}
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <PathwayTrainingTrigger
          className="pathway-nav-cta pathway-nav-cta-desktop"
          href={primaryCta.href}
          data-active={isLinkActive(pathname, primaryCta.href)}
          aria-current={
            isLinkActive(pathname, primaryCta.href) ? "page" : undefined
          }
        >
          {primaryCta.label}
        </PathwayTrainingTrigger>

        <button
          ref={menuButtonRef}
          type="button"
          className="pathway-menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="pathway-mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          <span />
          <span />
        </button>
      </div>

      {open && (
        <nav
          className="pathway-mobile-menu"
          id="pathway-mobile-navigation"
          aria-label="Mobile navigation"
        >
          <div>
            {pathwayNavLinks.map((link) => {
              const active = isLinkActive(pathname, link.href);
              if (link.href === "/upsl") {
                return (
                  <div className="pathway-mobile-nav-group" key={link.href}>
                    <div className="pathway-mobile-nav-row">
                      <Link
                        className="pathway-mobile-nav-link"
                        href={link.href}
                        data-active={upslSectionActive}
                        aria-current={pathname === "/upsl" ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        {link.label}
                      </Link>
                      <button
                        type="button"
                        className="pathway-mobile-nav-disclosure"
                        aria-expanded={mobileUpslOpen}
                        aria-controls="pathway-upsl-mobile-menu"
                        aria-label="Toggle UPSL navigation"
                        onClick={() => setMobileUpslOpen((current) => !current)}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </div>
                    {mobileUpslOpen && (
                      <div
                        className="pathway-mobile-nav-children"
                        id="pathway-upsl-mobile-menu"
                      >
                        <Link
                          href={upslRosterLink.href}
                          aria-current={pathname === upslRosterLink.href ? "page" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          {upslRosterLink.label}
                        </Link>
                        <Link
                          href={upslFixturesLink.href}
                          aria-current={pathname === upslFixturesLink.href ? "page" : undefined}
                          onClick={() => setOpen(false)}
                        >
                          {upslFixturesLink.label}
                        </Link>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  className="pathway-mobile-nav-link"
                  key={link.href}
                  href={link.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
            <PathwayTrainingTrigger
              className="pathway-nav-cta"
              href={primaryCta.href}
              data-active={isLinkActive(pathname, primaryCta.href)}
              aria-current={
                isLinkActive(pathname, primaryCta.href) ? "page" : undefined
              }
            >
              {primaryCta.label}
            </PathwayTrainingTrigger>
          </div>
        </nav>
      )}
    </header>
  );
}
