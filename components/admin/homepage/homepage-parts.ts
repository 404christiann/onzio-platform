import type { HomepageDraft, HomepageSection, PieceId } from "@/lib/homepage-editor/model";
import { EDIT_TARGET_REGISTRY } from "@/lib/admin-edit-targets";
import { isHomepageSectionShown } from "@/lib/cinematic-homepage-content";

/** The parts of the Rose City homepage the Overview editor numbers, in the order the page shows them. */
export type PartId = "menu" | "hero" | "raffle" | "match" | "prices" | "ticket" | "photos" | "championship" | "video" | "sponsors" | "forms";

/** Where one of a part's blocks is on the rendered public page: the first `selector` match (or `fallback`), widened to its nearest `closest`. */
export type PartAnchor = { selector: string; closest?: string; fallback?: string };

export type HomepagePart = {
  id: PartId;
  /** The part's name, read from the edit-target registry's `homepage` section of the same id. Never written here. */
  title: string;
  /** The save section the part belongs to. A part is offered only when the page's capabilities include it. */
  section: HomepageSection;
  /** The public components tag these pieces with data-homepage-piece. */
  pieces: readonly PieceId[];
  /** The part's block(s) on the page, in page order (Menu and footer has two). Its overlay boxes are measured from these alone. */
  anchors: readonly PartAnchor[];
  /** Not drawn on the page (External forms): reached from the part list, not from a numbered block. */
  offPage?: boolean;
};

/** The registry label for a part. Throws for a part the registry does not name, so a part can never show another's title. */
export function homepagePartTitle(id: PartId): string {
  const label = EDIT_TARGET_REGISTRY.homepage.sections[id]?.label;
  if (!label) throw new Error(`Homepage part "${id}" has no label: add it to EDIT_TARGET_REGISTRY.homepage (lib/admin-edit-targets.ts).`);
  return label;
}

const piece = (id: PieceId) => `[data-homepage-piece="${id}"]`;
const part = (id: PartId, spec: Omit<HomepagePart, "id" | "title">): HomepagePart => ({ id, title: homepagePartTitle(id), ...spec });

/** Page order. External forms is last because it is the one setting that is not on the page. */
export const HOMEPAGE_PARTS: readonly HomepagePart[] = [
  part("menu", { section: "revamp", pieces: ["revamp.navigation"], anchors: [{ selector: piece("revamp.navigation"), fallback: "header.club-header" }, { selector: "footer.club-footer" }] }),
  part("hero", { section: "hero", pieces: ["hero.heading", "hero.eyebrow", "hero.intro", "hero.cta"], anchors: [{ selector: piece("hero.heading"), closest: "section", fallback: "section.hero" }] }),
  part("raffle", { section: "revamp", pieces: ["revamp.raffle"], anchors: [{ selector: piece("revamp.raffle") }] }),
  part("match", { section: "revamp", pieces: ["revamp.match"], anchors: [{ selector: piece("revamp.match") }] }),
  part("prices", { section: "revamp", pieces: ["revamp.prices"], anchors: [{ selector: piece("revamp.prices") }] }),
  part("ticket", { section: "revamp", pieces: ["revamp.ticket"], anchors: [{ selector: piece("revamp.ticket") }] }),
  part("photos", { section: "photos", pieces: ["photos"], anchors: [{ selector: piece("photos") }] }),
  part("championship", { section: "revamp", pieces: ["revamp.championship"], anchors: [{ selector: piece("revamp.championship") }] }),
  part("video", { section: "video", pieces: ["video"], anchors: [{ selector: piece("video") }] }),
  part("sponsors", { section: "revamp", pieces: ["revamp.sponsors"], anchors: [{ selector: piece("revamp.sponsors"), closest: "section" }] }),
  part("forms", { section: "revamp", pieces: [], anchors: [], offPage: true }),
];

/** The parts the owner has switched off with their show/hide switch (raffle photo, next home match, ticket prices, ticket and map). */
export function hiddenHomepageParts(draft: HomepageDraft): ReadonlySet<PartId> {
  const hidden = new Set<PartId>();
  const revamp = draft.revamp;
  if (!revamp) return hidden;
  if (!isHomepageSectionShown(revamp.raffle)) hidden.add("raffle");
  if (!isHomepageSectionShown(revamp.match)) hidden.add("match");
  if (!isHomepageSectionShown(revamp.prices)) hidden.add("prices");
  if (!revamp.ticket.visible) hidden.add("ticket");
  return hidden;
}

export const PREVIEW_PIECES: readonly PieceId[] = HOMEPAGE_PARTS.flatMap(part => part.pieces);
