"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";

/**
 * Editorial public site header, ported from the approved concept mockup
 * (soccerplatformmockups src/components/layout/SiteHeader.tsx).
 *
 * Interior routes use the solid-white treatment immediately: full-color
 * crest, primary-color navigation text, and the accent active underline.
 * The homepage is the deliberate exception only at scrollY === 0: the
 * header is transparent, its navigation is on-dark, and the small navbar
 * crest is hidden. As soon as the visitor scrolls, the header becomes
 * white and reveals the full-color crest.
 *
 * Starter scope: navigation is Home / Roster / Schedule / Tryouts with no
 * Store link. The mockup's Admin Preview control and concept-preview
 * affordances are intentionally not ported.
 */

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Roster" },
  { href: "/schedule", label: "Schedule" },
  { href: "/tryouts", label: "Tryouts" },
];

export default function EditorialHeader({
  clubName,
  clubInitials,
  crestUrl,
}: {
  clubName: string;
  clubInitials: string;
  crestUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const updateHeader = () =>
      setScrolled(window.scrollY > (pathname === "/" ? 0 : 24));
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [pathname]);

  // Opening the mobile menu locks background page scrolling.
  useLayoutEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const isHome = pathname === "/";
  const brandVisible = !isHome || scrolled;

  return (
    <header
      className="site-header"
      data-home={isHome}
      data-scrolled={scrolled}
      data-brand-visible={brandVisible}
    >
      <Link
        className="brand-lockup"
        href="/"
        aria-label={`${clubName} home`}
        onClick={() => setOpen(false)}
      >
        {crestUrl ? (
          <Image
            src={crestUrl}
            alt=""
            width={108}
            height={107}
            priority
            {...imageDeliveryProps("club-logo")}
          />
        ) : (
          <span className="brand-initials">{clubInitials}</span>
        )}
      </Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <Link
            data-active={pathname === item.href}
            key={item.href}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="header-actions">
        <button
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          <span />
          <span />
        </button>
      </div>
      {open && (
        <div className="mobile-menu" id="mobile-navigation">
          <div>
            {NAV_ITEMS.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
              >
                <small>0{index + 1}</small>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
