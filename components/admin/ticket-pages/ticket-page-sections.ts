import {
  emptyTicketPageContent, seasonMembershipItemIds, knowBeforeYouGoItemIds,
  type KnowBeforeYouGoContent, type SeasonMembershipContent, type TicketPageContent, type TicketPageKey, type TicketPageSaveRequest, type TicketPageSnapshot,
} from "@/lib/cinematic-ticket-pages-content";

export type SeasonSectionId = "heading" | "intro" | "pricing" | "button" | "benefits" | "closing";
export type KbygSectionId = "heading" | "match" | "facts" | "raffle" | "donor";

export type TicketPageSection = { id: string; title: string; /** The content part whose `visible` flag the card switches, or null for "Always shown". */ part: string | null; switchLabel?: string };

export const SEASON_SECTIONS: readonly (TicketPageSection & { id: SeasonSectionId })[] = [
  { id: "heading", title: "Page heading", part: "heading", switchLabel: "Show the page heading on the page" },
  { id: "intro", title: "Intro and what's included", part: "intro", switchLabel: "Show the intro and what's included on the page" },
  { id: "pricing", title: "Price table", part: "pricing" },
  { id: "button", title: "Buy button", part: "button", switchLabel: "Show both Buy buttons on the page" },
  { id: "benefits", title: "Member Benefits", part: "benefits" },
  { id: "closing", title: "Closing call to action", part: "closing" },
];

export const KBYG_SECTIONS: readonly (TicketPageSection & { id: KbygSectionId })[] = [
  { id: "heading", title: "Page heading", part: null },
  { id: "match", title: "Next home match", part: "match" },
  { id: "facts", title: "Match-day tiles", part: "facts" },
  { id: "raffle", title: "Halftime raffle", part: "raffle" },
  { id: "donor", title: "Raffle donor", part: "donor" },
];

/** Parts whose `visible` flag is optional in the schema (absent = shown). The others always carry it. */
const OPTIONAL_PARTS = new Set(["heading", "intro", "button"]);

type Part = { visible?: boolean } & Record<string, unknown>;
const partsOf = (content: unknown) => content as Record<string, Part>;

export type TicketPageSpec<K extends TicketPageKey> = {
  key: K;
  sections: readonly TicketPageSection[];
  /** Image slots (fixed ones and per-item IDs) that belong to a card. */
  imagesOf: (content: TicketPageContent<K>, id: string) => string[];
  summary: (content: TicketPageContent<K>, id: string) => string;
  sectionOnly: (content: TicketPageContent<K>, id: string) => TicketPageContent<K>;
};

const sectionOf = <K extends TicketPageKey>(spec: TicketPageSpec<K>, id: string) => spec.sections.find(section => section.id === id)!;

/** Shown or hidden as the page sees it, or null for a card without a flag. Absent means shown. */
export function ticketPageSectionShown<K extends TicketPageKey>(spec: TicketPageSpec<K>, content: TicketPageContent<K>, id: string): boolean | null {
  const part = sectionOf(spec, id).part;
  return part ? partsOf(content)[part].visible !== false : null;
}

/**
 * Switch one part on or off. The flag is written only because the person toggled it. Setting an optional flag back to
 * "shown" when the saved page never had it removes it again, so toggling twice leaves the draft equal to what is saved.
 */
export function setTicketPageShown<K extends TicketPageKey>(spec: TicketPageSpec<K>, content: TicketPageContent<K>, id: string, shown: boolean, saved: TicketPageContent<K> | null): TicketPageContent<K> {
  const part = sectionOf(spec, id).part;
  if (!part) return content;
  const current = { ...partsOf(content)[part] };
  if (shown && OPTIONAL_PARTS.has(part) && saved && partsOf(saved)[part].visible === undefined) delete current.visible;
  else current.visible = shown;
  return { ...content, [part]: current } as TicketPageContent<K>;
}

/** The slice of the draft one card's preview and unsaved dot depend on. */
export function ticketPageSectionSlice<K extends TicketPageKey>(spec: TicketPageSpec<K>, content: TicketPageContent<K>, id: string): string {
  const part = sectionOf(spec, id).part ?? id;
  return JSON.stringify([partsOf(content)[part], spec.imagesOf(content, id).map(slot => content.images[slot])]);
}

export function changedTicketPageSections<K extends TicketPageKey>(spec: TicketPageSpec<K>, draft: TicketPageContent<K>, saved: TicketPageContent<K> | null): string[] {
  const base = saved ?? emptyTicketPageContent(spec.key);
  return spec.sections.filter(section => ticketPageSectionSlice(spec, draft, section.id) !== ticketPageSectionSlice(spec, base, section.id)).map(section => section.id);
}

export const SEASON_SPEC: TicketPageSpec<"season-membership"> = {
  key: "season-membership",
  sections: SEASON_SECTIONS,
  imagesOf: (content, id) => id === "pricing" ? content.pricing.rows.map(row => row.id) : id === "benefits" ? content.benefits.items.map(item => item.id) : id === "closing" ? ["ticket"] : [],
  summary: (content, id) => {
    switch (id as SeasonSectionId) {
      case "heading": return [content.heading.title, content.heading.subtitle].filter(Boolean).join(" · ") || "No heading";
      case "intro": return `${content.intro.highlights.length} highlights · ${content.intro.includes.length} included`;
      case "pricing": return `${content.pricing.rows.length} seating ${content.pricing.rows.length === 1 ? "section" : "sections"}`;
      case "button": return content.button.label ? `"${content.button.label}"${content.button.href ? "" : ", no link yet"}` : "No button text";
      case "benefits": return `${content.benefits.items.length} ${content.benefits.items.length === 1 ? "benefit" : "benefits"}`;
      default: return content.closing.heading || "No heading";
    }
  },
  /** Only one card's part of the page. The button flag hides both Buy buttons, so each card forces it to what its own preview needs. */
  sectionOnly: (content, id) => {
    const on = (part: string) => id === part;
    return {
      ...content,
      heading: { ...content.heading, visible: on("heading") },
      intro: { ...content.intro, visible: on("intro") },
      pricing: { ...content.pricing, visible: on("pricing") },
      benefits: { ...content.benefits, visible: on("benefits") },
      closing: { ...content.closing, visible: on("closing") || on("button") },
      button: { ...content.button, visible: on("button") },
    };
  },
};

export const KBYG_SPEC: TicketPageSpec<"know-before-you-go"> = {
  key: "know-before-you-go",
  sections: KBYG_SECTIONS,
  imagesOf: (content, id) => id === "match" ? ["youtube"] : id === "facts" ? content.facts.tiles.map(tile => tile.id) : id === "raffle" ? ["raffle"] : id === "donor" ? ["donor"] : [],
  summary: (content, id) => {
    switch (id as KbygSectionId) {
      case "heading": return [content.heading.title, content.heading.subtitle].filter(Boolean).join(" · ") || "No heading";
      case "match": return content.match.watchLabel || content.match.competition || "From Schedule";
      case "facts": return `${content.facts.tiles.length} ${content.facts.tiles.length === 1 ? "tile" : "tiles"}`;
      case "raffle": return content.raffle.subheading || content.raffle.heading || "No heading";
      default: return content.donor.name || content.donor.heading || "No heading";
    }
  },
  sectionOnly: (content, id) => ({
    ...content,
    match: { ...content.match, visible: id === "match" },
    facts: { ...content.facts, visible: id === "facts" },
    raffle: { ...content.raffle, visible: id === "raffle" },
    donor: { ...content.donor, visible: id === "donor" },
  }),
};

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildTicketPageSaveInput<K extends TicketPageKey>(args: {
  pending: TicketPageSaveRequest<K> | null; operationId: string; snapshot: Pick<TicketPageSnapshot<K>, "revision" | "designRevision">;
  draft: TicketPageContent<K>; retiredMediaAssetIds: string[];
}) {
  return args.pending ?? { operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, content: args.draft, retiredMediaAssetIds: args.retiredMediaAssetIds };
}

/** One image slot per price row and benefit, found again by the IDs the content carries. */
export const seasonImageSlots = (content: SeasonMembershipContent) => ["ticket", ...seasonMembershipItemIds(content)];
export const kbygImageSlots = (content: KnowBeforeYouGoContent) => [...["youtube", "raffle", "donor"], ...knowBeforeYouGoItemIds(content)];
