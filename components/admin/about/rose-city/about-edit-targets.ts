import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { AboutDrafts, SectionId } from "./about-sections";

/**
 * Click-to-field for Rose City's About editor (UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES). The ids are declared in
 * EDIT_TARGET_REGISTRY ("about", lib/edit-targets/about-contact-policies.ts); AboutSectionFields stamps them on the dialog
 * controls, and aboutPreviewStamps puts the same ids on the public nodes inside a card's preview only (never on the public page).
 *
 * Every card renders the whole public page (CinematicAbout or CinematicCrest, placeholders on) and hides the other sections with
 * CSS (AboutEditor.module.css `.only`), so each card's stamps are scoped to that card's own section and never reach a hidden node.
 *
 * Cards for values, crest features and color cards are keyed by the draft's in-memory card id (`_id`, "card-<n>"). That id is
 * stable while a draft is edited, moved, added to or removed from (the stamps are rebuilt from the ids in their current order),
 * and new after a save, reload or discard (the draft is rebuilt then). The public components draw exactly the cards in the
 * content they are given, in order, so a node's position among its siblings is its card's position in the draft.
 *
 * Left unstamped on purpose: the value number badge, a feature's number, and (no node exists for them) the closing button's
 * destination and a feature icon's size and scale (each has a stamped control only).
 */
export const ABOUT_TARGETS = {
  heroHeading: editTarget("about", "hero", "heading"),
  storyImage: editTarget("about", "story", "image"),
  valuesHeading: editTarget("about", "values", "heading"),
  closingText: editTarget("about", "closing", "text"),
  closingButtonLabel: editTarget("about", "closing", "buttonLabel"),
  closingDestination: editTarget("about", "closing", "destination"),
  imagesAnnotated: editTarget("about", "images", "annotated"),
  imagesMap: editTarget("about", "images", "map"),
} as const;

export const storyParagraphTarget = (index: number): EditTargetId => editTarget("about", "story", "paragraph", index);
export type ValueField = "title" | "description";
export const valueTarget = (cardId: string, field: ValueField): EditTargetId => editTarget("about", "values", field, cardId);
export type FeatureField = "title" | "description" | "patch" | "icon" | "iconSize" | "iconScale";
export const featureTarget = (cardId: string, field: FeatureField): EditTargetId => editTarget("about", "features", field, cardId);
export type ColorField = "label" | "image";
export const colorTarget = (cardId: string, field: ColorField): EditTargetId => editTarget("about", "colors", field, cardId);

const fixed = (id: EditTargetId) => () => id;
const section = (id: string) => `[data-about-editor-section="${id}"]`;

/** The position of `child` among the siblings `counts` accepts, or -1. */
function positionAmong(child: Element | null, counts: (sibling: Element) => boolean): number {
  const parent = child?.parentElement;
  return child && parent ? Array.from(parent.children).filter(counts).indexOf(child) : -1;
}

/** Where each field of one card shows on the public page, as rendered by components/cinematic/CinematicAbout and CinematicCrest. */
export function aboutPreviewStamps(drafts: AboutDrafts, id: SectionId): EditTargetStamp[] {
  const { about, logo } = drafts;
  const byIndex = (ids: readonly string[], target: (cardId: string) => EditTargetId) => (_: Element, index: number) => index < ids.length ? target(ids[index]) : null;
  switch (id) {
    case "hero": return [
      { selector: `${section("hero")} > h1`, target: fixed(ABOUT_TARGETS.heroHeading) },
    ];
    case "story": return [
      { selector: `${section("story")} .about-paragraphs > p`, target: (_, index) => index < about.story_paragraphs.length ? storyParagraphTarget(index) : null },
      { selector: `${section("story")} > img.about-photo`, target: fixed(ABOUT_TARGETS.storyImage) },
    ];
    case "values": {
      const ids = about.values.map(value => value._id);
      return [
        { selector: `${section("values")} > h2`, target: fixed(ABOUT_TARGETS.valuesHeading) },
        { selector: `${section("values")} .about-values-grid > article > h3`, target: byIndex(ids, cardId => valueTarget(cardId, "title")) },
        { selector: `${section("values")} .about-values-grid > article > p`, target: byIndex(ids, cardId => valueTarget(cardId, "description")) },
      ];
    }
    case "closing": return [
      { selector: `${section("closing")} > h2`, target: fixed(ABOUT_TARGETS.closingText) },
      { selector: `${section("closing")} > a.about-schedule`, target: fixed(ABOUT_TARGETS.closingButtonLabel) },
    ];
    case "images": return [
      { selector: `.crest-diagram${section("images")}`, target: fixed(ABOUT_TARGETS.imagesAnnotated) },
      { selector: `.identity-map${section("images")}`, target: fixed(ABOUT_TARGETS.imagesMap) },
    ];
    case "features": {
      const ids = logo.features.map(feature => feature._id);
      // A feature has no icon node unless it has an icon, so these find their card by the article they sit in, not by their own index.
      const ofCard = (field: FeatureField) => (element: Element) => {
        const cardId = ids[positionAmong(element.closest(".identity-feature"), sibling => sibling.classList.contains("identity-feature"))];
        return cardId ? featureTarget(cardId, field) : null;
      };
      return [
        { selector: ".identity-features > article.identity-feature .feature-patch", target: ofCard("patch") },
        { selector: ".identity-features > article.identity-feature .feature-heading > h2", target: ofCard("title") },
        { selector: ".identity-features > article.identity-feature .feature-heading > .feature-icon", target: ofCard("icon") },
        { selector: ".identity-features > article.identity-feature .feature-copy > p", target: ofCard("description") },
      ];
    }
    case "colors": {
      const ids = logo.color_cards.map(card => card._id);
      const ofCard = (field: ColorField) => (element: Element) => {
        const cardId = ids[positionAmong(element.parentElement, sibling => sibling.hasAttribute("data-about-editor-section"))];
        return cardId ? colorTarget(cardId, field) : null;
      };
      return [
        { selector: `.identity-colors > div${section("colors")}`, target: byIndex(ids, cardId => colorTarget(cardId, "image")) },
        { selector: `.identity-colors > div${section("colors")} > p.identity-empty`, target: ofCard("label") },
      ];
    }
  }
}
