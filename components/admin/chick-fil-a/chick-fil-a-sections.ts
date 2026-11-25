import { adminImageRules } from "@/components/admin/ui/adminImageFiles";
import { mediaHint } from "@/lib/media-rules";
import {
  CHICK_FIL_A_SECTIONS, chickFilAContentSchema, chickFilADraftFingerprint, emptyChickFilAContent,
  type ChickFilAArtworkSlot, type ChickFilAContent, type ChickFilASaveRequest, type ChickFilASection, type ChickFilASnapshot,
} from "@/lib/chick-fil-a-content";

/** The seven cards: the six sections that have a show flag, plus the background picture, which has none. */
export type ChickFilACardId = ChickFilASection | "background";

export const CHICK_FIL_A_CARDS: readonly { id: ChickFilACardId; title: string }[] = [
  { id: "heading", title: "Page heading" },
  { id: "details", title: "Details and meal pass" },
  { id: "steps", title: "Three steps" },
  { id: "map", title: "Route map" },
  { id: "match", title: "Next home match" },
  { id: "restaurant", title: "Restaurant photo" },
  { id: "background", title: "Background artwork" },
];

export const chickFilACardTitle = (id: ChickFilACardId) => CHICK_FIL_A_CARDS.find(card => card.id === id)!.title;

/** The flag a card's switch writes (content.sections[flag]). The background card has none, so it is "Always shown". */
export const chickFilAFlag = (id: ChickFilACardId): ChickFilASection | null => id === "background" ? null : id;

/** Which pictures sit in which card (confirmed): meal pass with Details; drive-thru, free ticket and meal with Steps; partner with Match. */
export const CHICK_FIL_A_CARD_IMAGES: Record<ChickFilACardId, readonly ChickFilAArtworkSlot[]> = {
  heading: [], details: ["mealPass"], steps: ["driveThru", "freeTicket", "enjoyGame"], map: ["map"], match: ["partner"], restaurant: ["restaurant"], background: ["background"],
};
/** Pictures that show in a card's preview. The background paints behind the match card, so Match shows it too. */
const PREVIEW_IMAGES: Record<ChickFilACardId, readonly ChickFilAArtworkSlot[]> = { ...CHICK_FIL_A_CARD_IMAGES, match: ["partner", "background"] };
export const chickFilAPreviewImages = (id: ChickFilACardId) => PREVIEW_IMAGES[id];

function fields(content: ChickFilAContent, id: ChickFilACardId): unknown {
  switch (id) {
    case "heading": return [content.title, content.subtitle];
    case "details": return [content.detailsHeading, content.detailsBody];
    case "steps": return [content.stepLabels, content.stepNumbers];
    default: return [];
  }
}
const flagOf = (content: ChickFilAContent, id: ChickFilACardId) => { const flag = chickFilAFlag(id); return flag ? content.sections[flag] : null; };

/** Everything a card's preview depends on. */
export function chickFilAPreviewSlice(content: ChickFilAContent, id: ChickFilACardId): string {
  return JSON.stringify([flagOf(content, id), fields(content, id), PREVIEW_IMAGES[id].map(slot => content.artwork[slot])]);
}
function ownSlice(content: ChickFilAContent, id: ChickFilACardId): string {
  return JSON.stringify([flagOf(content, id), fields(content, id), CHICK_FIL_A_CARD_IMAGES[id].map(slot => content.artwork[slot])]);
}
/** Both sides go through the schema first: the saved row may list keys in another order than the draft, which must not read as an edit. */
export function changedChickFilACards(draft: ChickFilAContent, saved: ChickFilAContent | null): ChickFilACardId[] {
  const now = chickFilAContentSchema.parse(draft), base = chickFilAContentSchema.parse(saved ?? emptyChickFilAContent());
  return CHICK_FIL_A_CARDS.filter(card => ownSlice(now, card.id) !== ownSlice(base, card.id)).map(card => card.id);
}

/** The draft with only one card's public section switched on, so the real page component renders just that. */
export function chickFilACardOnly(content: ChickFilAContent, id: ChickFilACardId): ChickFilAContent {
  const shown: ChickFilASection = id === "background" ? "match" : id;
  const sections = Object.fromEntries(CHICK_FIL_A_SECTIONS.map(section => [section, section === shown])) as ChickFilAContent["sections"];
  return { ...content, sections };
}

export function chickFilACardSummary(content: ChickFilAContent, id: ChickFilACardId): string {
  switch (id) {
    case "heading": return [content.title, content.subtitle].filter(Boolean).join(" · ") || "No heading";
    case "details": return content.detailsHeading || "No heading";
    case "steps": return content.stepLabels.filter(Boolean).join(" · ") || "No step labels";
    case "map": return content.artwork.map.assetId ? "Route map added" : "No map yet";
    case "match": return "Partner logo under the match";
    case "restaurant": return content.artwork.restaurant.assetId ? "Restaurant photo added" : "No photo yet";
    case "background": return "Seat artwork behind the match card";
  }
}

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildChickFilASaveInput(args: {
  pending: ChickFilASaveRequest | null; operationId: string; snapshot: Pick<ChickFilASnapshot, "revision" | "designRevision">;
  draft: ChickFilAContent; retired: string[];
}) {
  return args.pending ?? {
    operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision,
    content: args.draft, retiredMediaAssetIds: [...new Set(args.retired)],
  };
}

export const chickFilADirty = (draft: ChickFilAContent, saved: ChickFilAContent | null) => chickFilADraftFingerprint(draft) !== chickFilADraftFingerprint(saved ?? emptyChickFilAContent());

/** What each picture slot accepts, from lib/media-rules.ts. The restaurant photo is a photo (JPEG too); everything else is a graphic. */
export const CHICK_FIL_A_IMAGE_RULES = {
  restaurant: { ...adminImageRules("photo"), hint: `${mediaHint("photo", { pixels: true })}.`, bucket: "homepage" },
  default: { ...adminImageRules("graphic"), hint: `${mediaHint("graphic", { pixels: true })}.`, bucket: "homepage-artwork" },
} as const;
export const chickFilAImageRules = (slot: ChickFilAArtworkSlot) => slot === "restaurant" ? CHICK_FIL_A_IMAGE_RULES.restaurant : CHICK_FIL_A_IMAGE_RULES.default;
