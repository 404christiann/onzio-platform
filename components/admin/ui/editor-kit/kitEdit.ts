/**
 * Marks the control that opens an editor dialog. The kit puts it on every Edit
 * button it renders (PreviewCards footer and preview overlay, SectionCards).
 * Pages that make their own clickable part open the same dialog, such as
 * numbered homepage parts or shop kit parts, spread KIT_EDIT_PROPS onto that
 * element so the verify-rc-admin skill (and any test) can find "the thing that
 * opens an editor" without knowing the page. Behaviour never reads it.
 */
export const KIT_EDIT_ATTRIBUTE = "data-kit-edit";
/** CSS selector for KIT_EDIT_ATTRIBUTE. */
export const KIT_EDIT_SELECTOR = `[${KIT_EDIT_ATTRIBUTE}]`;
/** Spread onto a button or other clickable that opens an editor dialog: <button {...KIT_EDIT_PROPS}>. */
export const KIT_EDIT_PROPS = { [KIT_EDIT_ATTRIBUTE]: "" } as const;
