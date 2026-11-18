import type { SaveState } from "../useSaveState";

/**
 * What the page-frame Save button can show. The first four come from
 * useSaveState. The last three describe a save that did not complete and keep
 * the edits on the page until the editor's existing flow resolves them:
 *   retry    an earlier save is awaiting confirmation: "Retry same save" re-sends that exact save
 *   error    the save failed; Save sends the draft again
 *   conflict the page changed elsewhere: hand off to "Load latest and keep my edits" / "Reload saved page"
 */
export type PageSaveState = SaveState | "retry" | "error" | "conflict";

export type PageSaveFailure = "retry" | "error" | "conflict";

export const PAGE_SAVE_STATES = ["clean", "dirty", "saving", "saved", "retry", "error", "conflict"] as const satisfies readonly PageSaveState[];

/**
 * Combine useSaveState's state with the editor's failure flag. A running save
 * always wins so Saving shows while a retry is in flight. A failure then wins
 * over dirty/clean/saved so it cannot be hidden by a later edit.
 */
export function derivePageSaveState(base: SaveState, failure?: PageSaveFailure | null): PageSaveState {
  if (base === "saving") return "saving";
  return failure ?? base;
}

/** The label words. None of them is a blanket "everything is saved" claim. */
export function pageSaveLabel(state: PageSaveState): string {
  switch (state) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "retry": return "Retry same save";
    case "error": return "Save failed. Try again";
    case "conflict": return "Resolve conflict";
    default: return "Save";
  }
}

/** Only these states respond to a press. Clean, saving and saved ignore it. */
export function isPageSaveActionable(state: PageSaveState): boolean {
  return state === "dirty" || state === "retry" || state === "error" || state === "conflict";
}

/** Edits exist on the page that are not saved. Drives the Discard changes link and the unsaved guard. */
export function hasUnsavedEdits(state: PageSaveState): boolean {
  return state === "dirty" || state === "retry" || state === "error" || state === "conflict";
}

/** The screen-reader announcement for a state change, or "" when nothing should be said. */
export function pageSaveAnnouncement(state: PageSaveState): string {
  switch (state) {
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "retry": return "The save has not been confirmed. Retry same save is available.";
    case "error": return "The save failed. Your edits are still on the page.";
    case "conflict": return "The page changed elsewhere. Choose how to resolve it.";
    default: return "";
  }
}
