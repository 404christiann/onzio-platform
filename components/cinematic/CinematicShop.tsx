"use client";

import { useEffect, useState, type CSSProperties } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import type { ShopKitContent } from "@/lib/queries";
import type { DBShopCarouselPhoto, DBShopPurchaseDetails, DBSiteSponsorLogo, ShopKitVariant } from "@/lib/db-types";
import { EMPTY_CINEMATIC_SHOP_CONTENT, type CinematicShopPresentation } from "@/lib/cinematic-shop-content";
import CinematicSponsors from "./CinematicSponsors";
import { useCinematicMotion } from "./useCinematicMotion";
import "./shop.css";

export type CinematicShopProps = {
  kits: Record<ShopKitVariant, ShopKitContent>;
  photoRows: Record<ShopKitVariant, DBShopCarouselPhoto[]>;
  purchase: DBShopPurchaseDetails | null;
  presentation: CinematicShopPresentation;
  sponsors: DBSiteSponsorLogo[];
  treatments: Record<string, "invert" | "dark-lettering">;
  selectedVariant?: ShopKitVariant;
  onVariantChange?: (variant: ShopKitVariant) => void;
  editing?: boolean;
};

function PurchaseLink({ label, href, small = false }: { label: string; href: string; small?: boolean }) {
  if (!label) return null;
  const safe = /^https?:\/\//i.test(href) || /^\/(?!\/)[A-Za-z0-9_/?#=&%.\-]*$/.test(href);
  return safe ? <a data-shop-editor-target={small ? "purchase" : "cta"} className={`shop-buy${small ? " shop-buy-small" : ""}`} href={href} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only"> (opens in a new tab)</span></a>
    : <span data-shop-editor-target={small ? "purchase" : "cta"} className={`shop-buy shop-buy-unavailable${small ? " shop-buy-small" : ""}`} aria-disabled="true">{label}</span>;
}

function LeadPhotos({ kit, settings, editing }: { kit: ShopKitContent; settings: CinematicShopPresentation; editing: boolean }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const { playing } = useCinematicMotion();
  const signature = kit.photos.map(photo => photo.url).join("|");
  useEffect(() => { setActive(0); }, [signature]);
  useEffect(() => {
    if (editing || paused || !playing || kit.photos.length < 2) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % kit.photos.length), 4500);
    return () => window.clearInterval(timer);
  }, [editing, paused, playing, kit.photos.length]);
  const index = Math.min(active, Math.max(0, kit.photos.length - 1));
  return <div data-shop-editor-target="photos" className="shop-portrait" style={{ "--lead-scale": `${settings.leadScale}%`, "--lead-left": `${(100 - settings.leadScale) / 2}%`, "--lead-top": `${settings.leadTop}%` } as CSSProperties}>
    {kit.photos.length ? kit.photos.map((photo, i) => <NativeImage key={photo.id} src={photo.url} alt={i === index ? `${kit.section?.title || "Kit"} photo ${i + 1} of ${kit.photos.length}` : ""} aria-hidden={i !== index || undefined} loading={i === index ? "eager" : "lazy"} fallbackVariant="shop" style={{ display: i === index ? "block" : "none" }} />)
      : editing ? <span className="shop-empty-slot">Add a kit photo</span> : null}
    {kit.photos.length > 1 && <div className="shop-photo-controls" aria-label="Kit photographs">
      {kit.photos.map((photo, i) => <button key={photo.id} type="button" aria-label={`Show kit photo ${i + 1}`} aria-pressed={i === index} onClick={() => { setActive(i); setPaused(true); }}>{i + 1}</button>)}
      {!editing && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Play kit photos" : "Pause kit photos"}>{paused ? "Play" : "Pause"}</button>}
    </div>}
  </div>;
}

function ShopMap({ settings, editing }: { settings: CinematicShopPresentation; editing: boolean }) {
  const crop = settings.mapCrop;
  const ratio = (settings.mapWidth || 1) / (settings.mapHeight || 1);
  if (!settings.mapVisible && !editing) return null;
  if (!settings.mapUrl) return editing ? <div data-shop-editor-target="map" className="shop-empty-slot shop-empty-map">Add a map image</div> : null;
  return <section data-shop-editor-target="map" className={`shop-map${!settings.mapVisible ? " shop-section-hidden" : ""}`} aria-label={settings.mapAlt || "Map"}>
    <div className={crop ? "shop-map-frame" : "shop-map-whole"} style={crop ? { aspectRatio: `${ratio * crop.width / crop.height}` } : undefined}>
      <NativeImage src={settings.mapUrl} alt={settings.mapAlt} loading="lazy" fallbackVariant="photo" width={settings.mapWidth} height={settings.mapHeight} style={crop ? { width: `${10000 / crop.width}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` } : undefined} />
    </div>
    {editing && !settings.mapVisible && <span className="shop-hidden-label">Map is hidden on the website</span>}
  </section>;
}

export default function CinematicShop({ kits, photoRows, purchase, presentation, sponsors, treatments, selectedVariant, onVariantChange, editing = false }: CinematicShopProps) {
  const [chosen, setChosen] = useState<ShopKitVariant>("home");
  const settings = { ...EMPTY_CINEMATIC_SHOP_CONTENT, ...presentation };
  const available = (["home", "away"] as const).filter(variant => Boolean(kits[variant].section));
  const requested = selectedVariant ?? chosen;
  const variant = editing ? requested : available.includes(requested as "home" | "away") ? requested : available[0] ?? "home";
  const kit = kits[variant];
  const section = kit.section;
  const rows = photoRows[variant];
  const choose = (value: ShopKitVariant) => { setChosen(value); onVariantChange?.(value); };
  const details = purchase && (purchase.heading || purchase.cards.length || purchase.cta_text || purchase.cta_label);
  return <div className="shop-2027">
    {(section || editing) ? <section className="shop-feature" aria-labelledby="shop-title">
      <LeadPhotos key={variant} kit={kit} settings={settings} editing={editing} />
      <div className="shop-copy">
        <div data-shop-editor-target="copy"><p className="shop-eyebrow">{section?.eyebrow}</p><h1 id="shop-title">{section?.title || (editing ? "Add a kit title" : "")}</h1><div className="shop-rule" aria-hidden="true" /></div>
        {(available.length > 1 || editing) && <div className="shop-variants" role="group" aria-label="Kit selection">{(editing ? ["home", "away"] as const : available).map(value => <button key={value} type="button" aria-pressed={variant === value} onClick={() => choose(value)}>{value === "home" ? settings.homeLabel || "Home" : settings.awayLabel || "Away"}</button>)}</div>}
        <div data-shop-editor-target="copy"><p className="shop-description">{section?.description}</p><ul className="shop-bullets">{section?.bullet_points.map((point, i) => <li key={i}>{point}</li>)}</ul><p className="shop-store">{section?.store_note}</p></div>
        <PurchaseLink label={section?.cta_label || (editing ? "Add a purchase button" : "")} href={section?.cta_link || ""} />
      </div>
    </section> : <p className="shop-empty-message">{settings.emptyMessage}</p>}
    {(rows.length > 0 || editing) && <section data-shop-editor-target="photoRows" className="shop-photo-row" aria-label={settings.galleryLabel || "Kit photos"}>
      {rows.length ? <div style={{ "--gallery-columns": rows.length, "--gallery-phone-columns": Math.min(3, rows.length) } as CSSProperties}>{rows.map((photo, i) => <NativeImage key={photo.id} src={photo.url} alt={`${section?.title || "Kit"}, view ${i + 1} of ${rows.length}`} loading="lazy" fallbackVariant="shop" />)}</div> : <div className="shop-empty-slot">Add photos to the player row</div>}
    </section>}
    {(details || editing) && <section data-shop-editor-target="purchase" className="shop-details" aria-labelledby="details-title">
      <div className="shop-details-heading"><h2 id="details-title">{purchase?.heading || (editing ? "Add jersey details" : "")}</h2><span aria-hidden="true" /></div>
      <div className="shop-detail-grid">{purchase?.cards.map((card, i) => <article key={i}><p>{card.label}</p><h3>{card.title}</h3><div>{card.body}</div></article>)}</div>
      {(purchase?.cta_eyebrow || purchase?.cta_text || purchase?.cta_label) && <div className="shop-order"><div><h3>{purchase.cta_eyebrow}</h3><p>{purchase.cta_text}</p></div><PurchaseLink label={purchase.cta_label} href={purchase.cta_link} small /></div>}
    </section>}
    <ShopMap settings={settings} editing={editing} />
    {(settings.sponsorsVisible || editing) && <div data-shop-editor-target="sponsors" className={!settings.sponsorsVisible ? "shop-section-hidden" : undefined}>
      <CinematicSponsors sponsors={sponsors} treatments={treatments} heading={settings.sponsorsHeading} />
      {editing && sponsors.length === 0 && <div className="shop-empty-slot">Add sponsor logos in Sponsors</div>}
      {editing && !settings.sponsorsVisible && <span className="shop-hidden-label">Sponsors are hidden on the website</span>}
    </div>}
  </div>;
}
