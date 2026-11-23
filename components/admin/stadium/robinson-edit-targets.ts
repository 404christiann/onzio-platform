import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { RobinsonBlock, RobinsonContent } from "@/lib/cinematic-robinson-content";
import type { RobinsonSectionId } from "./robinson-sections";

/**
 * Click-to-field for the Robinson Stadium editor (UI-PREVIEW-CLICK-VISITOR-1). The ids are declared in
 * EDIT_TARGET_REGISTRY ("robinson"); RobinsonSectionFields stamps them on the dialog controls, and
 * robinsonPreviewStamps puts the same ids on the public nodes inside a section card's preview only (never on the
 * public page). The match card's fixture, date and venue come from Schedule and its heading and button from Homepage,
 * so they carry no id: a click there opens the section as before.
 */
export const ROBINSON_TARGETS = {
  headingTitle: editTarget("robinson", "heading", "title"),
  headingSubtitle: editTarget("robinson", "heading", "subtitle"),
  seatingImageAlt: editTarget("robinson", "seating", "imageAlt"),
  seatingCaption: editTarget("robinson", "seating", "caption"),
  seatingExpandLabel: editTarget("robinson", "seating", "expandLabel"),
  storyQuote: editTarget("robinson", "story", "quote"),
  storyAttribution: editTarget("robinson", "story", "attribution"),
  infoHeading: editTarget("robinson", "info", "heading"),
  infoNote: editTarget("robinson", "info", "note"),
  matchPartnerImageAlt: editTarget("robinson", "match", "partnerImageAlt"),
  lockersImageAlt: editTarget("robinson", "lockers", "imageAlt"),
  foodHeading: editTarget("robinson", "food", "heading"),
  foodBody: editTarget("robinson", "food", "body"),
  foodMealPassImageAlt: editTarget("robinson", "food", "mealPassImageAlt"),
  routeHeading: editTarget("robinson", "route", "heading"),
  routeSubheading: editTarget("robinson", "route", "subheading"),
  routeBusImageAlt: editTarget("robinson", "route", "busImageAlt"),
  routeMapImageAlt: editTarget("robinson", "route", "mapImageAlt"),
} as const;

/** Rows without an id of their own are keyed by their position in the list. */
export const storyParagraphTarget = (index: number): EditTargetId => editTarget("robinson", "story", "paragraph", index);
export const infoLabelTarget = (index: number): EditTargetId => editTarget("robinson", "info", "label", index);
export const infoValueTarget = (index: number): EditTargetId => editTarget("robinson", "info", "value", index);
export const foodStepLabelTarget = (step: number): EditTargetId => editTarget("robinson", "food", "label", step);
export const foodStepIconAltTarget = (step: number): EditTargetId => editTarget("robinson", "food", "iconAlt", step);

/** A Directions block's own fields, keyed by its stable id. Its paragraphs and bullets are `<id>-p<n>` and `<id>-b<n>`. */
export const directionsHeadingTarget = (blockId: string): EditTargetId => editTarget("robinson", "directions", "heading", blockId);
export const directionsNoteTarget = (blockId: string): EditTargetId => editTarget("robinson", "directions", "note", blockId);
export const directionsClosingTarget = (blockId: string): EditTargetId => editTarget("robinson", "directions", "closing", blockId);
export const directionsParagraphTarget = (blockId: string, index: number): EditTargetId => editTarget("robinson", "directions", "paragraph", `${blockId}-p${index}`);
export const directionsBulletTarget = (blockId: string, index: number): EditTargetId => editTarget("robinson", "directions", "bullet", `${blockId}-b${index}`);

const fixed = (id: EditTargetId) => () => id;
/** Position of the element's parent among its siblings: a row's own wrapper, so a row without an image never shifts the others. */
const byRow = (build: (index: number) => EditTargetId) => (element: Element) => {
  const row = element.parentElement;
  const index = row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : -1;
  return index >= 0 ? build(index) : null;
};

type FlatNode = { tag: "h3" | "p" | "ul"; id: EditTargetId | null };
/**
 * What CinematicRobinson's DirectionsBlock renders for each block, in order, as flat siblings of `.r-directions`:
 * the heading (only when it has words), one p per paragraph, the italic note, then either a ul (whose last li carries the
 * closing line in a span) or, with no bullets, the closing line as its own p. Built from the draft's block sequence, so
 * a block with no heading or no bullets still lines up, and each id follows its block's stable id.
 */
export function directionsSequence(blocks: readonly RobinsonBlock[]) {
  const flat: FlatNode[] = [], bullets: EditTargetId[] = [], closings: EditTargetId[] = [];
  for (const block of blocks) {
    if (block.heading) flat.push({ tag: "h3", id: directionsHeadingTarget(block.id) });
    block.paragraphs.forEach((_, index) => flat.push({ tag: "p", id: directionsParagraphTarget(block.id, index) }));
    if (block.note) flat.push({ tag: "p", id: directionsNoteTarget(block.id) });
    if (block.bullets.length > 0) {
      flat.push({ tag: "ul", id: null });
      block.bullets.forEach((_, index) => bullets.push(directionsBulletTarget(block.id, index)));
      if (block.closing) closings.push(directionsClosingTarget(block.id));
    } else if (block.closing) flat.push({ tag: "p", id: directionsClosingTarget(block.id) });
  }
  return { flat, bullets, closings };
}

function directionsStamps(content: RobinsonContent): EditTargetStamp[] {
  const { flat, bullets, closings } = directionsSequence(content.directions.blocks);
  return [
    // The tag check keeps a stamp off a node that is not the one the draft says is at that position.
    { selector: ".r-directions > h3, .r-directions > p, .r-directions > ul", target: (element, index) => flat[index]?.tag === element.tagName.toLowerCase() ? flat[index].id : null },
    { selector: ".r-directions > ul > li", target: (_, index) => bullets[index] ?? null },
    { selector: ".r-directions > ul > li > .r-route-planner", target: (_, index) => closings[index] ?? null },
  ];
}

/** Where each field of one section shows on the public page, as rendered by components/cinematic/CinematicRobinson. */
export function robinsonPreviewStamps(content: RobinsonContent, section: RobinsonSectionId): EditTargetStamp[] {
  switch (section) {
    case "heading": return [
      { selector: ".r-heading > h1", target: fixed(ROBINSON_TARGETS.headingTitle) },
      { selector: ".r-heading > p", target: fixed(ROBINSON_TARGETS.headingSubtitle) },
    ];
    case "seating": return [
      { selector: ".r-seating > img", target: fixed(ROBINSON_TARGETS.seatingImageAlt) },
      { selector: ".r-seating > a.r-map-expand", target: fixed(ROBINSON_TARGETS.seatingExpandLabel) },
      { selector: ".r-seating > figcaption", target: fixed(ROBINSON_TARGETS.seatingCaption) },
    ];
    case "story": return [
      { selector: ".r-story > p", target: (_, index) => index < content.story.paragraphs.length ? storyParagraphTarget(index) : null },
      { selector: ".r-story > blockquote > p", target: fixed(ROBINSON_TARGETS.storyQuote) },
      { selector: ".r-story > blockquote > footer", target: fixed(ROBINSON_TARGETS.storyAttribution) },
    ];
    case "info": return [
      { selector: ".r-info-card > h2", target: fixed(ROBINSON_TARGETS.infoHeading) },
      { selector: ".r-info-card > .r-info-note", target: fixed(ROBINSON_TARGETS.infoNote) },
      { selector: ".r-info-card dl > div > dt", target: byRow(infoLabelTarget) },
      { selector: ".r-info-card dl > div > dd", target: byRow(infoValueTarget) },
    ];
    // Only the partner logo is the owner's here. The fixture, date and venue are Schedule's, the heading and button Homepage's.
    case "match": return [{ selector: "img.robinson-chick", target: fixed(ROBINSON_TARGETS.matchPartnerImageAlt) }];
    case "lockers": return [{ selector: ".r-locker-divider > img", target: fixed(ROBINSON_TARGETS.lockersImageAlt) }];
    case "food": return [
      { selector: ".r-food-title-row > h2", target: fixed(ROBINSON_TARGETS.foodHeading) },
      { selector: ".r-food-body > img", target: fixed(ROBINSON_TARGETS.foodMealPassImageAlt) },
      { selector: ".r-food-body > p", target: fixed(ROBINSON_TARGETS.foodBody) },
      { selector: ".r-food-steps > div > p", target: byRow(foodStepLabelTarget) },
      { selector: ".r-food-steps > div > img", target: byRow(foodStepIconAltTarget) },
    ];
    case "route": return [
      { selector: ".r-route-heading > div > h2", target: fixed(ROBINSON_TARGETS.routeHeading) },
      { selector: ".r-route-heading > div > p", target: fixed(ROBINSON_TARGETS.routeSubheading) },
      { selector: ".r-route-heading > img", target: fixed(ROBINSON_TARGETS.routeBusImageAlt) },
      { selector: ".r-route > img.r-route-map", target: fixed(ROBINSON_TARGETS.routeMapImageAlt) },
    ];
    case "directions": return directionsStamps(content);
  }
}
