import {
  TICKET_VISIBILITY_KEYS, emptyTicketsContent, isTicketSectionShown,
  type TicketArtworkSlot, type TicketVisibilityKey, type TicketsContent, type TicketsSaveRequest, type TicketsSnapshot,
} from "@/lib/tickets-content";
import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";

/** The five cards of the Tickets editor, in the order of the public page. Each image sits with the section it appears in. */
export type TicketsSectionId = "page" | "perks" | "includes" | "transit" | "directions";

export const TICKETS_SECTIONS: readonly { id: TicketsSectionId; title: string; flag: TicketVisibilityKey | null }[] = [
  { id: "page", title: "Page and purchase link", flag: null },
  { id: "perks", title: "Perks", flag: "perksVisible" },
  { id: "includes", title: "Ticket includes", flag: "includesVisible" },
  { id: "transit", title: "Bus and map", flag: "transitVisible" },
  { id: "directions", title: "Directions and parking", flag: "directionsVisible" },
];

/** Image slots whose picture belongs to each card. Together they cover every artwork slot exactly once. */
export const TICKETS_SECTION_IMAGES: Record<TicketsSectionId, readonly TicketArtworkSlot[]> = {
  page: ["banner", "partner"], perks: ["seat", "card", "raffle"], includes: [], transit: ["bus", "map"], directions: [],
};

export const ticketsSectionTitle = (id: TicketsSectionId) => TICKETS_SECTIONS.find(section => section.id === id)!.title;
export const ticketsSectionFlag = (id: TicketsSectionId) => TICKETS_SECTIONS.find(section => section.id === id)!.flag;

/** Shown or hidden as the page sees it, or null for a card without a flag ("Always shown"). Absent means shown. */
export function ticketsSectionShown(content: TicketsContent, id: TicketsSectionId): boolean | null {
  const flag = ticketsSectionFlag(id);
  return flag ? isTicketSectionShown(content, flag) : null;
}

/**
 * Switch one flag. The flag is written only because the person toggled it. Setting a flag back to "shown" when the saved
 * page never had it removes it again, so toggling twice leaves the draft equal to what is saved.
 */
export function setTicketsFlag(content: TicketsContent, key: TicketVisibilityKey, shown: boolean, saved: TicketsContent | null): TicketsContent {
  if (shown && saved && saved[key] === undefined) {
    const { [key]: _gone, ...rest } = content;
    return rest as TicketsContent;
  }
  return { ...content, [key]: shown };
}

/** The slice of the draft one card's preview and unsaved dot depend on. */
export function ticketsSectionSlice(content: TicketsContent, id: TicketsSectionId): string {
  const art = (slots: readonly TicketArtworkSlot[]) => slots.map(slot => content.artwork[slot]);
  const flag = ticketsSectionFlag(id);
  switch (id) {
    case "page": return JSON.stringify([content.title, content.subtitle, content.purchaseUrl, content.missingPurchaseLabel, content.bannerHeightFraction, content.purchaseVisible, art(TICKETS_SECTION_IMAGES.page)]);
    case "perks": return JSON.stringify([content.perksHeading, content.perkLabels, content[flag!], art(TICKETS_SECTION_IMAGES.perks)]);
    case "includes": return JSON.stringify([content.includesHeading, content.benefits, content.benefitsNote, content[flag!]]);
    case "transit": return JSON.stringify([content.transitHeading, content.transitSubtitle, content[flag!], art(TICKETS_SECTION_IMAGES.transit)]);
    case "directions": return JSON.stringify([content.directionsHeading, content.directionsBody, content.parkingHeading, content.parkingBody, content.parkingNote, content[flag!]]);
  }
}

export function changedTicketsSections(draft: TicketsContent, saved: TicketsContent | null): TicketsSectionId[] {
  const base = saved ?? emptyTicketsContent();
  return TICKETS_SECTIONS.filter(section => ticketsSectionSlice(draft, section.id) !== ticketsSectionSlice(base, section.id)).map(section => section.id);
}

/** The draft with only one card's part of the page switched on. The rest is hidden with the page's own flags, or by CSS where the page has none. */
export function ticketsSectionOnly(content: TicketsContent, id: TicketsSectionId): TicketsContent {
  const next: TicketsContent = { ...content };
  for (const key of TICKET_VISIBILITY_KEYS) next[key] = false;
  const flag = ticketsSectionFlag(id);
  if (flag) next[flag] = true;
  if (id === "page") next.purchaseVisible = true;
  return next;
}

export function ticketsSectionSummary(content: TicketsContent, id: TicketsSectionId): string {
  switch (id) {
    case "page": return content.purchaseUrl ? "Purchase link set" : `No purchase link yet: shows "${content.missingPurchaseLabel}"`;
    case "perks": return content.perkLabels.filter(Boolean).join(" · ") || "No perk labels";
    case "includes": return `${content.benefits.length} ${content.benefits.length === 1 ? "benefit" : "benefits"}`;
    case "transit": return content.transitHeading || "No heading";
    case "directions": return [content.directionsHeading, content.parkingHeading].filter(Boolean).join(" · ") || "No heading";
  }
}

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildTicketsSaveInput(args: {
  pending: TicketsSaveRequest | null; operationId: string; snapshot: Pick<TicketsSnapshot, "revision" | "designRevision">;
  draft: TicketsContent; retired: string[];
}) {
  return args.pending ?? { operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, content: args.draft, retiredMediaAssetIds: args.retired };
}

/** What the Save button shows. A running save wins over every failure. */
export function editorPageState(args: { base: SaveState; busy: boolean; uploading: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  const base: SaveState = args.uploading && args.base === "dirty" ? "clean" : args.base;
  return derivePageSaveState(base, failure);
}
