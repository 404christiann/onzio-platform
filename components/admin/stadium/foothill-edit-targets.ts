import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import type { StadiumContent } from "@/lib/stadium-content";
import type { FoothillSectionId } from "./foothill-sections";

/**
 * Click-to-field for the Foothill Transit editor (UI-PREVIEW-CLICK-VISITOR-2). The ids are declared in EDIT_TARGET_REGISTRY
 * ("foothill"); FoothillSectionFields stamps them on the dialog controls, and foothillPreviewStamps puts the same ids on the
 * public nodes inside a section card's preview only (never on the public page). The match card's fixture, date and venue come
 * from Schedule, its heading and button from Homepage and its purchase link from Tickets, so they carry no id: a click there
 * opens the section as before. The Phone map card has no text on the page to click.
 */
export const FOOTHILL_TARGETS = {
  headingTitle: editTarget("foothill", "heading", "title"),
  headingSubtitle: editTarget("foothill", "heading", "subtitle"),
  imagesBusImageAlt: editTarget("foothill", "images", "busImageAlt"),
  imagesMapImageAlt: editTarget("foothill", "images", "mapImageAlt"),
  matchPartnerImageAlt: editTarget("foothill", "match", "partnerImageAlt"),
  benefitsHeading: editTarget("foothill", "benefits", "heading"),
  benefitsFootnote: editTarget("foothill", "benefits", "footnote"),
} as const;

/** Benefits have no id of their own, so they are keyed by their position in the list. */
export const benefitTitleTarget = (index: number): EditTargetId => editTarget("foothill", "benefits", "title", index);
export const benefitDetailTarget = (index: number): EditTargetId => editTarget("foothill", "benefits", "detail", index);

/** A page block's own fields, keyed by its stable id. Its bullets are `<id>-b<n>`. */
export const sectionHeadingTarget = (blockId: string): EditTargetId => editTarget("foothill", "sections", "heading", blockId);
export const sectionBodyTarget = (blockId: string): EditTargetId => editTarget("foothill", "sections", "body", blockId);
export const sectionNoteTarget = (blockId: string): EditTargetId => editTarget("foothill", "sections", "note", blockId);
export const sectionBulletTarget = (blockId: string, index: number): EditTargetId => editTarget("foothill", "sections", "bullet", `${blockId}-b${index}`);

const fixed = (id: EditTargetId) => () => id;
/** Position of a node among its siblings. */
const indexIn = (node: Element | null) => node?.parentElement ? Array.from(node.parentElement.children).indexOf(node) : -1;

/**
 * The blocks CinematicStadium renders, in order: only the visible ones, one div each, so a div's position among
 * `.robinson-directions > div` is its position in the visible list. Each block's heading, body, note and bullets are found
 * from their own block's div, so a block with no heading or no bullets never shifts the others.
 */
function sectionsStamps(content: StadiumContent): EditTargetStamp[] {
  const visible = content.sections.filter(section => section.visible);
  const block = (div: Element | null | undefined) => visible[indexIn(div ?? null)];
  return [
    { selector: ".robinson-directions > div > h2", target: element => { const section = block(element.parentElement); return section ? sectionHeadingTarget(section.id) : null; } },
    { selector: ".robinson-directions > div > p:not(.robinson-parking-note)", target: element => { const section = block(element.parentElement); return section ? sectionBodyTarget(section.id) : null; } },
    { selector: ".robinson-directions > div > p.robinson-parking-note > em", target: element => { const section = block(element.parentElement?.parentElement); return section ? sectionNoteTarget(section.id) : null; } },
    { selector: ".robinson-directions > div > ul > li", target: element => {
      const section = block(element.parentElement?.parentElement), bullet = indexIn(element);
      return section && bullet >= 0 && bullet < section.bullets.length ? sectionBulletTarget(section.id, bullet) : null;
    } },
  ];
}

/** Where each field of one card shows on the public page, as rendered by components/cinematic/CinematicStadium. */
export function foothillPreviewStamps(content: StadiumContent, section: FoothillSectionId): EditTargetStamp[] {
  switch (section) {
    // The Page heading card shows the bus too, but the bus picture is edited on the images card, so it is not this card's.
    case "heading": return [
      { selector: ".robinson-heading > div > h1", target: fixed(FOOTHILL_TARGETS.headingTitle) },
      { selector: ".robinson-heading > div > p", target: fixed(FOOTHILL_TARGETS.headingSubtitle) },
    ];
    // The images card shows the heading text too (the bus sits beside it), which is the heading card's.
    case "images": return [
      { selector: ".robinson-heading > img", target: fixed(FOOTHILL_TARGETS.imagesBusImageAlt) },
      { selector: ".robinson-route > img", target: fixed(FOOTHILL_TARGETS.imagesMapImageAlt) },
    ];
    case "map": return [];
    // Only the partner logo is the owner's here. The fixture, date and venue are Schedule's, the heading and button Homepage's, the link Tickets'.
    case "match": return [{ selector: ".robinson-match > img.robinson-chick", target: fixed(FOOTHILL_TARGETS.matchPartnerImageAlt) }];
    case "benefits": return [
      { selector: ".robinson-includes > h2", target: fixed(FOOTHILL_TARGETS.benefitsHeading) },
      { selector: ".robinson-includes > div > h3", target: (_, index) => index < content.benefits.length ? benefitTitleTarget(index) : null },
      { selector: ".robinson-includes > div > p", target: (_, index) => index < content.benefits.length ? benefitDetailTarget(index) : null },
      { selector: ".robinson-includes > p.robinson-ticket-note > em", target: fixed(FOOTHILL_TARGETS.benefitsFootnote) },
    ];
    case "sections": return sectionsStamps(content);
  }
}
