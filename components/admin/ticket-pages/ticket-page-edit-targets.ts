import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { KnowBeforeYouGoContent, SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import type { KbygSectionId, SeasonSectionId } from "./ticket-page-sections";

/**
 * Click-to-field for the Season Ticket Membership and Know Before You Go editors (UI-PREVIEW-CLICK-VISITOR-3). The ids are
 * declared in EDIT_TARGET_REGISTRY ("seasonMembership", "knowBeforeYouGo"); the dialog controls carry them, and the
 * *PreviewStamps put the same ids on the public nodes inside a card's preview only (never on the public page).
 *
 * Both pages render in `div.only[data-only=<card>]` with the draft's other parts switched off, so a card's markup holds its
 * own section; the few nodes that remain but are hidden by ticket-editors.module.css (the Know Before You Go banner on every
 * card but the heading card, the Buy-button card's closing heading and ticket picture) are never stamped. Rows with a stable id
 * (price rows, benefits, match-day tiles) are keyed by it, so a reorder moves the id with the row.
 *
 * Left unstamped on purpose: the match box's fixture, date, venue, crests and competition line (Schedule's, and the
 * competition line is Schedule's whenever the match has one), the next-match fallback message (Homepage's), and the donor name
 * (the editor preview always draws the donor logo's slot in its place). The two links (Buy button, watch line, donor button)
 * are the same node as the words that carry them, so a click there focuses the words; the link's control is stamped but has no node of its own.
 */
export const SEASON_TARGETS = {
  headingTitle: editTarget("seasonMembership", "heading", "title"),
  headingSubtitle: editTarget("seasonMembership", "heading", "subtitle"),
  introText: editTarget("seasonMembership", "intro", "text"),
  introIncludesHeading: editTarget("seasonMembership", "intro", "includesHeading"),
  pricingSectionLabel: editTarget("seasonMembership", "pricing", "sectionLabel"),
  pricingFootnote: editTarget("seasonMembership", "pricing", "footnote"),
  buttonLabel: editTarget("seasonMembership", "button", "label"),
  buttonHref: editTarget("seasonMembership", "button", "href"),
  benefitsHeading: editTarget("seasonMembership", "benefits", "heading"),
  closingHeading: editTarget("seasonMembership", "closing", "heading"),
  closingTicketImageAlt: editTarget("seasonMembership", "closing", "ticketImageAlt"),
} as const;

/** The intro's two lists and the price columns have no id, so they are keyed by position. */
export const seasonHighlightTarget = (index: number): EditTargetId => editTarget("seasonMembership", "intro", "highlight", index);
export const seasonIncludeTarget = (index: number): EditTargetId => editTarget("seasonMembership", "intro", "include", index);
export const seasonColumnTarget = (index: number): EditTargetId => editTarget("seasonMembership", "pricing", "column", index);
/** Price rows and benefits are keyed by their stable id. */
export const seasonPriceNameTarget = (rowId: string): EditTargetId => editTarget("seasonMembership", "pricing", "name", rowId);
export const seasonPriceTarget = (rowId: string, column: number): EditTargetId => editTarget("seasonMembership", "pricing", `price${column}`, rowId);
export const seasonBadgeAltTarget = (rowId: string): EditTargetId => editTarget("seasonMembership", "pricing", "badgeAlt", rowId);
export const seasonBenefitLabelTarget = (itemId: string): EditTargetId => editTarget("seasonMembership", "benefits", "label", itemId);
export const seasonBenefitIconAltTarget = (itemId: string): EditTargetId => editTarget("seasonMembership", "benefits", "iconAlt", itemId);

export const KBYG_TARGETS = {
  headingTitle: editTarget("knowBeforeYouGo", "heading", "title"),
  headingSubtitle: editTarget("knowBeforeYouGo", "heading", "subtitle"),
  matchCompetition: editTarget("knowBeforeYouGo", "match", "competition"),
  matchWatchLabel: editTarget("knowBeforeYouGo", "match", "watchLabel"),
  matchWatchHref: editTarget("knowBeforeYouGo", "match", "watchHref"),
  matchYoutubeImageAlt: editTarget("knowBeforeYouGo", "match", "youtubeImageAlt"),
  raffleHeading: editTarget("knowBeforeYouGo", "raffle", "heading"),
  raffleSubheading: editTarget("knowBeforeYouGo", "raffle", "subheading"),
  raffleImageAlt: editTarget("knowBeforeYouGo", "raffle", "imageAlt"),
  raffleBody: editTarget("knowBeforeYouGo", "raffle", "body"),
  donorHeading: editTarget("knowBeforeYouGo", "donor", "heading"),
  donorName: editTarget("knowBeforeYouGo", "donor", "name"),
  donorImageAlt: editTarget("knowBeforeYouGo", "donor", "imageAlt"),
  donorBody: editTarget("knowBeforeYouGo", "donor", "body"),
  donorButtonLabel: editTarget("knowBeforeYouGo", "donor", "buttonLabel"),
  donorButtonHref: editTarget("knowBeforeYouGo", "donor", "buttonHref"),
} as const;
/** Match-day tiles are keyed by their stable id. */
export const kbygTileLabelTarget = (tileId: string): EditTargetId => editTarget("knowBeforeYouGo", "facts", "label", tileId);
export const kbygTileIconAltTarget = (tileId: string): EditTargetId => editTarget("knowBeforeYouGo", "facts", "iconAlt", tileId);

const fixed = (id: EditTargetId) => () => id;
/** Position of a node among its siblings. */
const indexIn = (node: Element | null | undefined) => node?.parentElement ? Array.from(node.parentElement.children).indexOf(node) : -1;
/** The item (price row, benefit, tile) a node sits in, found from its own `<tr>` / `<li>`, so a row without a picture never shifts the others. */
const itemAt = <T extends { id: string }>(items: readonly T[], node: Element | null | undefined): T | undefined => items[indexIn(node)];

/** Where each field of one Season Ticket Membership card shows on the public page, as rendered by components/cinematic/CinematicSeasonMembership. */
export function seasonPreviewStamps(content: SeasonMembershipContent, section: SeasonSectionId): EditTargetStamp[] {
  switch (section) {
    case "heading": return [
      { selector: ".tp-heading > div > h1", target: fixed(SEASON_TARGETS.headingTitle) },
      { selector: ".tp-heading > div > p", target: fixed(SEASON_TARGETS.headingSubtitle) },
    ];
    case "intro": {
      // The page draws the highlights list, then the included list, each only when it has items: a list's position says which it is.
      const lists = [...(content.intro.highlights.length ? ["highlight" as const] : []), ...(content.intro.includes.length ? ["include" as const] : [])];
      const item = (li: Element) => {
        const list = li.parentElement, kind = list?.parentElement ? lists[Array.from(list.parentElement.children).filter(child => child.matches("ul.tp-bullets")).indexOf(list)] : undefined;
        const index = indexIn(li);
        if (kind === "highlight") return index < content.intro.highlights.length ? seasonHighlightTarget(index) : null;
        return kind === "include" && index < content.intro.includes.length ? seasonIncludeTarget(index) : null;
      };
      return [
        { selector: ".tp-copy > p", target: fixed(SEASON_TARGETS.introText) },
        { selector: ".tp-copy > h2.tp-includes", target: fixed(SEASON_TARGETS.introIncludesHeading) },
        { selector: ".tp-copy > ul.tp-bullets > li", target: item },
      ];
    }
    case "pricing": {
      const row = (node: Element | null | undefined) => itemAt(content.pricing.rows, node?.closest("tr"));
      return [
        { selector: ".tp-pricing thead th.tp-section-label", target: fixed(SEASON_TARGETS.pricingSectionLabel) },
        { selector: ".tp-pricing thead th:not(.tp-section-label)", target: (_, index) => index < content.pricing.columns.length ? seasonColumnTarget(index) : null },
        { selector: ".tp-pricing tbody .tp-seat > span:not(.tp-badge)", target: element => { const found = row(element); return found ? seasonPriceNameTarget(found.id) : null; } },
        { selector: ".tp-pricing tbody .tp-seat > img.tp-badge", target: element => { const found = row(element); return found ? seasonBadgeAltTarget(found.id) : null; } },
        // The first cell of a row is its heading cell, so a price cell's column is its position minus one.
        { selector: ".tp-pricing tbody td.tp-price", target: element => { const found = row(element), column = indexIn(element) - 1; return found && column >= 0 && column < 3 ? seasonPriceTarget(found.id, column) : null; } },
        { selector: ".tp-pricing > p.tp-footnote", target: fixed(SEASON_TARGETS.pricingFootnote) },
      ];
    }
    // The card keeps the closing section's markup but its CSS hides everything except the Buy button.
    case "button": return [{ selector: ".tp-closing > .tp-buy", target: fixed(SEASON_TARGETS.buttonLabel) }];
    case "benefits": return [
      { selector: ".tp-benefits > h2", target: fixed(SEASON_TARGETS.benefitsHeading) },
      { selector: ".tp-benefit-tiles > li.tp-tile > p", target: element => { const found = itemAt(content.benefits.items, element.parentElement); return found ? seasonBenefitLabelTarget(found.id) : null; } },
      { selector: ".tp-benefit-tiles > li.tp-tile > .tp-tile-art > img.tp-tile-img", target: element => { const found = itemAt(content.benefits.items, element.parentElement?.parentElement); return found ? seasonBenefitIconAltTarget(found.id) : null; } },
    ];
    case "closing": return [
      { selector: ".tp-closing > h2", target: fixed(SEASON_TARGETS.closingHeading) },
      { selector: ".tp-closing > img.tp-ticket", target: fixed(SEASON_TARGETS.closingTicketImageAlt) },
    ];
  }
}

/** Where each field of one Know Before You Go card shows on the public page, as rendered by components/cinematic/CinematicKnowBeforeYouGo. */
export function kbygPreviewStamps(content: KnowBeforeYouGoContent, section: KbygSectionId): EditTargetStamp[] {
  switch (section) {
    // Every other card hides this banner with CSS (ticket-editors.module.css), so only the heading card stamps it.
    case "heading": return [
      { selector: ".tp-heading > div > h1", target: fixed(KBYG_TARGETS.headingTitle) },
      { selector: ".tp-heading > div > p", target: fixed(KBYG_TARGETS.headingSubtitle) },
    ];
    // The date, venue, teams and crests are Schedule's, and so is the competition line when the match has one.
    case "match": return [
      { selector: ".tp-match > .tp-watch", target: fixed(KBYG_TARGETS.matchWatchLabel) },
      { selector: ".tp-match > .tp-watch > img.tp-youtube", target: fixed(KBYG_TARGETS.matchYoutubeImageAlt) },
    ];
    case "facts": return [
      { selector: ".tp-fact-tiles > li.tp-tile > p", target: element => { const found = itemAt(content.facts.tiles, element.parentElement); return found ? kbygTileLabelTarget(found.id) : null; } },
      { selector: ".tp-fact-tiles > li.tp-tile > .tp-tile-art > img.tp-tile-img", target: element => { const found = itemAt(content.facts.tiles, element.parentElement?.parentElement); return found ? kbygTileIconAltTarget(found.id) : null; } },
    ];
    case "raffle": return [
      { selector: ".tp-raffle > h2", target: fixed(KBYG_TARGETS.raffleHeading) },
      { selector: ".tp-raffle > p.tp-raffle-sub", target: fixed(KBYG_TARGETS.raffleSubheading) },
      { selector: ".tp-raffle > img.tp-raffle-photo", target: fixed(KBYG_TARGETS.raffleImageAlt) },
      { selector: ".tp-raffle > p.tp-raffle-body", target: fixed(KBYG_TARGETS.raffleBody) },
    ];
    case "donor": return [
      { selector: ".tp-donor > h2", target: fixed(KBYG_TARGETS.donorHeading) },
      { selector: ".tp-donor > img.tp-donor-logo", target: fixed(KBYG_TARGETS.donorImageAlt) },
      { selector: ".tp-donor > p.tp-donor-body", target: fixed(KBYG_TARGETS.donorBody) },
      { selector: ".tp-donor > .tp-buy", target: fixed(KBYG_TARGETS.donorButtonLabel) },
    ];
  }
}
