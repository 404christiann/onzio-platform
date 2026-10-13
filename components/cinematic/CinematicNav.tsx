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

export default function CinematicNav({ editing = false }: { editing?: boolean } = {}) {
  const club = useClubContext();
  const navigationPiece = useHomepagePiece("revamp.navigation");
  const { clubLogoUrl } = useClubBranding();
  const { content } = useCinematicContent();
  const preview = useHomepagePreview();
  const pathname = usePathname().replace(/^\/_clubs\/[^/]+/, "") || "/";
  const label = (id: string, fallback: string) => content?.navigation.labels[id] || fallback;
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const prefix = useId().replaceAll(":", "");
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
    doc.addEventListener("click", outside); doc.addEventListener("keydown", escape);
    return () => { doc.removeEventListener("click", outside); doc.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => { setOpen(null); drawer.current?.close(); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const doc = drawer.current?.ownerDocument;
    if (!doc) return;
    const overflow = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
    return () => { doc.body.style.overflow = overflow; };
  }, [mobileOpen]);
  const partner = content?.presentation.headerPartner;
  const items: Array<{ id: string; label: string; href?: string; children?: Array<{ id: string; label: string; href: string }> }> = CINEMATIC_NAV_ITEMS.filter(item => item.id !== "shop" || club.storeEnabled);
  return <>
    <header {...navigationPiece} className="club-header" ref={header} data-navigation-editing={editing || undefined}>
      <Link className="crest-link" href="/" aria-label={`${club.name} home`}>{clubLogoUrl && <NativeImage src={clubLogoUrl} alt={`${club.name} crest`} />}</Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        {items.map(item => item.children?.length ? <div key={item.id} className={`nav-group${open === item.id ? " open" : ""}`} data-group={item.id}>
          <button type="button" className="nav-item" data-nav-id={item.id} aria-expanded={open === item.id} aria-controls={`${prefix}-${item.id}`} onClick={() => setOpen(open === item.id ? null : item.id)}>{label(item.id, item.label)}</button>
          <div className="dropdown" id={`${prefix}-${item.id}`} hidden={open !== item.id}>
            {item.children.map(child => <Link key={child.id} href={child.href} onClick={() => setOpen(null)}>{label(child.id, child.label)}</Link>)}
          </div>
        </div> : <Link key={item.id} className={`nav-item${!preview && pathname === item.href ? " active" : preview && item.id === "home" ? " active" : ""}`} href={item.href ?? "/"} aria-current={pathname === item.href ? "page" : undefined}>{label(item.id, item.label)}</Link>)}
      </nav>
      {partner?.url && <div className="header-partner"><NativeImage src={partner.url} alt={partner.alt} /></div>}
      <button ref={menuButton} type="button" className="menu-toggle" aria-expanded={mobileOpen} aria-controls={`${prefix}-drawer`} onClick={() => { drawer.current?.showModal(); setMobileOpen(true); }}><span>Menu</span><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.5" /></svg></button>
    </header>
    <dialog ref={drawer} id={`${prefix}-drawer`} className="mobile-drawer" onClose={() => { setMobileOpen(false); menuButton.current?.focus(); }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left) drawer.current?.close(); }}>
      <header>{clubLogoUrl && <NativeImage src={clubLogoUrl} width={52} alt={club.name} />}<button type="button" aria-label="Close navigation" onClick={() => drawer.current?.close()}>Close ×</button></header>
      <nav aria-label="Phone navigation">{items.map(item => item.children?.length ? <details key={item.id}><summary>{label(item.id, item.label)}</summary>{item.children.map(child => <Link key={child.id} href={child.href} onClick={() => drawer.current?.close()}>{label(child.id, child.label)}</Link>)}</details> : <Link key={item.id} href={item.href ?? "/"} onClick={() => drawer.current?.close()}>{label(item.id, item.label)}</Link>)}</nav>
    </dialog>
  </>;
}
