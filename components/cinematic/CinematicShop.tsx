"use client";

import { useEffect, useState, type CSSProperties } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import type { ShopKitContent } from "@/lib/queries";
import type { DBShopCarouselPhoto, DBShopPurchaseDetails, DBSiteSponsorLogo, ShopKitVariant } from "@/lib/db-types";
import { SHOP_EDITION_VARIANTS, isShopEditionShown, withShopDefaults, type CinematicShopPresentation, type ShopCardIcon } from "@/lib/cinematic-shop-content";
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

// Sam: kit photos loop on their own with no numbered buttons, like the homepage slideshow. They hold still
// for reduced motion, a hidden tab and the editor.
function LeadPhotos({ kit, photos, settings, editing }: { kit: ShopKitContent; photos: ShopKitContent["photos"]; settings: CinematicShopPresentation; editing: boolean }) {
  const [active, setActive] = useState(0);
  const { playing } = useCinematicMotion();
  const signature = photos.map(photo => photo.url).join("|");
  useEffect(() => { setActive(0); }, [signature]);
  useEffect(() => {
    if (editing || !playing || photos.length < 2) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % photos.length), 4500);
    return () => window.clearInterval(timer);
  }, [editing, playing, photos.length]);
  const index = Math.min(active, Math.max(0, photos.length - 1));
  return <div data-shop-editor-target="photos" className="shop-portrait" style={{ "--lead-scale": `${settings.leadScale}%`, "--lead-scale-n": settings.leadScale, "--lead-left": `${(100 - settings.leadScale) / 2}%`, "--lead-top": `${settings.leadTop}%` } as CSSProperties}>
    {photos.length ? photos.map((photo, i) => <NativeImage key={photo.id} src={photo.url} alt={i === index ? `${kit.section?.title || "Kit"} photo ${i + 1} of ${photos.length}` : ""} aria-hidden={i !== index || undefined} loading={i === index ? "eager" : "lazy"} fallbackVariant="shop" style={{ display: i === index ? "block" : "none" }} />)
      : editing ? <span className="shop-empty-slot">Add a kit photo</span> : null}
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

// Sam's Jersey Information icons. His icon folder has no video camera, so "video" uses the
// icons.download video-camera (regular/solid/round) in his red, with his white play triangle.
const VIDEO_PATH = "M17 7.00003V8.90003L22.4265 5.10145C23.0893 4.63751 24 5.11166 24 5.92069V18.2338C24 19.0111 23.152 19.4913 22.4855 19.0913L17 15.8V17C17 18.1046 16.1046 19 15 19H2C0.895431 19 0 18.1046 0 17V7.00003C0 5.89546 0.895431 5.00003 2 5.00003H15C16.1046 5.00003 17 5.89546 17 7.00003Z";
function CardIcon({ icon }: { icon: ShopCardIcon | undefined }) {
  if (!icon) return null;
  if (icon === "video") return <svg className="shop-info-icon video" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d={VIDEO_PATH} /><path fill="#fff" d="M6.4 9.2 11.6 12l-5.2 2.8z" /></svg>;
  return <NativeImage className={`shop-info-icon ${icon === "jersey" ? "shirt" : icon}`} src={`/rose-city/icons/${icon}.png`} alt="" />;
}

function RuleHeading({ id, children, side }: { id: string; children: string; side: "left" | "right" }) {
  return <div className={`shop-rule-heading ${side}`}><h2 id={id}>{children}</h2><span aria-hidden="true" /></div>;
}

function JerseyDetails({ settings, editing }: { settings: CinematicShopPresentation; editing: boolean }) {
  const tiles = settings.details;
  if (!tiles.length && !settings.detailsHeading) return editing ? <div data-shop-editor-target="details" className="shop-empty-slot shop-jersey-details-empty">Add Jersey Details tiles</div> : null;
  return <section data-shop-editor-target="details" className="shop-jersey-details" aria-labelledby="jersey-details-title">
    {settings.detailsHeading && <RuleHeading id="jersey-details-title" side="left">{settings.detailsHeading}</RuleHeading>}
    <div className="shop-detail-tiles">{tiles.map((tile, i) => <article key={i}>
      {tile.url ? <NativeImage className="shop-detail-photo" src={tile.url} alt={tile.alt} width={tile.width} height={tile.height} loading="lazy" fallbackVariant="photo" />
        : <div className="shop-photo-pending" role="img" aria-label={`${tile.title || `Detail ${i + 1}`} photo coming soon`} />}
      {tile.title && <h3>{tile.title}</h3>}{tile.body && <p>{tile.body}</p>}
    </article>)}</div>
  </section>;
}

function SizeChart({ settings, editing }: { settings: CinematicShopPresentation; editing: boolean }) {
  const chart = settings.sizeChart;
  if (!chart.columns.length || !chart.rows.length) return editing ? <div data-shop-editor-target="sizeChart" className="shop-empty-slot">Add a size chart</div> : null;
  const caption = chart.note ? `${chart.heading || "Sizes"} (${chart.note})` : chart.heading || "Sizes";
  return <section data-shop-editor-target="sizeChart" className="shop-size" aria-labelledby={chart.heading ? "size-title" : undefined} aria-label={chart.heading ? undefined : "Size chart"}>
    {chart.heading && <RuleHeading id="size-title" side="left">{chart.heading}</RuleHeading>}
    <div className="shop-size-scroll">
      <table className="shop-size-wide"><caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Size</th>{chart.columns.map((size, i) => <th key={i} scope="col">{size}</th>)}</tr></thead>
        <tbody>{chart.rows.map((row, r) => <tr key={r}><th scope="row">{row.label}</th>{row.values.map((value, i) => <td key={i}>{value}</td>)}</tr>)}</tbody>
      </table>
      {/* Phones: the same chart turned sideways so every size fits without scrolling. */}
      <table className="shop-size-narrow"><caption className="sr-only">{caption}</caption>
        <thead><tr><th scope="col">Size</th>{chart.rows.map((row, r) => <th key={r} scope="col">{row.label.replace(/\s*\(in\)$/i, "")}</th>)}</tr></thead>
        <tbody>{chart.columns.map((size, i) => <tr key={i}><th scope="row">{size}</th>{chart.rows.map((row, r) => <td key={r}>{row.values[i].replace(/ - /g, "–")}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {chart.note && <p className="shop-size-unit">{chart.note}</p>}
  </section>;
}

export default function CinematicShop({ kits, photoRows, purchase, presentation, sponsors, treatments, selectedVariant, onVariantChange, editing = false }: CinematicShopProps) {
  const [chosen, setChosen] = useState<ShopKitVariant>("home");
  const settings = withShopDefaults(presentation);
  // Jersey options: option i is the whole kit SHOP_EDITION_VARIANTS[i] (Home, Away, Third). Every option keeps its own position, so
  // hiding one never moves another's kit, colour or price. The public page offers an option only when it is switched on, its kit
  // exists and it has a label or price; editors see every option so each kit stays reachable.
  const slots = settings.editions.slice(0, SHOP_EDITION_VARIANTS.length).map((item, position) => ({ item, position, variant: SHOP_EDITION_VARIANTS[position] }));
  const hiddenVariants = slots.filter(slot => !isShopEditionShown(slot.item)).map(slot => slot.variant);
  // Every jersey the owner configured is switched off: visitors get the empty message, not a selector or a fallback kit.
  const allHidden = !editing && slots.length > 0 && hiddenVariants.length === slots.length;
  const options = slots.filter(slot => editing || (isShopEditionShown(slot.item) && Boolean(kits[slot.variant].section) && Boolean(`${slot.item.label}${slot.item.price}`.trim())));
  const requested = selectedVariant ?? chosen;
  // A choice that is not on offer (Home switched off, or the first visit before any click) falls back to the first jersey shown.
  const option = options.find(item => item.variant === requested) ?? (editing ? undefined : options[0]);
  // With no jersey options yet, the page keeps its Home/Away toggle (a switched-off kit is left out of it).
  const available = (["home", "away"] as const).filter(variant => Boolean(kits[variant].section) && (editing || !hiddenVariants.includes(variant)));
  const showVariants = !options.length && !allHidden && (available.length > 1 || editing);
  const variant: ShopKitVariant = editing ? requested : option ? option.variant : available.includes(requested as "home" | "away") ? requested : available[0] ?? "home";
  const edition = option?.item;
  const kit = kits[variant];
  // Visitors never reach a switched-off jersey's kit, whichever way the page got there.
  const kitHidden = !editing && (allHidden || hiddenVariants.includes(variant));
  const section = kitHidden ? null : kit.section;
  // The editor keeps a switched-off jersey on screen, named, so it can still be edited.
  const editedHidden = editing && edition !== undefined && !isShopEditionShown(edition);
  // Sam: until a kit has its own photos (the Foothill Transit edition for now), the site shows the Away photos.
  const borrow = !editing && variant === "third";
  const leadPhotos = kit.photos.length || !borrow ? kit.photos : kits.away.photos;
  const rows = kitHidden ? [] : (photoRows[variant].length || !borrow ? photoRows[variant] : photoRows.away);
  const choose = (value: ShopKitVariant) => { setChosen(value); onVariantChange?.(value); };
  const details = purchase && (purchase.heading || purchase.cards.length || purchase.cta_text || purchase.cta_label);
  const buyLink = edition?.link || section?.cta_link || "";
  const bullets = section?.bullet_points.filter(Boolean) ?? [];
  return <div className="shop-2027 shop-update">
    {(section || editing) ? <section className="shop-feature" aria-labelledby="shop-title">
      <LeadPhotos key={variant} kit={kit} photos={leadPhotos} settings={settings} editing={editing} />
      <div className="shop-copy">
        <div className="shop-copy-top" data-shop-editor-target="copy"><h1 id="shop-title">{section?.title || (editing ? "Add a kit title" : "")}</h1><p className="shop-eyebrow">{section?.eyebrow}</p>{edition?.line && <p className="shop-edition-line" aria-live="polite">{edition.line}</p>}<div className="shop-rule" aria-hidden="true" /></div>
        {editedHidden && <p data-shop-editor-target="editions" className="shop-hidden-label">This jersey is hidden on the website</p>}
        {showVariants && <div className="shop-variants" role="group" aria-label="Kit selection">{(editing ? ["home", "away"] as const : available).map(value => <button key={value} type="button" aria-pressed={variant === value} onClick={() => choose(value)}>{value === "home" ? settings.homeLabel || "Home" : settings.awayLabel || "Away"}</button>)}</div>}
        {options.length > 0 && <div data-shop-editor-target="editions" className="shop-jersey-options"><h2 className="shop-options-heading">{settings.editionsHeading?.trim() || "Select your jersey"}</h2><div className="shop-options" role="group" aria-label="Jersey selection">{options.map(item => {
          const off = !isShopEditionShown(item.item);
          return <button key={item.position} type="button" className={`shop-option shop-option-${item.position + 1}${off ? " shop-option-hidden" : ""}`} aria-pressed={item === option} onClick={() => choose(item.variant)}>{[item.item.label, item.item.price].filter(Boolean).join(" ").trim() || "Add a label"}{off && <span className="sr-only"> (hidden on the website)</span>}</button>;
        })}</div></div>}
        {editing && !options.length && <button type="button" data-shop-editor-target="editions" className="shop-empty-slot shop-empty-inline">Add jersey options</button>}
        <div data-shop-editor-target="copy"><p className="shop-description">{section?.description}</p>{bullets.length > 0 && <><p className="shop-includes">Includes</p><ul className="shop-bullets">{bullets.map((point, i) => <li key={i}>{point}</li>)}</ul></>}{section?.store_note && <p className="shop-store">{section.store_note}</p>}</div>
        <PurchaseLink label={section?.cta_label || (editing ? "Add a purchase button" : "")} href={buyLink} />
      </div>
    </section> : <p className="shop-empty-message">{settings.emptyMessage}</p>}
    <JerseyDetails settings={settings} editing={editing} />
    {(details || editing) && <section data-shop-editor-target="purchase" className="shop-details shop-information" aria-labelledby="details-title">
      <h2 id="details-title">{purchase?.heading || (editing ? "Add jersey details" : "")}</h2>
      <div className="shop-detail-grid">{purchase?.cards.map((card, i) => <article key={i}><p>{card.label}</p><h3>{card.title}<CardIcon icon={settings.cardIcons[i]} /></h3><div>{card.body}</div></article>)}</div>
      {settings.attributes.some(Boolean) ? <ul data-shop-editor-target="attributes" className="shop-attributes" aria-label="Jersey materials and care">{settings.attributes.filter(Boolean).map((item, i) => <li key={i}>{item}</li>)}</ul>
        : editing && <button type="button" data-shop-editor-target="attributes" className="shop-empty-slot shop-empty-inline">Add the color, material and care line</button>}
      {(purchase?.cta_eyebrow || purchase?.cta_text || purchase?.cta_label) && <div className="shop-order"><div><h3>{purchase.cta_eyebrow}</h3><p>{purchase.cta_text}</p></div><PurchaseLink label={purchase.cta_label} href={purchase.cta_link} small /></div>}
    </section>}
    {(rows.length > 0 || editing) && <section data-shop-editor-target="photoRows" className="shop-photo-row" aria-label={settings.galleryLabel || "Kit photos"}>
      {rows.length ? <div style={{ "--gallery-columns": rows.length, "--gallery-phone-columns": Math.min(3, rows.length) } as CSSProperties}>{rows.map((photo, i) => <NativeImage key={photo.id} src={photo.url} alt={`${section?.title || "Kit"}, view ${i + 1} of ${rows.length}`} loading="lazy" fallbackVariant="shop" />)}</div> : <div className="shop-empty-slot">Add photos to the player row</div>}
    </section>}
    <SizeChart settings={settings} editing={editing} />
    {(settings.mapVisible || editing) && settings.mapHeading && <div className="shop-map-view"><RuleHeading id="map-title" side="right">{settings.mapHeading}</RuleHeading></div>}
    <ShopMap settings={settings} editing={editing} />
    {(settings.sponsorsVisible || editing) && <div data-shop-editor-target="sponsors" className={!settings.sponsorsVisible ? "shop-section-hidden" : undefined}>
      <CinematicSponsors sponsors={sponsors} treatments={treatments} heading={settings.sponsorsHeading} />
      {editing && sponsors.length === 0 && <div className="shop-empty-slot">Add sponsor logos in Sponsors</div>}
      {editing && !settings.sponsorsVisible && <span className="shop-hidden-label">Sponsors are hidden on the website</span>}
    </div>}
  </div>;
}
