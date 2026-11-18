import type { HomepageSection, PieceId } from "@/lib/homepage-editor/model";

/** The parts of the Rose City homepage the Overview editor numbers, in the order the page shows them. */
export type PartId = "menu" | "hero" | "raffle" | "match" | "prices" | "ticket" | "photos" | "championship" | "video" | "sponsors" | "forms";

export type HomepagePart = {
  id: PartId;
  title: string;
  /** The save section the part belongs to. A part is offered only when the page's capabilities include it. */
  section: HomepageSection;
  /** The public components tag these pieces with data-homepage-piece; the preview finds each part's block by them. */
  pieces: readonly PieceId[];
  /** Not drawn on the page (External forms): reached from the part list, not from a numbered block. */
  offPage?: boolean;
};

/** Page order. External forms is last because it is the one setting that is not on the page. */
export const HOMEPAGE_PARTS: readonly HomepagePart[] = [
  { id: "menu", title: "Menu and footer", section: "revamp", pieces: ["revamp.navigation"] },
  { id: "hero", title: "Top of the page", section: "hero", pieces: ["hero.heading", "hero.eyebrow", "hero.intro", "hero.cta"] },
  { id: "raffle", title: "Raffle", section: "revamp", pieces: ["revamp.raffle"] },
  { id: "match", title: "Next home match", section: "revamp", pieces: ["revamp.match"] },
  { id: "prices", title: "Ticket prices", section: "revamp", pieces: ["revamp.prices"] },
  { id: "ticket", title: "Ticket and map", section: "revamp", pieces: ["revamp.ticket"] },
  { id: "photos", title: "Photo slideshow", section: "photos", pieces: ["photos"] },
  { id: "championship", title: "Championship", section: "revamp", pieces: ["revamp.championship"] },
  { id: "video", title: "Behind the Rose video", section: "video", pieces: ["video"] },
  { id: "sponsors", title: "Partners strip", section: "revamp", pieces: ["revamp.sponsors"] },
  { id: "forms", title: "External forms", section: "revamp", pieces: [], offPage: true },
];

export const PREVIEW_PIECES: readonly PieceId[] = HOMEPAGE_PARTS.flatMap(part => part.pieces);
