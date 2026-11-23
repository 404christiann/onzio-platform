import { useEffect, type RefObject } from "react";

/**
 * The one link and submit guard for every admin preview iframe. A preview renders the real public components, so a stamped
 * link or a Buy button must never open a tab, navigate the admin, or submit a form.
 *
 * The listeners sit on the iframe BODY, in the capture phase, because the previews render through `createPortal(..., body)`
 * and React then listens for the portal on that body: ONE native capture listener that dispatches every `onClickCapture`,
 * and ONE native bubble listener that dispatches every `onClick` (react-dom `listenToAllSupportedEvents(containerInfo)` on the
 * HostPortal). A guard on the body that calls preventDefault + stopPropagation (never stopImmediatePropagation):
 *   - cancels the native default (navigation, new tab, form submit);
 *   - still lets React's capture dispatch run (a second listener on the same node is not stopped), so a frame's
 *     `onClickCapture` field handlers (data-edit-target, hotspots) fire and see `defaultPrevented`;
 *   - halts the event before the body's bubble phase, so React never dispatches `onClick` (Next `<Link>` onClick,
 *     which only checks `defaultPrevented` after running the caller's handler and then calls router.push).
 * A guard on the document or window would stop the click before the body and kill those capture handlers, so it is not
 * used. Registration order against React's listener does not matter.
 */

export const PREVIEW_LINK_SELECTOR = "a[href],area[href]";
export const PREVIEW_SUBMIT_SELECTOR = 'button:not([type]),button[type="submit"],input[type="submit"],input[type="image"]';
const GUARDED_EVENTS = ["click", "auxclick", "submit"] as const;

type ClosestTarget = { closest(selector: string): unknown; hasAttribute(name: string): boolean };
type GuardWindow = { open: (...args: never[]) => unknown };
type GuardBody = {
  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: Event) => void, options?: boolean | EventListenerOptions): void;
  ownerDocument: { defaultView: GuardWindow | null };
};
type GuardFrame = {
  contentDocument: { body: GuardBody | null } | null;
  addEventListener(type: "load", listener: () => void): void;
  removeEventListener(type: "load", listener: () => void): void;
};

const isElement = (node: unknown): node is ClosestTarget => typeof (node as ClosestTarget | null)?.closest === "function";

/** A click on a link, or on a control that submits a form. */
function isLinkOrSubmitClick(target: unknown): boolean {
  if (!isElement(target)) return false;
  if (target.closest(PREVIEW_LINK_SELECTOR)) return true;
  const control = target.closest(PREVIEW_SUBMIT_SELECTOR);
  return !!control && isElement(control) && (!!control.closest("form") || control.hasAttribute("form"));
}

/** Install the guard on one iframe body and its window. Returns the undo. */
export function guardPreviewBody(body: GuardBody): () => void {
  const listener = (event: Event) => {
    if (event.type !== "submit" && !isLinkOrSubmitClick(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  GUARDED_EVENTS.forEach(type => body.addEventListener(type, listener, { capture: true }));
  // target=_blank is covered by preventDefault. A script running in the frame's own window calling window.open is covered here;
  // a portal component's handler runs in the admin window, which is not swapped (a contract keeps window.open out of components).
  let restore: (() => void) | undefined;
  try {
    const win = body.ownerDocument.defaultView;
    if (win) {
      const original = win.open;
      const blocked = () => null;
      win.open = blocked;
      restore = () => { if (win.open === blocked) win.open = original; };
    }
  } catch { /* a window we cannot reach cannot open anything for us either */ }
  return () => {
    GUARDED_EVENTS.forEach(type => body.removeEventListener(type, listener, { capture: true }));
    restore?.();
  };
}

/** Guard an iframe's body now, and again whenever the iframe loads a new document. Returns the undo. */
export function installPreviewLinkGuard(frame: GuardFrame): () => void {
  let undo: (() => void) | undefined;
  const mount = () => {
    undo?.();
    undo = undefined;
    let body: GuardBody | null = null;
    try { body = frame.contentDocument?.body ?? null; } catch { body = null; }
    if (body) undo = guardPreviewBody(body);
  };
  frame.addEventListener("load", mount);
  mount();
  return () => { frame.removeEventListener("load", mount); undo?.(); undo = undefined; };
}

/** Guard the iframe in `frame` for as long as the component is mounted (and `enabled`). */
export function usePreviewLinkGuard(frame: RefObject<HTMLIFrameElement | null>, enabled = true) {
  useEffect(() => {
    const element = frame.current;
    if (!enabled || !element) return;
    return installPreviewLinkGuard(element);
  }, [frame, enabled]);
}
