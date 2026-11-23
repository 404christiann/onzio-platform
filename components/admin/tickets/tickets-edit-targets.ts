import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { TicketsContent } from "@/lib/tickets-content";
import type { TicketsSectionId } from "./tickets-sections";

/**
 * Click-to-field for the Tickets editor (UI-PREVIEW-CLICK-VISITOR-2). The ids are declared in EDIT_TARGET_REGISTRY
 * ("tickets"); TicketsSectionFields stamps them on the dialog controls, and ticketsPreviewStamps puts the same ids on the
 * public nodes inside a card's preview only (never on the public page).
 *
 * Every card renders the whole public page and hides the other sections with CSS (ticket-editors.module.css `.only`), so the
 * markup of the sections it hides is still in the DOM. Each card's stamps are therefore scoped to that card's own section
 * (`.tickets-includes >`, `.tickets-perks >` and so on) and never reach a hidden node. The prices and the next-match heading
 * and button text come from Homepage and the fixture from Schedule, so they carry no id. The perk pictures are drawn with an
 * empty description on the page, so they carry none either.
 */
export const TICKETS_TARGETS = {
  pageTitle: editTarget("tickets", "page", "title"),
  pageSubtitle: editTarget("tickets", "page", "subtitle"),
  pagePurchaseUrl: editTarget("tickets", "page", "purchaseUrl"),
  pageMissingPurchaseLabel: editTarget("tickets", "page", "missingPurchaseLabel"),
  pageBannerImageAlt: editTarget("tickets", "page", "bannerImageAlt"),
  pagePartnerImageAlt: editTarget("tickets", "page", "partnerImageAlt"),
  perksHeading: editTarget("tickets", "perks", "heading"),
  includesHeading: editTarget("tickets", "includes", "heading"),
  includesFootnote: editTarget("tickets", "includes", "footnote"),
  transitHeading: editTarget("tickets", "transit", "heading"),
  transitSubtitle: editTarget("tickets", "transit", "subtitle"),
  transitBusImageAlt: editTarget("tickets", "transit", "busImageAlt"),
  transitMapImageAlt: editTarget("tickets", "transit", "mapImageAlt"),
  directionsHeading: editTarget("tickets", "directions", "directionsHeading"),
  directionsBody: editTarget("tickets", "directions", "directionsBody"),
  directionsParkingHeading: editTarget("tickets", "directions", "parkingHeading"),
  directionsParkingBody: editTarget("tickets", "directions", "parkingBody"),
  directionsParkingNote: editTarget("tickets", "directions", "parkingNote"),
} as const;

/** Perks and benefits have no id of their own, so they are keyed by their position. */
export const perkLabelTarget = (index: number): EditTargetId => editTarget("tickets", "perks", "label", index);
export const benefitTitleTarget = (index: number): EditTargetId => editTarget("tickets", "includes", "title", index);
export const benefitDetailTarget = (index: number): EditTargetId => editTarget("tickets", "includes", "detail", index);

const fixed = (id: EditTargetId) => () => id;

/**
 * The two blocks CinematicTickets renders under `.tickets-directions`, in order: Directions only when it has a heading or
 * text, Parking only when it has a heading, text or footnote. A block's position among the section's divs says which it is.
 */
export function directionsBlocks(content: TicketsContent): ("directions" | "parking")[] {
  const blocks: ("directions" | "parking")[] = [];
  if (content.directionsHeading || content.directionsBody) blocks.push("directions");
  if (content.parkingHeading || content.parkingBody || content.parkingNote) blocks.push("parking");
  return blocks;
}

function directionsStamps(content: TicketsContent): EditTargetStamp[] {
  const blocks = directionsBlocks(content);
  const blockOf = (div: Element | null | undefined) => div?.parentElement ? blocks[Array.from(div.parentElement.children).indexOf(div)] : undefined;
  return [
    { selector: ".tickets-directions > div > h3", target: element => { const block = blockOf(element.parentElement); return block ? (block === "directions" ? TICKETS_TARGETS.directionsHeading : TICKETS_TARGETS.directionsParkingHeading) : null; } },
    { selector: ".tickets-directions > div > p:not(.parking-note)", target: element => { const block = blockOf(element.parentElement); return block ? (block === "directions" ? TICKETS_TARGETS.directionsBody : TICKETS_TARGETS.directionsParkingBody) : null; } },
    { selector: ".tickets-directions > div > p.parking-note > em", target: element => blockOf(element.parentElement?.parentElement) === "parking" ? TICKETS_TARGETS.directionsParkingNote : null },
  ];
}

/** Where each field of one card shows on the public page, as rendered by components/cinematic/CinematicTickets. */
export function ticketsPreviewStamps(content: TicketsContent, section: TicketsSectionId): EditTargetStamp[] {
  switch (section) {
    // The Buy button's words are Homepage's, but where it goes is the purchase link, so the button is the link's node.
    case "page": return [
      { selector: ".tickets-title > h1", target: fixed(TICKETS_TARGETS.pageTitle) },
      { selector: ".tickets-title > p", target: fixed(TICKETS_TARGETS.pageSubtitle) },
      { selector: ".ticket-banner > img", target: fixed(TICKETS_TARGETS.pageBannerImageAlt) },
      { selector: ".tickets-match > .tickets-buy", target: fixed(TICKETS_TARGETS.pagePurchaseUrl) },
      { selector: ".tickets-match > p.purchase-note", target: fixed(TICKETS_TARGETS.pageMissingPurchaseLabel) },
      { selector: ".tickets-match > img.tickets-chick", target: fixed(TICKETS_TARGETS.pagePartnerImageAlt) },
    ];
    case "perks": return [
      { selector: ".tickets-perks > h2", target: fixed(TICKETS_TARGETS.perksHeading) },
      { selector: ".tickets-perks > div > figure > figcaption", target: (_, index) => index < content.perkLabels.length ? perkLabelTarget(index) : null },
    ];
    case "includes": return [
      { selector: ".tickets-includes > h2", target: fixed(TICKETS_TARGETS.includesHeading) },
      { selector: ".tickets-includes > div > h3", target: (_, index) => index < content.benefits.length ? benefitTitleTarget(index) : null },
      { selector: ".tickets-includes > div > p", target: (_, index) => index < content.benefits.length ? benefitDetailTarget(index) : null },
      { selector: ".tickets-includes > p.tickets-footnote > em", target: fixed(TICKETS_TARGETS.includesFootnote) },
    ];
    case "transit": return [
      { selector: ".tickets-transit-heading > div > h2", target: fixed(TICKETS_TARGETS.transitHeading) },
      { selector: ".tickets-transit-heading > div > p", target: fixed(TICKETS_TARGETS.transitSubtitle) },
      { selector: ".tickets-transit-heading > img", target: fixed(TICKETS_TARGETS.transitBusImageAlt) },
      { selector: ".tickets-transit > img.tickets-map", target: fixed(TICKETS_TARGETS.transitMapImageAlt) },
    ];
    case "directions": return directionsStamps(content);
  }
}
