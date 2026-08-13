"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "@/components/ResilientImage";
import {
  EditorialDialogBackdrop,
  EditorialDialogClose,
  EditorialDialogPopup,
  EditorialDialogPortal,
  EditorialDialogRoot,
  EditorialDialogTitle,
  EditorialDialogTrigger,
} from "@/components/ui/editorial/dialog";
import { imageDeliveryProps } from "@/lib/image-delivery";
import { cn } from "@/lib/utils";

type NavLink = {
  label: string;
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
  if (storeEnabled) links.push({ label: "Store", href: "/shop" });
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
      className={cn("size-2.5 transition-transform", expanded && "rotate-180")}
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
  const portalRef = useRef<HTMLDivElement | null>(null);
  const rewrittenPathname = usePathname();
  const pathname = rewrittenPathname.replace(/^\/_clubs\/[^/]+/, "") || "/";

  useLayoutEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > (pathname === "/" ? 0 : 24));
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
    setExpandedMobileLink(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeForDesktop = () => {
      if (window.innerWidth > 1050) setOpen(false);
    };
    window.addEventListener("resize", closeForDesktop);
    return () => window.removeEventListener("resize", closeForDesktop);
  }, [open]);

  const navLinks = editorialNavLinks(storeEnabled);
  const isHome = pathname === "/";
  const brandVisible = !isHome || scrolled;

  return (
    <header
      className={cn(
        "site-header fixed inset-x-0 top-0 z-50 px-5 py-4 transition-[background,color,box-shadow] duration-300 md:px-8",
        isHome && !scrolled
          ? "bg-transparent text-ed-on-dark"
          : "bg-ed-paper/95 text-ed-ink shadow-[0_10px_40px_rgba(16,16,16,0.08)] backdrop-blur-xl",
      )}
      data-home={isHome}
      data-scrolled={scrolled}
      data-brand-visible={brandVisible}
    >
      <div className="mx-auto grid max-w-[1180px] grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link
          className={cn(
            "brand-lockup flex items-center gap-3 transition-opacity duration-300",
            brandVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          href="/"
          aria-label={`${clubName} home`}
          onClick={() => setOpen(false)}
        >
          {crestUrl ? (
            <Image
              className="size-12 object-contain"
              src={crestUrl}
              alt=""
              width={108}
              height={107}
              priority
              {...imageDeliveryProps("club-logo")}
            />
          ) : (
            <span className="brand-initials inline-flex size-12 items-center justify-center rounded-full bg-ed-primary text-xs font-black text-ed-on-dark">
              {clubInitials}
            </span>
          )}
        </Link>

        <nav
          className="desktop-nav hidden items-center justify-center gap-1 justify-self-center min-[1051px]:flex"
          aria-label="Main navigation"
        >
          {navLinks.map((link) => {
            const isActive = isNavItemActive(pathname, link);
            if (!link.children) {
              return (
                <Link
                  key={link.label}
                  href={link.href ?? "/"}
                  data-active={isActive}
                  className="px-4 py-3 font-display text-[0.72rem] font-black uppercase tracking-[0.18em] text-current/75 transition-colors hover:text-current data-[active=true]:text-ed-accent"
                >
                  {link.label}
                </Link>
              );
            }
            return (
              <div key={link.label} className="nav-item-dropdown group relative">
                <button
                  type="button"
                  className="nav-item-trigger flex items-center gap-2 px-4 py-3 font-display text-[0.72rem] font-black uppercase tracking-[0.18em] text-current/75 transition-colors hover:text-current data-[active=true]:text-ed-accent"
                  data-active={isActive}
                >
                  {link.label}
                  <NavChevron expanded={false} />
                </button>
                <div className="nav-dropdown invisible absolute left-1/2 top-full grid min-w-44 -translate-x-1/2 gap-1 border border-[color:var(--ed-line)] bg-ed-paper p-2 text-ed-ink opacity-0 shadow-[0_18px_60px_rgba(16,16,16,0.16)] transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {link.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      data-active={isLinkActive(pathname, child.href)}
                      className="px-4 py-3 font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted transition hover:bg-ed-ink-ghost hover:text-ed-ink data-[active=true]:text-ed-accent"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="header-actions justify-self-end">
          <EditorialDialogRoot open={open} onOpenChange={setOpen}>
            <EditorialDialogTrigger
              className="menu-button grid size-12 place-items-center border border-current/25 bg-transparent text-current transition hover:border-ed-accent hover:text-ed-accent min-[1051px]:hidden"
              aria-label={open ? "Close navigation" : "Open navigation"}
            >
              <span className="grid gap-1.5" aria-hidden>
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            </EditorialDialogTrigger>

            <EditorialDialogPortal container={portalRef.current}>
              <EditorialDialogBackdrop className="min-[1051px]:hidden" />
              <EditorialDialogPopup id="mobile-navigation" className="mobile-menu min-[1051px]:hidden">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <EditorialDialogTitle className="font-display text-sm font-black uppercase tracking-[0.2em] text-ed-accent">
                    Menu
                  </EditorialDialogTitle>
                  <EditorialDialogClose className="grid size-11 place-items-center border border-[color:var(--ed-line)] text-ed-ink transition hover:border-ed-accent hover:text-ed-accent">
                    <span className="sr-only">Close navigation</span>
                    <span aria-hidden className="text-2xl leading-none">
                      x
                    </span>
                  </EditorialDialogClose>
                </div>

                <div className="grid gap-2">
                  {navLinks.map((link, index) => {
                    const isActive = isNavItemActive(pathname, link);
                    const isExpanded = expandedMobileLink === link.label;
                    const indexLabel = (
                      <small className="font-display text-xs font-black text-ed-accent">
                        0{index + 1}
                      </small>
                    );

                    if (!link.children) {
                      return (
                        <Link
                          key={link.label}
                          href={link.href ?? "/"}
                          data-active={isActive}
                          onClick={() => setOpen(false)}
                          className="grid grid-cols-[3rem_1fr] items-center border-t border-[color:var(--ed-line)] py-5 font-display text-3xl font-black uppercase leading-none data-[active=true]:text-ed-accent"
                        >
                          {indexLabel}
                          {link.label}
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={link.label}
                        className="mobile-nav-parent border-t border-[color:var(--ed-line)]"
                      >
                        <button
                          type="button"
                          className="mobile-nav-trigger grid w-full grid-cols-[3rem_1fr_auto] items-center py-5 text-left font-display text-3xl font-black uppercase leading-none data-[active=true]:text-ed-accent"
                          data-active={isActive}
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedMobileLink(isExpanded ? null : link.label)}
                        >
                          {indexLabel}
                          <span>{link.label}</span>
                          <NavChevron expanded={isExpanded} />
                        </button>
                        {isExpanded && (
                          <div className="mobile-nav-children mb-4 ml-12 grid gap-2 border-l border-[color:var(--ed-line)] pl-5">
                            {link.children.map((child) => (
                              <Link
                                key={child.href}
                                href={child.href}
                                data-active={isLinkActive(pathname, child.href)}
                                onClick={() => setOpen(false)}
                                className="py-2 font-display text-sm font-black uppercase tracking-[0.16em] text-ed-muted data-[active=true]:text-ed-accent"
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
              </EditorialDialogPopup>
            </EditorialDialogPortal>
          </EditorialDialogRoot>
        </div>
      </div>
      <div ref={portalRef} />
    </header>
  );
}
