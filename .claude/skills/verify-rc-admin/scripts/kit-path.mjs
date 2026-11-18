// Pure decisions behind the spec's kit-aware editor opening (pinned by verify.test.mjs).
// A "kit editor" (PreviewCards / SectionCards + EditorDialog) has no text field on the page: its
// fields live in a dialog opened by an Edit control marked data-kit-edit (components/admin/ui/editor-kit/kitEdit.ts).

export const KIT_EDIT_SELECTOR = "[data-kit-edit]";   // keep equal to KIT_EDIT_SELECTOR in the kit (a unit test checks)
export const KIT_DIALOG_SELECTOR = "[role=dialog]:has([data-editor-dialog])";
export const KIT_DONE_SELECTOR = "[data-editor-dialog-done]";
export const KIT_FIELD_SELECTOR = "input:not([type]), input[type=text], textarea";
// Text only: never a switch (role=switch button), a crop slider (type=range), a number or a file input. Fields inside the
// inert live preview column are not editable and never count.
const OUTSIDE_PREVIEW = ":not([data-editor-dialog-preview] *)";
/** Editable text fields of the dialog's active section (:enabled also honours a disabled fieldset, which is how a locked kit form reads). */
export const KIT_ENABLED_FIELD_SELECTOR = KIT_FIELD_SELECTOR.split(",").map((part) => `${part.trim()}:enabled:not([readonly])${OUTSIDE_PREVIEW}`).join(", ");
/** The same fields enabled or not, so a pinned field keeps its position while the form is locked. */
export const KIT_ANY_FIELD_SELECTOR = KIT_FIELD_SELECTOR.split(",").map((part) => `${part.trim()}${OUTSIDE_PREVIEW}`).join(", ");
/** Containers the kit's list fields render. */
export const KIT_LIST_SELECTOR = "[data-string-list], [data-object-list], [data-table-editor]";
/** EditorDialog switches to the full-screen sheet below this width (EDITOR_DIALOG_PHONE_QUERY). */
export const KIT_PHONE_MAX_WIDTH = 767;
export const isPhoneWidth = (width) => width <= KIT_PHONE_MAX_WIDTH;
/** How long an editor that needs a custom `open` click gets to show a kit Edit control before the row's own open runs. */
export const KIT_WAIT_MS = 5_000;

/**
 * Which way to open an editor. `kit` wins whenever a kit Edit control is visible in main, whatever the row
 * says: a row's open/field/beforeSave target the old UI. Anything else (including a timeout) is the row path,
 * so an old UI behaves exactly as before.
 * @param {"kit" | "row" | "none"} winner what became visible first
 * @returns {"kit" | "row"}
 */
export function chooseOpenPath(winner) {
  return winner === "kit" ? "kit" : "row";
}

/**
 * What the retry step asserts on a pending save.
 * Old UI: the pinned field on the page is disabled.
 * Kit: the dialog is closed while Save is pending, so the form lock is read from the controls.
 *   Pass when every visible Edit control is disabled; otherwise reopen the dialog and its field must be disabled.
 * @param {"kit" | "row"} path
 * @param {{ editControls: number, editControlsDisabled: number }} seen
 * @returns {"field" | "edit-controls" | "reopen-dialog-field"}
 */
export function retryLockCheck(path, seen) {
  if (path !== "kit") return "field";
  return seen.editControls > 0 && seen.editControlsDisabled === seen.editControls ? "edit-controls" : "reopen-dialog-field";
}

/**
 * Order in which to look for a section with an enabled text field. The section the clicked part opened is
 * tried first (activeIndex, or -1 when unknown, as on the phone sheet which opens straight into a section),
 * then every other section top to bottom. The first with a field wins; none means the editor has no text field to edit.
 * @param {number} count
 * @param {number} activeIndex
 * @returns {number[]}
 */
export function sectionTryOrder(count, activeIndex) {
  const all = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  return activeIndex >= 0 && activeIndex < count ? [activeIndex, ...all.filter((i) => i !== activeIndex)] : all;
}

/**
 * Light checks on a kit list field (StringListField, ObjectListField, TableEditor) around the first edit.
 * `before`/`after` are what the page showed: the number of Remove buttons (one per item), the Add button's
 * disabled state, the limit line ("3 of 8 items." or "Maximum of 8 items reached.") and each Remove's disabled state.
 * @param {{ items: number, addDisabled: boolean, limit: string, removeDisabled: boolean[] }} before
 * @param {{ items: number }} after
 * @returns {string[]} problems; empty is a pass
 */
export function listProblems(before, after) {
  const problems = [];
  if (after.items !== before.items) problems.push(`editing a field changed the item count from ${before.items} to ${after.items}`);
  const atMax = /^Maximum of \d+ /.test(before.limit.trim());
  const counted = /^(\d+) of (\d+) /.exec(before.limit.trim());
  if (atMax && !before.addDisabled) problems.push("Add is enabled at the maximum");
  if (counted && Number(counted[1]) < Number(counted[2]) && before.addDisabled) problems.push("Add is disabled below the maximum");
  if (before.removeDisabled.length && new Set(before.removeDisabled).size > 1) problems.push("some Remove buttons are disabled and others are not (disabled means at the minimum, which is the same for every item)");
  return problems;
}

/**
 * Phone sheet vs the fixed bottom Save bar. While the sheet is open the bar must be hidden or underneath it
 * (the topmost element at the bar's centre is not the bar); after Done it must be back on top.
 * @param {{ openTopIsBar: boolean, closedBarVisible: boolean, closedTopIsBar: boolean }} seen
 * @returns {string[]}
 */
export function sheetBarProblems(seen) {
  const problems = [];
  if (seen.openTopIsBar) problems.push("the Save bar covers the sheet while it is open");
  if (!seen.closedBarVisible || !seen.closedTopIsBar) problems.push("the Save bar did not come back after Done");
  return problems;
}

/**
 * Can the test append " ·tag" to this field and still save? A web address, an email, a phone number, a slug or a
 * path breaks validation (an "External forms" card is full of URLs),
 * so such a field is skipped for the next one. (An image's description is NOT skipped: if saving it fails, the page is wrong.)
 * @param {{ value: string, label: string }} field
 */
export function isMarkable(field) {
  if (/^\s*(https?:|mailto:|tel:|\/|#)/i.test(field.value)) return false;
  return !/\b(url|link|href|e-?mail|phone|tel|slug|handle|website|domain)\b/i.test(field.label);
}
/** Index of the first field the test may edit, or -1. @param {{ value: string, label: string }[]} fields */
export const firstMarkableIndex = (fields) => fields.findIndex(isMarkable);
