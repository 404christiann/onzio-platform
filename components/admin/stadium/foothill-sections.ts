import {
  emptyStadiumContent, stadiumContentSchema, stadiumCropSchema, stadiumDraftFingerprint,
  type StadiumArtworkSlot, type StadiumContent, type StadiumCrop, type StadiumSaveRequest, type StadiumSnapshot,
} from "@/lib/stadium-content";

/** The six cards of the Foothill Transit page, in the fixed order of the public page. */
export type FoothillSectionId = "heading" | "images" | "map" | "match" | "benefits" | "sections";
type FlagKey = "showHeading" | "showMap" | "showSections" | "showMatch" | "showBenefits";

export const FOOTHILL_SECTIONS: readonly { id: FoothillSectionId; title: string }[] = [
  { id: "heading", title: "Page heading" },
  { id: "images", title: "Bus and map images" },
  { id: "map", title: "Phone map" },
  { id: "match", title: "Next match" },
  { id: "benefits", title: "Ticket benefits" },
  { id: "sections", title: "Sections" },
];

/** The page-level flag each card's switch writes. The images card has none, so it is "Always shown". */
export const FOOTHILL_FLAGS: Record<FoothillSectionId, FlagKey | null> = {
  heading: "showHeading", images: null, map: "showMap", match: "showMatch", benefits: "showBenefits", sections: "showSections",
};

/** The public sections a card's preview must show (the bus sits in the heading, the map in the route section). */
const PREVIEW_FLAGS: Record<FoothillSectionId, readonly FlagKey[]> = {
  heading: ["showHeading"], images: ["showHeading", "showMap"], map: ["showMap"], match: ["showMatch"], benefits: ["showBenefits"], sections: ["showSections"],
};
/** Artwork slots that appear in each card's preview. */
export const FOOTHILL_PREVIEW_IMAGES: Record<FoothillSectionId, readonly StadiumArtworkSlot[]> = {
  heading: ["bus"], images: ["bus", "map"], map: ["map"], match: ["partner"], benefits: [], sections: [],
};

export const foothillSectionTitle = (id: FoothillSectionId) => FOOTHILL_SECTIONS.find(section => section.id === id)!.title;

/** Everything a card's preview depends on: its fields, flag and the pictures it shows. */
export function foothillPreviewSlice(content: StadiumContent, id: FoothillSectionId): string {
  const body: Record<FoothillSectionId, unknown> = {
    heading: [content.showHeading, content.title, content.subtitle],
    images: [content.showHeading, content.showMap],
    map: [content.showMap, content.phoneMapLayout, content.phoneCardCrop, content.phoneMapCrop],
    match: [content.showMatch],
    benefits: [content.showBenefits, content.includesHeading, content.benefits, content.benefitsNote],
    sections: [content.showSections, content.sections],
  };
  return JSON.stringify([body[id], FOOTHILL_PREVIEW_IMAGES[id].map(slot => content.artwork[slot])]);
}

/** Only what the card itself edits (its dot). The bus picture is edited in the images card, not the heading card. */
function ownSlice(content: StadiumContent, id: FoothillSectionId): string {
  switch (id) {
    case "heading": return JSON.stringify([content.showHeading, content.title, content.subtitle]);
    case "images": return JSON.stringify([content.artwork.bus, content.artwork.map]);
    case "map": return JSON.stringify([content.showMap, content.phoneMapLayout, content.phoneCardCrop, content.phoneMapCrop]);
    case "match": return JSON.stringify([content.showMatch, content.artwork.partner]);
    case "benefits": return JSON.stringify([content.showBenefits, content.includesHeading, content.benefits, content.benefitsNote]);
    case "sections": return JSON.stringify([content.showSections, content.sections]);
  }
}

/** Both sides go through the schema first: the saved row may list keys in another order than the draft, which must not read as an edit. */
export function changedFoothillSections(draft: StadiumContent, saved: StadiumContent | null): FoothillSectionId[] {
  const now = stadiumContentSchema.parse(draft), base = stadiumContentSchema.parse(saved ?? emptyStadiumContent());
  return FOOTHILL_SECTIONS.filter(section => ownSlice(now, section.id) !== ownSlice(base, section.id)).map(section => section.id);
}

/** The draft with only one card's public sections switched on, so the real page component renders just that. */
export function foothillSectionOnly(content: StadiumContent, id: FoothillSectionId): StadiumContent {
  const on = new Set<FlagKey>(PREVIEW_FLAGS[id]);
  return { ...content, showHeading: on.has("showHeading"), showMap: on.has("showMap"), showSections: on.has("showSections"), showMatch: on.has("showMatch"), showBenefits: on.has("showBenefits") };
}

export function foothillSectionSummary(content: StadiumContent, id: FoothillSectionId): string {
  switch (id) {
    case "heading": return [content.title, content.subtitle].filter(Boolean).join(" · ") || "No heading";
    case "images": return `${[content.artwork.bus, content.artwork.map].filter(image => image.assetId).length} of 2 images added`;
    case "map": return content.phoneMapLayout === "split" ? "Route card, then walking map" : "Full image on phones";
    case "match": return "Partner logo under the match";
    case "benefits": return `${content.benefits.length} ${content.benefits.length === 1 ? "benefit" : "benefits"}`;
    case "sections": return `${content.sections.length} ${content.sections.length === 1 ? "block" : "blocks"} · ${content.sections.filter(section => section.visible).length} shown`;
  }
}

/** The exact request the editor has always sent. A pending (uncertain) request is re-sent unchanged. */
export function buildFoothillSaveInput(args: {
  pending: StadiumSaveRequest | null; operationId: string; snapshot: Pick<StadiumSnapshot, "revision" | "designRevision">;
  draft: StadiumContent; retired: string[];
}) {
  return args.pending ?? {
    operationId: args.operationId, expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision,
    content: args.draft, retiredMediaAssetIds: [...new Set(args.retired)],
  };
}

export const foothillDirty = (draft: StadiumContent, saved: StadiumContent | null) => stadiumDraftFingerprint(draft) !== stadiumDraftFingerprint(saved ?? emptyStadiumContent());

/** One crop edit in whole percent, as the person types it. Returns null when the crop would leave the image (the old editor refused it the same way). */
export function applyFoothillCrop(content: StadiumContent, cropKey: "phoneCardCrop" | "phoneMapCrop", key: keyof StadiumCrop, percent: number): StadiumContent | null {
  if (!Number.isFinite(percent)) return null;
  const candidate = { ...content[cropKey], [key]: percent / 100 };
  if (!stadiumCropSchema.safeParse(candidate).success) return null;
  return { ...content, [cropKey]: candidate };
}
