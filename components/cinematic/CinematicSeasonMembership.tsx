import { isTicketPartShown, type TicketPageView } from "@/lib/cinematic-ticket-pages-content";
import { TicketArt, TicketButton, TicketPageHeading, TicketTiles } from "./CinematicTicketPageParts";

/** Sam's Season Ticket Membership page (2027 Final Master), opened from the Tickets menu. */
export default function CinematicSeasonMembership({ content, placeholders = false }: { content: TicketPageView<"season-membership">; placeholders?: boolean }) {
  const { intro, pricing, button, benefits, closing, images } = content;
  const showButton = isTicketPartShown(button);
  const column = (label: string) => label.endsWith("*") ? <>{label.slice(0, -1)}<span className="tp-star">*</span></> : label;
  return <div className="tp-page tp-season">
    {isTicketPartShown(content.heading) && <TicketPageHeading title={content.heading.title} subtitle={content.heading.subtitle} />}
    {isTicketPartShown(intro) && (intro.text.trim() || intro.highlights.length > 0 || intro.includes.length > 0) && <section className="tp-section tp-copy" aria-label="About the membership">
      {intro.text.trim() && <p>{intro.text}</p>}
      {intro.highlights.length > 0 && <ul className="tp-bullets">{intro.highlights.map((item, index) => <li key={index}>{item}</li>)}</ul>}
      {intro.includes.length > 0 && <>
        {intro.includesHeading.trim() && <h2 className="tp-includes">{intro.includesHeading}</h2>}
        <ul className="tp-bullets">{intro.includes.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </>}
    </section>}
    {pricing.visible && pricing.rows.length > 0 && <section className="tp-section tp-pricing" aria-label="Season ticket prices">
      <table>
        <thead><tr><th scope="col" className="tp-section-label">{pricing.sectionLabel}</th>{pricing.columns.map((label, index) => <th scope="col" key={index}>{column(label)}</th>)}</tr></thead>
        <tbody>{pricing.rows.map(row => <tr key={row.id}>
          <th scope="row"><span className="tp-seat"><TicketArt image={images[row.id]} label={`Badge for ${row.name || "this section"}`} className="tp-badge" placeholders={placeholders} /><span>{row.name}</span></span></th>
          {row.prices.map((price, index) => <td key={index} className={`tp-price tp-price-${index}`} data-label={pricing.columns[index].replace(/\*$/, "")}>{price}</td>)}
        </tr>)}</tbody>
      </table>
      {pricing.footnote.trim() && <p className="tp-footnote">{pricing.footnote}</p>}
      {showButton && <TicketButton label={button.label} href={button.href} />}
    </section>}
    {benefits.visible && benefits.items.length > 0 && <section className="tp-band tp-benefits" aria-labelledby="tp-benefits-title">
      <h2 id="tp-benefits-title">{benefits.heading}</h2>
      <TicketTiles items={benefits.items} images={images} className="tp-benefit-tiles" placeholders={placeholders} />
    </section>}
    {closing.visible && <section className="tp-band tp-closing" aria-label={closing.heading || "Become a member"}>
      {closing.heading.trim() && <h2>{closing.heading}</h2>}
      {showButton && <TicketButton label={button.label} href={button.href} />}
      <TicketArt image={images.ticket} label="Ticket graphic" className="tp-ticket" placeholders={placeholders} />
    </section>}
  </div>;
}
