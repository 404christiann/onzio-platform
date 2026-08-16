"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";

/**
 * Pathway public site header (shell chrome, MLA P1 Step 4): centered crest
 * lockup over a single centered link row plus one filled "Book Training"
 * CTA. Crest comes from useClubBranding() with the same initials fallback
 * Nav.tsx / EditorialHeader use; the link list is the same hardcoded-array
 * pattern as academyNavLinks() in components/Nav.tsx, but living here in
 * the pathway shell.
 *
 * The visible link row carries six of pathway@1's defaultRoutes
 * (packages/presentation/index.ts templateRegistry["pathway@1"]) resolved
 * through routeRegistry to the real paths the app serves:
 * academy → /academy, youth-club → /youth-club,
 * senior-club → /senior-club, league → /upsl, merch → /merch,
 * about → /about.
 *
 * Three defaultRoutes are deliberately absent from this array because each
 * is already reachable from adjacent chrome, so listing it again only
 * lengthens the row: home (the crest lockup above links to /), training
 * (the primaryCta pill below), and contact (that same pill's destination,
 * plus PathwayFooter). PathwayFooter intentionally keeps the fuller link
 * set and remains the site's complete sitemap — this trim is scoped to the
 * primary nav only.
 */

type NavLink = { label: string; href: string };

const pathwayNavLinks: NavLink[] = [
  { label: "Academy", href: "/academy" },
  { label: "Youth Club", href: "/youth-club" },
  { label: "Senior Club", href: "/senior-club" },
  { label: "UPSL", href: "/upsl" },
  { label: "Merch", href: "/merch" },
  { label: "About", href: "/about" },
];

// Routes to the contact form, not the /book-training page: Phase 1 has no
// Acuity/scheduler integration (deferred to admin Phase 2), so the site's
// only real booking action is the contact form, per the Phase 1 plan.
const primaryCta: NavLink = { label: "Book Training", href: "/contact" };

function isLinkActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PathwayNav() {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [open, setOpen] = useState(false);
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
  }, [pathname]);

  const clubInitials = club.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <header className="pathway-header">
      <div className="pathway-brand-row">
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
              width={76}
              height={76}
              priority
              {...imageDeliveryProps("club-logo")}
            />
          ) : (
            <span className="pathway-brand-initials">{clubInitials}</span>
          )}
          <span className="pathway-brand-name">{club.name}</span>
        </Link>
        <button
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

      <nav className="pathway-nav-row" aria-label="Main navigation">
        {pathwayNavLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-active={isLinkActive(pathname, link.href)}
          >
            {link.label}
          </Link>
        ))}
        <Link className="pathway-nav-cta" href={primaryCta.href}>
          {primaryCta.label}
        </Link>
      </nav>

      {open && (
        <div className="pathway-mobile-menu" id="pathway-mobile-navigation">
          <div>
            {pathwayNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-active={isLinkActive(pathname, link.href)}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              className="pathway-nav-cta"
              href={primaryCta.href}
              onClick={() => setOpen(false)}
            >
              {primaryCta.label}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
