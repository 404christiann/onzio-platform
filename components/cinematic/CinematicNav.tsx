"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import NativeImage from "@/components/ResilientNativeImage";
import { useHomepagePiece, useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import { CINEMATIC_NAV_ITEMS } from "@/lib/cinematic-homepage-content";
import { useCinematicContent } from "./CinematicContent";
import { followNavIndicator } from "./nav-indicator";

function NavIcon({ name }: { name: "menu" | "close" | "arrow-left" | "caret-right" }) {
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href={`/icons/cinematic-navigation/sprite.svg#${name}`} /></svg>;
}

type NavItem = { id: string; label: string; href?: string; children?: Array<{ id: string; label: string; href: string }> };

function drawerDuration(style: CSSStyleDeclaration) {
  // CSS optimizers may serialize 240ms as .24s; WAAPI always expects milliseconds.
  const value = style.getPropertyValue("--drawer-duration").trim();
  const duration = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  return Number.isFinite(duration) ? duration : 240;
}

const pathOf = (href: string) => href.split("#")[0];
const section = (path: string) => path.split("/")[1] ?? "";

/** The drop-down whose page is open, so its top-level tab reads as current. A page listed in two drop-downs
 * (Know Before You Go sits under Stadium and Tickets) belongs to the one whose own landing page shares its section. */
function currentNavGroup(items: NavItem[], pathname: string): string | null {
  const groups = items.filter(item => item.children?.some(child => pathOf(child.href) === pathname));
  if (groups.length < 2) return groups[0]?.id ?? null;
  return (groups.find(group => section(pathOf(group.children![0].href)) === section(pathname)) ?? groups[0]).id;
}

export default function CinematicNav({ editing = false }: { editing?: boolean }) {
  const club = useClubContext();
  const navigationPiece = useHomepagePiece("revamp.navigation");
  const { clubLogoUrl } = useClubBranding();
  const { content } = useCinematicContent();
  const preview = useHomepagePreview();
  const pathname = usePathname().replace(/^\/_clubs\/[^/]+/, "") || "/";
  const label = (id: string, fallback: string) => content?.navigation.labels[id] || fallback;
  const childLabel = (id: string, fallback: string) => {
    const value = label(id, fallback);
    return id === "stadium" && value.trim().toLowerCase() === "robinson stadium" ? "Robinson Stadium" : value;
  };
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<string | null>(null);
  const [keyboardInput, setKeyboardInput] = useState(false);
  const keyboardInputRef = useRef(false);
  const drawerAnimation = useRef<Animation | null>(null);
  const drawerClosing = useRef(false);
  const header = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const groupHeading = useRef<HTMLHeadingElement>(null);
  const returnGroup = useRef<string | null>(null);
  const prefix = useId().replaceAll(":", "");
  const partner = content?.presentation.headerPartner;
  const foothillPartner = club.slug === "rose-city" && partner?.alt.trim().toLowerCase() === "foothill transit";
  const items: NavItem[] = CINEMATIC_NAV_ITEMS.filter(item => item.id !== "shop" || club.storeEnabled);
  const selectedGroup = items.find(item => item.id === mobileGroup);
  const isCurrent = (href?: string) => preview ? href === "/" : pathname === href;
  const currentGroup = preview ? null : currentNavGroup(items, pathname);
  const desktopNav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const placeIndicator = useRef<() => void>(() => {});

  useEffect(() => {
    if (!open) return;
    const doc = header.current?.ownerDocument;
    if (!doc) return;
    const outside = (event: MouseEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      header.current?.querySelector<HTMLButtonElement>(`button[data-nav-id="${open}"]`)?.focus();
      setOpen(null);
    };
    doc.addEventListener("click", outside);
    doc.addEventListener("keydown", escape);
    return () => { doc.removeEventListener("click", outside); doc.removeEventListener("keydown", escape); };
  }, [open]);

  useEffect(() => {
    setOpen(null);
    drawerAnimation.current?.cancel();
    drawerAnimation.current = null;
    drawerClosing.current = false;
    drawer.current?.close();
    // Next may preserve scroll when a sticky header remains in view during routing.
    const view = header.current?.ownerDocument.defaultView;
    if (previousPathname.current !== pathname && view && !view.location.hash) {
      view.scrollTo({ top: 0, behavior: "instant" });
    }
    previousPathname.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const doc = header.current?.ownerDocument;
    const view = doc?.defaultView;
    if (!doc || !view) return;
    const keyboard = () => {
      keyboardInputRef.current = true;
      setKeyboardInput(true);
      drawerAnimation.current?.finish();
    };
    const pointer = () => { keyboardInputRef.current = false; setKeyboardInput(false); };
    const breakpoint = view.matchMedia("(max-width: 1024px)");
    const resize = () => {
      setOpen(null);
      drawerAnimation.current?.cancel();
      drawerAnimation.current = null;
      drawerClosing.current = false;
      drawer.current?.close();
    };
    const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
    const finishMotion = () => { if (reducedMotion.matches) drawerAnimation.current?.finish(); };
    doc.addEventListener("keydown", keyboard, true);
    doc.addEventListener("pointerdown", pointer, true);
    breakpoint.addEventListener("change", resize);
    reducedMotion.addEventListener("change", finishMotion);
    return () => {
      doc.removeEventListener("keydown", keyboard, true);
      doc.removeEventListener("pointerdown", pointer, true);
      breakpoint.removeEventListener("change", resize);
      reducedMotion.removeEventListener("change", finishMotion);
      drawerAnimation.current?.cancel();
    };
  }, []);

  // Before this runs, the server-rendered `.active` underline stands in, so nothing shifts on hydration.
  useEffect(() => {
    if (!desktopNav.current || !indicator.current) return;
    const follower = followNavIndicator(desktopNav.current, indicator.current);
    placeIndicator.current = follower.place;
    return () => { placeIndicator.current = () => {}; follower.dispose(); };
  }, []);

  useEffect(() => { placeIndicator.current(); }, [pathname, open, currentGroup, content]);

  useEffect(() => {
    if (!mobileOpen) return;
    const doc = drawer.current?.ownerDocument;
    if (!doc) return;
    const overflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    return () => { doc.body.style.overflow = overflow; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    if (drawer.current) drawer.current.scrollTop = 0;
    if (mobileGroup) groupHeading.current?.focus({ preventScroll: true });
    else if (returnGroup.current) {
      drawer.current?.querySelector<HTMLButtonElement>(`[data-phone-group="${returnGroup.current}"]`)?.focus({ preventScroll: true });
      returnGroup.current = null;
    }
  }, [mobileOpen, mobileGroup]);

  const closePhone = (instant = false) => {
    const element = drawer.current;
    const view = element?.ownerDocument.defaultView;
    if (!element?.open || !view) return;
    if (instant || keyboardInputRef.current || !element.animate) {
      drawerAnimation.current?.cancel();
      drawerAnimation.current = null;
      drawerClosing.current = false;
      element.close();
      return;
    }
    if (drawerClosing.current) return;
    drawerClosing.current = true;
    const style = view.getComputedStyle(element);
    const from = { opacity: style.opacity, transform: style.transform };
    const reduced = view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    drawerAnimation.current?.cancel();
    const animation = element.animate([from, { opacity: "0", transform: reduced ? "none" : "translateY(-3%)" }], {
      duration: reduced ? 150 : drawerDuration(style),
      easing: style.getPropertyValue(reduced ? "--ease-out" : "--ease-drawer").trim(), fill: "forwards",
    });
    drawerAnimation.current = animation;
    animation.onfinish = () => {
      if (drawerAnimation.current !== animation) return;
      element.close();
      animation.cancel();
      drawerAnimation.current = null;
      drawerClosing.current = false;
    };
  };
  const openPhone = () => {
    setOpen(null);
    setMobileGroup(null);
    returnGroup.current = null;
    const element = drawer.current;
    if (!element) return;
    drawerAnimation.current?.cancel();
    drawerAnimation.current = null;
    drawerClosing.current = false;
    if (!element.open) element.showModal();
    setMobileOpen(true);
    const view = element.ownerDocument.defaultView;
    if (keyboardInputRef.current || !view || !element.animate) return;
    const style = view.getComputedStyle(element);
    const reduced = view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = element.animate([{ opacity: "0", transform: reduced ? "none" : "translateY(-3%)" }, { opacity: "1", transform: "none" }], {
      duration: reduced ? 150 : drawerDuration(style),
      easing: style.getPropertyValue(reduced ? "--ease-out" : "--ease-drawer").trim(),
    });
    drawerAnimation.current = animation;
    animation.onfinish = () => { if (drawerAnimation.current === animation) drawerAnimation.current = null; };
  };

  return <>
    <header {...navigationPiece} className="club-header" ref={header} data-navigation-editing={editing || undefined} data-keyboard-input={keyboardInput || undefined}>
      <Link className="crest-link" href="/" aria-label={`${club.name} home`}>{clubLogoUrl && <NativeImage src={clubLogoUrl} alt={`${club.name} crest`} />}</Link>
      <nav ref={desktopNav} className="desktop-nav" aria-label="Main navigation">
        {items.map(item => item.children?.length ? <div key={item.id} className={`nav-group${open === item.id ? " open" : ""}`} data-group={item.id}>
          <button type="button" className={`nav-item${currentGroup === item.id ? " active" : ""}`} data-nav-id={item.id} aria-expanded={open === item.id} aria-controls={`${prefix}-${item.id}`} onClick={event => {
            const button = event.currentTarget;
            const panel = button.parentElement?.querySelector<HTMLElement>(".dropdown");
            if (panel) panel.style.transformOrigin = `${button.offsetLeft + button.offsetWidth / 2 - panel.offsetLeft}px 0`;
            setOpen(current => current === item.id ? null : item.id);
          }}>
            {label(item.id, item.label)}<span className="nav-caret" aria-hidden="true" />
          </button>
          <div className="dropdown" id={`${prefix}-${item.id}`} aria-hidden={open !== item.id} inert={open !== item.id}>
            {item.children.map(child => <Link key={child.id} href={child.href} aria-current={currentGroup === item.id && child.href === pathname ? "page" : undefined} onClick={() => setOpen(null)}>{childLabel(child.id, child.label)}</Link>)}
          </div>
        </div> : <Link key={item.id} data-nav-id={item.id} className={`nav-item${isCurrent(item.href) ? " active" : ""}`} href={item.href ?? "/"} aria-current={isCurrent(item.href) ? "page" : undefined}>{label(item.id, item.label)}</Link>)}
        <span ref={indicator} className="nav-indicator" aria-hidden="true" />
      </nav>
      {partner?.url && <div className="header-partner" data-transparent-mark={foothillPartner || undefined}><NativeImage src={foothillPartner ? "/images/cinematic/foothill-going-good-places.png" : partner.url} alt={partner.alt} /></div>}
      <button ref={menuButton} type="button" className="menu-toggle" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls={`${prefix}-drawer`} onClick={openPhone}><span className="menu-word">Menu</span><NavIcon name="menu" /></button>
    </header>
    <dialog ref={drawer} id={`${prefix}-drawer`} className="mobile-drawer" aria-label={`${club.name} navigation`} data-keyboard-input={keyboardInput || undefined} onCancel={event => { event.preventDefault(); closePhone(true); }} onClose={() => {
      drawerAnimation.current?.cancel(); drawerAnimation.current = null; drawerClosing.current = false;
      setMobileOpen(false); setMobileGroup(null); menuButton.current?.focus({ preventScroll: true });
    }}>
      <header className="phone-menu-head">
        <div className="phone-brand">
          {clubLogoUrl && <NativeImage src={clubLogoUrl} alt={`${club.name} crest`} />}
          {partner?.url && <NativeImage className="phone-partner" src={foothillPartner ? "/images/cinematic/foothill-going-good-places.png" : partner.url} alt={partner.alt} />}
        </div>
        <button type="button" className="close-menu" aria-label="Close navigation" autoFocus onClick={() => closePhone()}><NavIcon name="close" /></button>
      </header>
      <div className="phone-content" id={`${prefix}-phone-content`}>
        {selectedGroup?.children ? <>
          <button type="button" className="back-menu" onClick={() => { returnGroup.current = mobileGroup; setMobileGroup(null); }}><NavIcon name="arrow-left" /><span>Back to menu</span></button>
          <h2 className="drill-heading" tabIndex={-1} ref={groupHeading}>{label(selectedGroup.id, selectedGroup.label)}</h2>
          <nav className="drill-links" aria-label={label(selectedGroup.id, selectedGroup.label)}>
            {selectedGroup.children.map(child => <Link key={child.id} href={child.href} onClick={() => closePhone(true)}><span>{childLabel(child.id, child.label)}</span><NavIcon name="caret-right" /></Link>)}
          </nav>
        </> : <>
          <div className="quick-links"><Link href="/tickets" onClick={() => closePhone(true)}>Buy Tickets</Link><Link href="/schedule" onClick={() => closePhone(true)}>{label("schedule", "Schedule")}</Link></div>
          <nav className="phone-nav" aria-label="Phone navigation">{items.map(item => item.children?.length ?
            <button type="button" key={item.id} className="drill-button" data-phone-group={item.id} aria-controls={`${prefix}-phone-content`} onClick={() => setMobileGroup(item.id)}><span>{label(item.id, item.label)}</span><NavIcon name="caret-right" /></button> :
            <Link key={item.id} href={item.href ?? "/"} aria-current={isCurrent(item.href) ? "page" : undefined} onClick={() => closePhone(true)}>{label(item.id, item.label)}</Link>)}
          </nav>
        </>}
      </div>
    </dialog>
  </>;
}
