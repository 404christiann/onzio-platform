import type { DBAboutPageContent, DBClubLogoPageContent } from "@/lib/db-types";
import {
  normalizeAboutValues, normalizeClubLogoColorCards, normalizeClubLogoFeatures, normalizeStoryParagraphs,
  type AboutValue, type ClubLogoColorCard, type ClubLogoFeature,
} from "@/lib/about-content";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "@/lib/about-content";
import { aboutPageEditableContent, prepareAboutPageSave } from "@/lib/about-editor/save";
import { aboutEditorSaveSchema, type AboutEditorSaveRequest, type AboutEditorSnapshot } from "@/lib/about-editor/contract";
import { isAboutContentDestination } from "@/lib/about-editor/content-policy";
import { moveAt } from "@/components/admin/ui/editor-kit/listOps";
import { derivePageSaveState, type PageSaveFailure, type PageSaveState } from "@/components/admin/ui/editor-kit/pageSaveState";
import type { SaveState } from "@/components/admin/ui/useSaveState";
import type { SiteRouteOption } from "@/lib/site-routes";

/** The two public pages this editor saves, each with its own revision and its own Save. */
export type AboutPageId = "about" | "logo";
export type AboutSectionId = "hero" | "story" | "values" | "closing";
export type LogoSectionId = "images" | "features" | "colors";
export type SectionId = AboutSectionId | LogoSectionId;

/** What each image field accepts in the browser. The feature image is a photo; the Club Logo crest, map, patches, icons and swatches are graphics. The server enforces the same limits. */
export const ABOUT_IMAGE_RULES = {
  photo: { allowedTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 15 * 1024 * 1024 },
  graphic: { allowedTypes: ["image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
} as const;

export const ABOUT_LIMITS = { hero: 140, paragraph: 10000, paragraphs: 100, heading: 500, values: 24, valueTitle: 500, valueDescription: 10000, closing: 10000, cta: 200, features: 24, featureTitle: 500, featureDescription: 10000, colors: 6, colorLabel: 500 } as const;

export const PAGE_LABELS: Record<AboutPageId, string> = { about: "About page", logo: "Club Logo page" };
export const PAGE_PATHS: Record<AboutPageId, string> = { about: "/club/about", logo: "/club/logo" };

export const SECTIONS: Record<AboutPageId, readonly { id: SectionId; title: string }[]> = {
  about: [{ id: "hero", title: "Page heading" }, { id: "story", title: "Story" }, { id: "values", title: "Values" }, { id: "closing", title: "Closing" }],
  logo: [{ id: "images", title: "Crest and map images" }, { id: "features", title: "Crest features" }, { id: "colors", title: "Color cards" }],
};
export const pageOfSection = (id: SectionId): AboutPageId => (SECTIONS.about.some(section => section.id === id) ? "about" : "logo");

/* ---------- the draft: the saved content plus one in-memory id per card, so a card keeps its place in the DOM when it moves ---------- */

export type KeyedValue = AboutValue & { _id: string };
export type KeyedFeature = ClubLogoFeature & { _id: string };
export type KeyedColorCard = ClubLogoColorCard & { _id: string };
export type AboutDraft = Omit<DBAboutPageContent, "values"> & { values: KeyedValue[] };
export type LogoDraft = Omit<DBClubLogoPageContent, "features" | "color_cards"> & { features: KeyedFeature[]; color_cards: KeyedColorCard[] };
export type AboutDrafts = { about: AboutDraft; logo: LogoDraft };

let counter = 0;
export const newCardId = () => `card-${++counter}`;

/** The editor's own mapping of saved content to a draft. Same normalisation as the classic editor. */
export function toAboutDraft(content: Partial<DBAboutPageContent> | null | undefined): AboutDraft {
  const merged = { ...EMPTY_ABOUT_PAGE_CONTENT, ...content } as DBAboutPageContent;
  return { ...merged, story_paragraphs: normalizeStoryParagraphs(merged.story_paragraphs, []), values: normalizeAboutValues(merged.values, []).map(value => ({ ...value, _id: newCardId() })) };
}
export function toLogoDraft(content: Partial<DBClubLogoPageContent> | null | undefined): LogoDraft {
  const merged = { ...EMPTY_CLUB_LOGO_PAGE_CONTENT, ...content } as DBClubLogoPageContent;
  return {
    ...merged,
    features: normalizeClubLogoFeatures(merged.features, []).map(feature => ({ ...feature, _id: newCardId() })),
    color_cards: normalizeClubLogoColorCards(merged.color_cards, []).map(card => ({ ...card, _id: newCardId() })),
  };
}
export const draftFromSnapshot = (snapshot: AboutEditorSnapshot | undefined) => snapshot?.page === "logo" ? toLogoDraft(snapshot.content as DBClubLogoPageContent | null) : toAboutDraft(snapshot?.content as DBAboutPageContent | null);

const dropId = <T extends { _id: string }>({ _id, ...rest }: T): Omit<T, "_id"> => { void _id; return rest; };
export const contentOfAbout = (draft: AboutDraft): DBAboutPageContent => ({ ...draft, values: draft.values.map(dropId) });
export const contentOfLogo = (draft: LogoDraft): DBClubLogoPageContent => ({ ...draft, features: draft.features.map(dropId), color_cards: draft.color_cards.map(dropId) });

/** What a page holds, without card ids. Two drafts with the same fingerprint save the same request. */
export const pageFingerprint = (page: AboutPageId, drafts: AboutDrafts): string =>
  JSON.stringify(page === "about" ? contentOfAbout(drafts.about) : contentOfLogo(drafts.logo), (key, value) => (key === "updated_at" || key === "id" ? undefined : value));

/* ---------- order ---------- */

/** One card earlier or later. The cards keep their contents; only the order changes. */
export const moveCard = <T extends { _id: string }>(cards: readonly T[], id: string, delta: -1 | 1): T[] => moveAt(cards, cards.findIndex(card => card._id === id), delta);

/* ---------- section slices, summaries, changed marks ---------- */

export function sectionSlice(drafts: AboutDrafts, id: SectionId): string {
  const { about, logo } = drafts;
  const pick = {
    hero: () => about.hero_title,
    story: () => [about.story_paragraphs, about.feature_image_url],
    values: () => [about.values_heading, about.values.map(dropId)],
    closing: () => [about.closing_text, about.closing_cta_label, about.closing_cta_href],
    images: () => [logo.annotated_image_url, logo.map_image_url],
    features: () => logo.features.map(dropId),
    colors: () => logo.color_cards.map(dropId),
  }[id];
  return JSON.stringify(pick());
}
export const changedSections = (draft: AboutDrafts, saved: AboutDrafts): SectionId[] =>
  [...SECTIONS.about, ...SECTIONS.logo].filter(section => sectionSlice(draft, section.id) !== sectionSlice(saved, section.id)).map(section => section.id);

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
export function sectionSummary(drafts: AboutDrafts, id: SectionId): string {
  const { about, logo } = drafts;
  switch (id) {
    case "hero": return about.hero_title || "No heading yet";
    case "story": return `${plural(about.story_paragraphs.length, "paragraph")} · ${about.feature_image_url ? "feature image" : "no image"}`;
    case "values": return about.values.length ? `${about.values_heading || "Our Values"} · ${about.values.length} of ${ABOUT_LIMITS.values}` : "No values yet";
    case "closing": return closingIsEmpty(about) ? "Empty" : `${about.closing_cta_label || "No button"} → ${about.closing_cta_href || "no page"}`;
    case "images": return [logo.annotated_image_url ? "Annotated crest" : "No crest image", logo.map_image_url ? "map" : "no map"].join(" · ");
    case "features": return logo.features.length ? `${logo.features.length} of ${ABOUT_LIMITS.features} · ${logo.features.slice(0, 3).map(feature => feature.title.replace(/^The /, "")).join(", ")}${logo.features.length > 3 ? "…" : ""}` : "No features yet";
    case "colors": return logo.color_cards.length ? `${logo.color_cards.length} of ${ABOUT_LIMITS.colors} · ${logo.color_cards.map(card => card.label || "Untitled").join(", ")}` : "No color cards yet";
  }
}
export const closingIsEmpty = (about: Pick<AboutDraft, "closing_text" | "closing_cta_label">) => !about.closing_text.trim() && !about.closing_cta_label.trim();
/** The public page hides Values and Closing while they are empty, as it always has. The editor says so; there is no switch. */
export function sectionChip(drafts: AboutDrafts, id: SectionId): string | undefined {
  if (id === "values") return drafts.about.values.length ? "Shown" : "Hidden while empty";
  if (id === "closing") return closingIsEmpty(drafts.about) ? "Hidden while empty" : "Shown";
  return undefined;
}

/* ---------- destinations ---------- */

/** The server accepts only these routes for the closing button, so the picker offers only these. A stored link outside the list shows "Current link unavailable". */
export const acceptedDestinations = (options: readonly SiteRouteOption[]): SiteRouteOption[] => options.filter(option => isAboutContentDestination(option.href));

/* ---------- validation: the same rules and words the classic editor uses ---------- */

export type AboutErrors = Record<string, string>;
export function aboutFieldErrors(about: AboutDraft, destination: { loaded: boolean; available: boolean }): AboutErrors {
  const errors: AboutErrors = {};
  if (!about.hero_title.trim()) errors.hero = "Add a page heading before saving.";
  else if (about.hero_title.length > ABOUT_LIMITS.hero) errors.hero = "Keep the page heading to 140 characters.";
  for (const value of about.values) if (!value.title.trim()) errors[`values.${value._id}`] = "Give this value a title, or remove it.";
  if (!destination.loaded || !destination.available) errors.href = "Choose a page available to this club for the closing button before saving.";
  return errors;
}
export function errorSection(path: string): AboutSectionId {
  if (path === "hero") return "hero";
  if (path === "href") return "closing";
  return "values";
}
export function firstErrorSection(errors: AboutErrors): AboutSectionId | null {
  const bad = new Set(Object.keys(errors).map(errorSection));
  return SECTIONS.about.find(section => bad.has(section.id as AboutSectionId))?.id as AboutSectionId | undefined ?? null;
}

/* ---------- the request: exactly what the classic editor sends for one page ---------- */

export function buildAboutSaveRequest(args: {
  page: AboutPageId; pending: AboutEditorSaveRequest | null; operationId: string; snapshot: Pick<AboutEditorSnapshot, "revision" | "designRevision">;
  drafts: AboutDrafts; retiredMediaUrls: readonly string[]; now: string;
}): AboutEditorSaveRequest {
  if (args.pending) return args.pending;
  const prepared = prepareAboutPageSave({ page: args.page, about: contentOfAbout(args.drafts.about), logo: contentOfLogo(args.drafts.logo), fixedClosingCtaHref: null, now: args.now });
  return aboutEditorSaveSchema.parse({
    page: prepared.page, content: aboutPageEditableContent(prepared), operationId: args.operationId,
    expectedRevision: args.snapshot.revision, designRevision: args.snapshot.designRevision, retiredMediaUrls: [...args.retiredMediaUrls],
  });
}

/** What the Save button shows for one page. A running save wins over every failure. */
export function aboutPageState(args: { base: SaveState; busy: boolean; pending: boolean; conflict: boolean; saveFailed: boolean }): PageSaveState {
  if (args.busy) return "saving";
  const failure: PageSaveFailure | null = args.pending ? "retry" : args.conflict ? "conflict" : args.saveFailed ? "error" : null;
  return derivePageSaveState(args.base, failure);
}
