import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { HomepageDraft } from "@/lib/homepage-editor/model";

/**
 * Click-to-field for the Rose City Homepage Overview (UI-PREVIEW-CLICK-HOMEPAGE). The ids are declared in
 * EDIT_TARGET_REGISTRY ("homepage"); the dialog fields carry them, and HOMEPAGE_PREVIEW_STAMPS puts the same ids on the
 * public nodes inside the Overview's preview frame only. Schedule-owned text (opponent, date, venue, scores) has no
 * homepage field, so it carries no id and a click there opens the part as before.
 */
export const HOMEPAGE_TARGETS = {
  heroEyebrow: editTarget("homepage", "hero", "eyebrow"),
  heroIntro: editTarget("homepage", "hero", "intro"),
  heroLineOne: editTarget("homepage", "hero", "headlineLineOne"),
  heroLineTwo: editTarget("homepage", "hero", "headlineLineTwo"),
  heroPrimaryCta: editTarget("homepage", "hero", "primaryCtaLabel"),
  heroSecondaryCta: editTarget("homepage", "hero", "secondaryCtaLabel"),
  raffleImage: editTarget("homepage", "raffle", "imageAlt"),
  matchHeading: editTarget("homepage", "match", "heading"),
  matchButton: editTarget("homepage", "match", "buttonLabel"),
  matchEmpty: editTarget("homepage", "match", "emptyMessage"),
  pricesHeading: editTarget("homepage", "prices", "heading"),
  pricesFootnote: editTarget("homepage", "prices", "footnote"),
  ticketImage: editTarget("homepage", "ticket", "imageAlt"),
  championshipLeague: editTarget("homepage", "championship", "league"),
  championshipYear: editTarget("homepage", "championship", "year"),
  championshipTitle: editTarget("homepage", "championship", "title"),
  championshipBody: editTarget("homepage", "championship", "body"),
  championshipImage: editTarget("homepage", "championship", "imageAlt"),
  videoEyebrow: editTarget("homepage", "video", "eyebrow"),
  videoTitle: editTarget("homepage", "video", "title"),
  videoDescription: editTarget("homepage", "video", "description"),
  sponsorsHeading: editTarget("homepage", "sponsors", "heading"),
} as const;

export type PriceRowField = "label" | "price" | "description" | "note";
/** One ticket option's field, keyed by the row's stable id. */
export const priceRowTarget = (rowId: string, field: PriceRowField): EditTargetId => editTarget("homepage", "prices", field, rowId);

/** Artwork slots whose "Describe this image" field a preview click on the image opens. */
export const ARTWORK_TARGETS: Partial<Record<string, EditTargetId>> = {
  raffle: HOMEPAGE_TARGETS.raffleImage,
  ticket: HOMEPAGE_TARGETS.ticketImage,
  trophy: HOMEPAGE_TARGETS.championshipImage,
};

const fixed = (id: EditTargetId) => () => id;
const PIECE = (piece: string) => `[data-homepage-piece="${piece}"]`;

/** The ticket option a node belongs to: its .price-item's position among the card's options, mapped to that row's id. */
function priceRow(draft: HomepageDraft, element: Element, field: PriceRowField) {
  const item = element.closest(".price-item");
  const items = item?.parentElement ? Array.from(item.parentElement.querySelectorAll(":scope > .price-item")) : [];
  const row = item ? draft.revamp?.prices.rows[items.indexOf(item)] : undefined;
  return row ? priceRowTarget(row.id, field) : null;
}

/** Where each field shows on the public homepage, as rendered by components/cinematic (CinematicHome, CinematicHero, ...). */
export function homepagePreviewStamps(draft: HomepageDraft): EditTargetStamp[] {
  return [
    { selector: `p${PIECE("hero.eyebrow")}`, target: fixed(HOMEPAGE_TARGETS.heroEyebrow) },
    // The heading's two lines are text in one h1, so the heading opens Line one.
    { selector: `h1${PIECE("hero.heading")}`, target: fixed(HOMEPAGE_TARGETS.heroLineOne) },
    { selector: PIECE("hero.intro"), target: fixed(HOMEPAGE_TARGETS.heroIntro) },
    { selector: ".hero-actions .button:not(.outline)", target: fixed(HOMEPAGE_TARGETS.heroPrimaryCta) },
    { selector: ".hero-actions .button.outline", target: fixed(HOMEPAGE_TARGETS.heroSecondaryCta) },
    { selector: `${PIECE("revamp.raffle")} img`, target: fixed(HOMEPAGE_TARGETS.raffleImage) },
    { selector: ".match-card > h2", target: fixed(HOMEPAGE_TARGETS.matchHeading) },
    { selector: ".match-card .ticket-buy", target: fixed(HOMEPAGE_TARGETS.matchButton) },
    { selector: ".match-card > p.venue[role=status]", target: fixed(HOMEPAGE_TARGETS.matchEmpty) },
    { selector: ".prices-card > h2", target: fixed(HOMEPAGE_TARGETS.pricesHeading) },
    { selector: ".prices-card .price-item > h3", target: element => priceRow(draft, element, "label") },
    { selector: ".prices-card .price-item > h3 > span", target: element => priceRow(draft, element, "price") },
    { selector: ".prices-card .price-item > p", target: element => priceRow(draft, element, "description") },
    { selector: ".prices-card .price-item > small", target: element => priceRow(draft, element, "note") },
    { selector: ".prices-card > .tennis-note", target: fixed(HOMEPAGE_TARGETS.pricesFootnote) },
    { selector: `${PIECE("revamp.ticket")} img`, target: fixed(HOMEPAGE_TARGETS.ticketImage) },
    { selector: ".champions .champion-copy > .eyebrow", target: fixed(HOMEPAGE_TARGETS.championshipLeague) },
    { selector: ".champions .champion-copy > h2", target: fixed(HOMEPAGE_TARGETS.championshipTitle) },
    { selector: ".champions .champion-copy > .body-copy", target: fixed(HOMEPAGE_TARGETS.championshipBody) },
    { selector: ".champions > img, .champions > picture img", target: fixed(HOMEPAGE_TARGETS.championshipImage) },
    { selector: ".behind-rose > .eyebrow", target: fixed(HOMEPAGE_TARGETS.videoEyebrow) },
    { selector: ".behind-rose > h2", target: fixed(HOMEPAGE_TARGETS.videoTitle) },
    { selector: ".behind-rose > .body-copy", target: fixed(HOMEPAGE_TARGETS.videoDescription) },
    { selector: ".partners > h2", target: fixed(HOMEPAGE_TARGETS.sponsorsHeading) },
  ];
}
