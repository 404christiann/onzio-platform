import {
  PathwayCtaRow,
  PathwaySection,
  PathwaySectionHead,
  type PathwayCta,
  type PathwayTone,
} from "@/components/pathway/PathwaySection";

/**
 * pathway.price-cards — training packages and merch kits (MLA P1 Step 5).
 *
 * Informational display only. Phase 1 has no commerce backend, so no card
 * carries a buy button, an add-to-cart control or any other checkout
 * affordance; the only action offered is the section-level enquiry link,
 * which routes to the contact form like every other pathway CTA. That
 * exclusion is the registry's stated intent for pathway.price-cards, not an
 * unfinished edge.
 *
 * `price` is a union so a package whose real figure is not yet set renders
 * an explicit TBC instead of an invented number — the same honesty rule
 * PathwaySpecList and PathwayNumberedSteps follow.
 */

export type PathwayPrice = { amount: string; period?: string } | { state: "tbc" };

export type PathwayPriceCard = {
  name: string;
  description: string;
  price: PathwayPrice;
  /** Short supporting lines, e.g. what a package includes. */
  details?: string[];
};

export type PathwayPriceCardsProps = {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  cards: PathwayPriceCard[];
  /** Enquiry link. Never a checkout — see the note above. */
  cta?: PathwayCta;
  note?: string;
  tone?: PathwayTone;
};

function isTbcPrice(price: PathwayPrice): price is { state: "tbc" } {
  return "state" in price;
}

export default function PathwayPriceCards({
  eyebrow,
  heading,
  intro,
  cards,
  cta,
  note,
  tone = "light",
}: PathwayPriceCardsProps) {
  if (cards.length === 0) return null;

  return (
    <PathwaySection tone={tone} className="pathway-price-section">
      <PathwaySectionHead eyebrow={eyebrow} heading={heading} intro={intro} />
      <ul className="pathway-price-cards">
        {cards.map((card) => (
          <li className="pathway-price-card" key={card.name}>
            <h3 className="pathway-price-name">{card.name}</h3>
            <p className="pathway-price-description">{card.description}</p>
            <div
              className="pathway-price-figure"
              data-state={isTbcPrice(card.price) ? "tbc" : "resolved"}
            >
              {isTbcPrice(card.price) ? (
                <>
                  <span className="pathway-spec-badge">TBC</span>
                  <span className="pathway-spec-tbc-text">Pricing to be confirmed</span>
                </>
              ) : (
                <>
                  <span className="pathway-price-amount">{card.price.amount}</span>
                  {card.price.period && (
                    <span className="pathway-price-period">{card.price.period}</span>
                  )}
                </>
              )}
            </div>
            {card.details && card.details.length > 0 && (
              <ul className="pathway-price-details">
                {card.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="pathway-disclaimer">{note}</p>}
      <PathwayCtaRow primary={cta} />
    </PathwaySection>
  );
}
