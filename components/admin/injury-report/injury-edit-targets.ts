import { editTarget, editTargetRowId, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { entryDialogId, parseInjuryDialogId, type InjuryBlock } from "./injury-sections";

/**
 * Click-to-field for the Injury Report editor (UI-PREVIEW-CLICK-LIST-1). The ids are declared in EDIT_TARGET_REGISTRY
 * ("injuryReport"); InjuryDialogFields stamps them on the dialog controls, and the *Stamps below put the same ids on the public
 * nodes inside a card's preview only (never on the public page).
 *
 * `presenter` and `rehab` are the page-part cards and their registry sections. Every injury is the one section `entry`, its
 * fields keyed by the entry's row uuid (the dialog id is `entry:<uuid>`; the registry is static).
 *
 * Left unstamped on purpose: everything an injury card shows about the player (name, number, position, photo) is Roster's, and
 * the page's own title and "Presented by" are fixed; the photo's description (`bandAlt`, only the image's alt text: the click
 * on the picture opens its photo control) and the presenter's name once a logo is set (only the logo's alt text) have no node of
 * their own. Their controls are stamped.
 */
export type InjuryBlockField = "name" | "logo" | "band" | "bandAlt" | "heading" | "quote" | "quoteAttribution" | "videoUrl";
export type InjuryEntryField = "injury" | "timeline" | "note";

export const INJURY_TARGETS = {
  presenterName: editTarget("injuryReport", "presenter", "name"),
  presenterLogo: editTarget("injuryReport", "presenter", "logo"),
  rehabBand: editTarget("injuryReport", "rehab", "band"),
  rehabBandAlt: editTarget("injuryReport", "rehab", "bandAlt"),
  rehabHeading: editTarget("injuryReport", "rehab", "heading"),
  rehabQuote: editTarget("injuryReport", "rehab", "quote"),
  rehabQuoteAttribution: editTarget("injuryReport", "rehab", "quoteAttribution"),
  rehabVideoUrl: editTarget("injuryReport", "rehab", "videoUrl"),
} as const;

export const injuryEntryTarget = (entryId: string, field: InjuryEntryField): EditTargetId => editTarget("injuryReport", "entry", field, entryId);

/** Whether a declared field belongs to the card with this dialog id: its own part's fields, or its own entry's row. */
export function injuryOwnsTarget(dialogId: string, target: ResolvedEditTarget): boolean {
  const parsed = parseInjuryDialogId(dialogId);
  if (!parsed) return false;
  return parsed.kind === "block"
    ? target.editor === "injuryReport" && target.section === parsed.block && target.row === undefined
    : target.editor === "injuryReport" && target.section === "entry" && target.row === editTargetRowId(parsed.id);
}

const fixed = (id: EditTargetId) => () => id;

/** Where each field of a page-part card shows on the public page, as rendered by components/cinematic/CinematicInjuryReport. */
export function injuryBlockStamps(block: InjuryBlock): EditTargetStamp[] {
  if (block === "presenter") return [
    { selector: ".injury-heading > .injury-presenter > img.injury-presenter-logo", target: fixed(INJURY_TARGETS.presenterLogo) },
    { selector: ".injury-heading > .injury-presenter > span.injury-presenter-name", target: fixed(INJURY_TARGETS.presenterName) },
  ];
  return [
    { selector: ".cinematic-injury > img.injury-band", target: fixed(INJURY_TARGETS.rehabBand) },
    { selector: ".cinematic-injury > .injury-rehab > h2", target: fixed(INJURY_TARGETS.rehabHeading) },
    { selector: ".cinematic-injury > .injury-quote > blockquote > p", target: fixed(INJURY_TARGETS.rehabQuote) },
    { selector: ".cinematic-injury > .injury-quote > figcaption", target: fixed(INJURY_TARGETS.rehabQuoteAttribution) },
    { selector: ".cinematic-injury > .injury-video", target: fixed(INJURY_TARGETS.rehabVideoUrl) },
  ];
}

/** Where one entry's own fields show on its card (one injury drawn by the public card), keyed by the entry's row uuid. */
export function injuryEntryStamps(entryId: string): EditTargetStamp[] {
  const fields: InjuryEntryField[] = ["injury", "timeline"];
  return [
    { selector: ".injury-list > .injury-card > .injury-info > .injury-details > p", target: (_, index) => fields[index] ? injuryEntryTarget(entryId, fields[index]) : null },
    { selector: ".injury-list > .injury-card > .injury-info > .injury-note", target: fixed(injuryEntryTarget(entryId, "note")) },
  ];
}

/** The stamps of the two page-part cards, by the card's dialog id. Fixed: where a part's fields sit in its card does not depend on the draft. */
export function injuryBlockStampsByCard(): Map<string, EditTargetStamp[]> {
  return new Map((["presenter", "rehab"] as const).map(block => [block as string, injuryBlockStamps(block)]));
}

/** The stamps of every injury card, by the card's dialog id, each keyed by that entry's own uuid (not by its position). */
export function injuryStampsByCard(entries: readonly { id: string }[]): Map<string, EditTargetStamp[]> {
  return new Map(entries.map(entry => [entryDialogId(entry.id) as string, injuryEntryStamps(entry.id)]));
}
