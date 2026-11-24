import { editTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { CONTACT_ACTIONS, type ContactAction } from "@/lib/cinematic-contact-content";
import type { ContactSectionId } from "./contact-sections";

/**
 * Click-to-field for Rose City's Contact editor (UI-PREVIEW-CLICK-ABOUT-CONTACT-POLICIES). The ids are declared in
 * EDIT_TARGET_REGISTRY ("contact", lib/edit-targets/about-contact-policies.ts); ContactSectionFields stamps them on the dialog
 * controls, and contactPreviewStamps puts the same ids on the public nodes inside a card's preview only.
 *
 * Every card renders the whole public Contact page and hides the heading and the other four rows with CSS (ContactEditor.module.css
 * `.only`), so a card's stamps reach only its own row's nodes. CinematicContact draws one `.contact-row` for every entry of
 * CONTACT_ACTIONS, in that order, when it is given no page-visibility map (every preview here), so a row node's position is its
 * action's position. Only the public page passes the map, and it may then leave out a row whose page the owner hid.
 *
 * The Information row's destination is the link behind its button; the button's words are its `action`, so the button is the
 * `action` node and the destination has a stamped control and no node of its own.
 */
export const CONTACT_TARGETS = {
  title: editTarget("contact", "heading", "title"),
  subtitle: editTarget("contact", "heading", "subtitle"),
} as const;
export type ContactRowField = "prompt" | "action" | "destination";
export const contactRowTarget = (action: ContactAction, field: ContactRowField): EditTargetId => editTarget("contact", action, field);

const fixed = (id: EditTargetId) => () => id;
/** The position of a node's `.contact-row` among the page's rows. */
const rowIndexOf = (element: Element) => {
  const row = element.parentElement;
  return row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : -1;
};

/** Where each field of one card shows on the public page, as rendered by components/cinematic/CinematicContact. */
export function contactPreviewStamps(id: ContactSectionId): EditTargetStamp[] {
  if (id === "heading") return [
    { selector: ".contact-heading > div > h1", target: fixed(CONTACT_TARGETS.title) },
    { selector: ".contact-heading > div > p", target: fixed(CONTACT_TARGETS.subtitle) },
  ];
  const own = CONTACT_ACTIONS.indexOf(id);
  const ofRow = (field: ContactRowField) => (element: Element) => rowIndexOf(element) === own ? contactRowTarget(id, field) : null;
  return [
    { selector: ".contact-actions > .contact-row > span:not(.contact-pending)", target: ofRow("prompt") },
    // The button is a link, or (Information with no destination yet) a grey "Link pending" box.
    { selector: ".contact-actions > .contact-row > a", target: ofRow("action") },
    { selector: ".contact-actions > .contact-row > span.contact-pending", target: ofRow("action") },
  ];
}
