import { Fragment } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import type { TicketPageImage } from "@/lib/cinematic-ticket-pages-content";
import "./ticket-pages.css";

/**
 * An uploaded image, or nothing on the public page. The editor preview (`placeholders`) shows a labelled
 * dashed box instead, so the owner can see which slot still waits for a file (RC2027-TICKET-PAGES).
 */
export function TicketArt({ image, label, className, placeholders }: { image: TicketPageImage | undefined; label: string; className: string; placeholders?: boolean }) {
  if (image?.url) return <NativeImage className={className} src={image.url} alt={image.alt} width={image.width ?? undefined} height={image.height ?? undefined} loading="lazy" />;
  if (!placeholders) return null;
  return <span className={`${className} tp-slot`} role="img" aria-label={`Waiting for image: ${label}`}><small>Waiting for image</small>{label}</span>;
}

/** `**bold**` is the only markup an owner can use in a paragraph. */
export function TicketRichText({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.length > 4 && part.startsWith("**") && part.endsWith("**")
    ? <b key={index}>{part.slice(2, -2)}</b> : <Fragment key={index}>{part}</Fragment>)}</>;
}

/** `visuallyHidden` keeps the page's only h1 for screen readers and search engines while the banner is switched off. */
export function TicketPageHeading({ title, subtitle, visuallyHidden = false }: { title: string; subtitle: string; visuallyHidden?: boolean }) {
  if (visuallyHidden) return <h1 className="sr-only">{title}</h1>;
  return <header className="tp-heading"><div><h1>{title}</h1>{subtitle.trim() && <p>{subtitle}</p>}</div></header>;
}

/** A link once the owner adds one; until then the button shows but does nothing, as in the approved preview. */
export function TicketButton({ label, href }: { label: string; href: string }) {
  if (!label.trim()) return null;
  return href ? <a className="tp-buy" href={href}>{label}</a> : <span className="tp-buy" aria-disabled="true">{label}</span>;
}

export function TicketTiles({ items, images, className, placeholders }: { items: { id: string; label: string }[]; images: Record<string, TicketPageImage>; className: string; placeholders?: boolean }) {
  return <ul className={`tp-tiles ${className}`}>{items.map(item => {
    const art = <TicketArt image={images[item.id]} label={item.label || "Tile"} className="tp-tile-img" placeholders={placeholders} />;
    return <li className="tp-tile" key={item.id}>{(images[item.id]?.url || placeholders) && <div className="tp-tile-art">{art}</div>}<p>{item.label}</p></li>;
  })}</ul>;
}
