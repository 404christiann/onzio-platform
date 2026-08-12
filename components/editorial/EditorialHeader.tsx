"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import Image from "@/components/ResilientImage";
import { imageDeliveryProps } from "@/lib/image-delivery";

/**
 * Editorial public site header. Ported (visual behavior) from the approved
 * concept mockup via the superseded claude/lions-fc-website-setup-ij0p7t
 * reference branch's EditorialHeader.tsx -- transparent-on-home-at-scroll-0
 * treatment, crest lockup, mobile full-panel menu -- with its flat NAV_ITEMS
 * list rewritten into the dropdown-capable shape from Nav.tsx's
 * academyNavLinks()/isNavItemActive() pattern (components/Nav.tsx lines
 * ~124-260), since "Schedule" now has a Fixtures/Tryouts dropdown and the
 * whole list has an entitlement-gated "Store" entry.
 *
 * Desktop dropdowns open on hover AND keyboard focus via plain CSS
 * (:hover, :focus-within in styles/editorial.css) -- no JS open/close state
 * needed there, matching Nav.tsx's own group-hover-only desktop dropdown.
 * The mobile accordion still needs JS (expandedMobileLink) since a tap does
 * not have a CSS-only equivalent to :hover/:focus-within.
 */

type NavLink = {
  label: string;
  // Omitted for parent items that are hover/tap-only dropdown triggers with
  // no page of their own -- "Schedule" exists purely to reveal Fixtures and
  // Tryouts.
  href?: string;
  children?: { label: string; href: string }[];
};

function editorialNavLinks(storeEnabled: boolean): NavLink[] {
  const links: NavLink[] = [
    { label: "Home", href: "/" },
    { label: "About", href: "/club/about" },
    { label: "Roster", href: "/roster" },
    {
      label: "Schedule",
      children: [
        { label: "Fixtures", href: "/schedule" },
        { label: "Tryouts", href: "/tryouts" },
      ],
    },
  ];
  if (storeEnabled) {
    links.push({ label: "Store", href: "/shop" });
  }
  links.push({ label: "Contact", href: "/contact" });
  return links;
}

function isLinkActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isNavItemActive(pathname: string, link: NavLink) {
  if (link.href) return isLinkActive(pathname, link.href);
  return link.children?.some((child) => isLinkActive(pathname, child.href)) ?? false;
}

function NavChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="nav-chevron"
      data-expanded={expanded}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
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
}

export default function EditorialHeader({
  clubName,
  clubInitials,
  crestUrl,
  storeEnabled,
}: {
  clubName: string;
  clubInitials: string;
  crestUrl: string;
  storeEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [expandedMobileLink, setExpandedMobileLink] = useState<string | null>(null);
  const rewrittenPathname = usePathname();
  // Tenant routes render at /_clubs/<slug>/... internally; strip that prefix
  // for active-link comparisons, exactly like Nav.tsx.
  const pathname = rewrittenPathname.replace(/^\/_clubs\/[^/]+/, "") || "/";

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

  useEffect(() => {
    setOpen(false);
    setExpandedMobileLink(null);
  }, [pathname]);

  const navLinks = editorialNavLinks(storeEnabled);
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
        {navLinks.map((link) => {
          const isActive = isNavItemActive(pathname, link);
          if (!link.children) {
            return (
              <Link key={link.label} href={link.href ?? "/"} data-active={isActive}>
                {link.label}
              </Link>
            );
          }
          return (
            <div key={link.label} className="nav-item-dropdown">
              <button type="button" className="nav-item-trigger" data-active={isActive}>
                {link.label}
                <NavChevron expanded={false} />
              </button>
              <div className="nav-dropdown">
                {link.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    data-active={isLinkActive(pathname, child.href)}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
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
            {navLinks.map((link, index) => {
              const isActive = isNavItemActive(pathname, link);
              const isExpanded = expandedMobileLink === link.label;
              const indexLabel = <small>0{index + 1}</small>;

              if (!link.children) {
                return (
                  <Link
                    key={link.label}
                    href={link.href ?? "/"}
                    data-active={isActive}
                    onClick={() => setOpen(false)}
                  >
                    {indexLabel}
                    {link.label}
                  </Link>
                );
              }

              return (
                <div key={link.label} className="mobile-nav-parent">
                  <button
                    type="button"
                    className="mobile-nav-trigger"
                    data-active={isActive}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedMobileLink(isExpanded ? null : link.label)}
                  >
                    {indexLabel}
                    <span>{link.label}</span>
                    <NavChevron expanded={isExpanded} />
                  </button>
                  {isExpanded && (
                    <div className="mobile-nav-children">
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          data-active={isLinkActive(pathname, child.href)}
                          onClick={() => setOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
