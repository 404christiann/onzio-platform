/**
 * The two pure halves of EditorDialog's click-to-field focus (UI-PREVIEW-TARGETS), kept out of React and the DOM so
 * they are unit-tested: the dialog's open/section/focus-request state, and one step of the loop that focuses a field.
 */

/** A request to focus one field (an edit target id, lib/admin-edit-targets.ts). `nonce` makes a repeat click count again. */
export type EditorDialogFocusRequest = { target: string; nonce: number };

export type EditorDialogState<Id extends string = string> = {
  openId: Id | null;
  /** The section to show while the dialog fades out. */
  lastId: Id | null;
  focusRequest: EditorDialogFocusRequest | null;
  /** Last nonce handed out. It only grows, so a new request never repeats a nonce the dialog already handled. */
  nonce: number;
};

export type EditorDialogAction<Id extends string = string> =
  | { type: "open"; id: Id }
  | { type: "switch"; id: Id }
  | { type: "close" }
  | { type: "focus"; target: string };

export const initialEditorDialogState: EditorDialogState<never> = { openId: null, lastId: null, focusRequest: null, nonce: 0 };

/**
 * Opening, switching or closing drops any focus request, so a field focused from an earlier preview click is never
 * focused again by a later plain Edit. A focus request made right after open/switch (same event) is kept.
 */
export function editorDialogReducer<Id extends string>(state: EditorDialogState<Id>, action: EditorDialogAction<Id>): EditorDialogState<Id> {
  switch (action.type) {
    case "open":
    case "switch":
      return { ...state, openId: action.id, lastId: action.id, focusRequest: null };
    case "close":
      return { ...state, openId: null, focusRequest: null };
    case "focus": {
      const nonce = state.nonce + 1;
      return { ...state, nonce, focusRequest: { target: action.target, nonce } };
    }
  }
}

/** How long a focused field keeps focus against the modal's own initial focus (which runs late). */
export const FOCUS_SETTLE_MS = 320;
/** How long a request waits for its field to mount before it is dropped. */
export const FOCUS_GIVE_UP_MS = 1000;

export type FocusStepState = { startedAt: number; focusedAt: number | null };
export type FocusStepDeps = {
  now: () => number;
  /** Scroll to, focus and ring the field. False while the field is not mounted. */
  focus: () => boolean;
  /** Focus is still on the field. */
  holds: () => boolean;
  /** Put focus back on the field without scrolling or ringing again. */
  refocus: () => void;
  /** The person clicked or pressed a key since the field was focused: stop holding focus for them. */
  interrupted: () => boolean;
};
/** `handled`: the field has focus and the hold is over. `dropped`: the field never appeared. Both end the request. */
export type FocusStepOutcome = "continue" | "handled" | "dropped";

/** One animation-frame step of focusing a requested field. */
export function stepFocusRequest(state: FocusStepState, deps: FocusStepDeps): { state: FocusStepState; outcome: FocusStepOutcome } {
  const now = deps.now();
  if (state.focusedAt === null) {
    if (deps.focus()) return { state: { ...state, focusedAt: now }, outcome: "continue" };
    return { state, outcome: now - state.startedAt > FOCUS_GIVE_UP_MS ? "dropped" : "continue" };
  }
  if (deps.interrupted()) return { state, outcome: "handled" };
  if (!deps.holds()) deps.refocus();
  return { state, outcome: now - state.focusedAt > FOCUS_SETTLE_MS ? "handled" : "continue" };
}

/**
 * Ends the focus hold when the person acts. Wire `onInput` to pointerdown and keydown (capture) while a request runs
 * and pass `interrupted` to stepFocusRequest. Input before the field has focus (the click that opened the dialog,
 * which can still be in flight) does not count.
 */
export function createFocusInterruption(focused: () => boolean) {
  let interrupted = false;
  return {
    onInput: () => { if (focused()) interrupted = true; },
    interrupted: () => interrupted,
  };
}
