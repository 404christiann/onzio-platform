import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { ChickFilACardId } from "./chick-fil-a-sections";

/**
 * Click-to-field for the Chick-fil-A editor (UI-PREVIEW-CLICK-VISITOR-2). The ids are declared in EDIT_TARGET_REGISTRY
 * ("chickFilA"); ChickFilASectionFields stamps them on the dialog controls, and chickFilAPreviewStamps puts the same ids on
 * the public nodes inside a card's preview only (never on the public page). The match card's fixture, date and venue come
 * from Schedule, its heading and button from Homepage and its purchase link from Tickets, so they carry no id: a click there
 * opens the card as before.
 */
export const CHICK_FIL_A_TARGETS = {
  headingTitle: editTarget("chickFilA", "heading", "title"),
  headingSubtitle: editTarget("chickFilA", "heading", "subtitle"),
  detailsHeading: editTarget("chickFilA", "details", "heading"),
  detailsBody: editTarget("chickFilA", "details", "body"),
  detailsMealPassImageAlt: editTarget("chickFilA", "details", "mealPassImageAlt"),
  mapImageAlt: editTarget("chickFilA", "map", "imageAlt"),
  matchPartnerImageAlt: editTarget("chickFilA", "match", "partnerImageAlt"),
  restaurantImageAlt: editTarget("chickFilA", "restaurant", "imageAlt"),
  backgroundImageAlt: editTarget("chickFilA", "background", "imageAlt"),
} as const;

/** The three steps are keyed by their position. */
export const stepLabelTarget = (step: number): EditTargetId => editTarget("chickFilA", "steps", "label", step);
export const stepNumberTarget = (step: number): EditTargetId => editTarget("chickFilA", "steps", "number", step);
export const stepIconAltTarget = (step: number): EditTargetId => editTarget("chickFilA", "steps", "iconAlt", step);

const fixed = (id: EditTargetId) => () => id;
/** A step's own li, so a step without a picture never shifts the others. */
const byStep = (build: (step: number) => EditTargetId, depth: 1 | 2) => (element: Element) => {
  const li = depth === 1 ? element.parentElement : element.parentElement?.parentElement;
  const step = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : -1;
  return step >= 0 && step < 3 ? build(step) : null;
};

/** Where each field of one card shows on the public page, as rendered by components/cinematic/CinematicChickFilA. */
export function chickFilAPreviewStamps(card: ChickFilACardId): EditTargetStamp[] {
  switch (card) {
    case "heading": return [
      { selector: ".food-heading > h1", target: fixed(CHICK_FIL_A_TARGETS.headingTitle) },
      { selector: ".food-heading > p", target: fixed(CHICK_FIL_A_TARGETS.headingSubtitle) },
    ];
    case "details": return [
      { selector: ".food-details > img.food-meal-pass", target: fixed(CHICK_FIL_A_TARGETS.detailsMealPassImageAlt) },
      { selector: ".food-details > div > h2", target: fixed(CHICK_FIL_A_TARGETS.detailsHeading) },
      { selector: ".food-details > div > p", target: fixed(CHICK_FIL_A_TARGETS.detailsBody) },
    ];
    case "steps": return [
      { selector: ".food-steps > ol > li > p", target: byStep(stepLabelTarget, 1) },
      { selector: ".food-steps > ol > li > span", target: byStep(stepNumberTarget, 1) },
      { selector: ".food-steps > ol > li > .food-step-icon > img", target: byStep(stepIconAltTarget, 2) },
    ];
    case "map": return [{ selector: ".food-map > img", target: fixed(CHICK_FIL_A_TARGETS.mapImageAlt) }];
    // Only the partner logo is the owner's here. The fixture, date and venue are Schedule's, the heading and button Homepage's, the link Tickets'.
    case "match": return [{ selector: ".food-match > img.food-chick-logo", target: fixed(CHICK_FIL_A_TARGETS.matchPartnerImageAlt) }];
    case "restaurant": return [{ selector: ".food-restaurant > img", target: fixed(CHICK_FIL_A_TARGETS.restaurantImageAlt) }];
    // The seat background is painted behind the match card (a CSS background, not an img), so the whole band is its node.
    case "background": return [{ selector: ".food-match-area", target: fixed(CHICK_FIL_A_TARGETS.backgroundImageAlt) }];
  }
}
