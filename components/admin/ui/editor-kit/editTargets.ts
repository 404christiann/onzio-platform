"use client";

import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_SELECTOR, resolveEditTarget, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";

/** Set on a stamped field for a moment after it is focused from a preview click; EditorDialog.module.css draws the ring. */
export const EDIT_TARGET_FLASH_ATTRIBUTE = "data-edit-target-flash";
export const EDIT_TARGET_FLASH_MS = 1200;

export type EditTargetRect = { left: number; top: number; width: number; height: number };
export type EditTargetCandidate = { id: string; rect: EditTargetRect };

/**
 * The innermost candidate under the point: the smallest rect that contains it. Pure, so the hit test is unit-tested
 * without a browser. Ties keep the first (document order: an outer node comes before the nodes inside it).
 */
export function pickEditTarget(candidates: readonly EditTargetCandidate[], x: number, y: number): string | null {
  return pickEditTargetCandidate(candidates, x, y)?.id ?? null;
}

/** pickEditTarget, returning the candidate itself (its box is the node under the point, even when an id repeats). */
export function pickEditTargetCandidate(candidates: readonly EditTargetCandidate[], x: number, y: number): EditTargetCandidate | null {
  let best: EditTargetCandidate | null = null;
  for (const candidate of candidates) {
    const { left, top, width, height } = candidate.rect;
    if (width <= 0 || height <= 0 || x < left || x > left + width || y < top || y > top + height) continue;
    if (!best || width * height < best.rect.width * best.rect.height) best = candidate;
  }
  return best;
}

function candidatesIn(scope: ParentNode, map: (rect: DOMRect) => EditTargetRect): EditTargetCandidate[] {
  return Array.from(scope.querySelectorAll<HTMLElement>(EDIT_TARGET_SELECTOR)).flatMap(element => {
    const id = element.getAttribute(EDIT_TARGET_ATTRIBUTE);
    return id ? [{ id, rect: map(element.getBoundingClientRect()) }] : [];
  });
}

/**
 * The declared edit target under a viewport point inside `root`, looking through same-origin preview iframes
 * (HomepagePreviewFrame, the Overview's PageFrame, ShopScaledFrame), which may be scaled with a CSS transform.
 * Geometry only, so it works while the preview is inert or has pointer-events: none. Unknown or undeclared ids are
 * ignored, so the caller falls back to its section or item. `resolve` is the registry lookup (a fixture in tests).
 */
export function editTargetAt(
  root: HTMLElement,
  clientX: number,
  clientY: number,
  resolve: (id: string) => ResolvedEditTarget | null = resolveEditTarget,
): EditTargetId | null {
  return editTargetHitAt(root, clientX, clientY, resolve)?.id ?? null;
}

/** editTargetAt plus the hit field's box in viewport coordinates (for a hover outline). */
export function editTargetHitAt(
  root: HTMLElement,
  clientX: number,
  clientY: number,
  resolve: (id: string) => ResolvedEditTarget | null = resolveEditTarget,
): { id: EditTargetId; rect: EditTargetRect } | null {
  const candidates = candidatesIn(root, rect => rect);
  root.querySelectorAll("iframe").forEach(frame => {
    let doc: Document | null = null;
    try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc?.body || !frame.clientWidth) return;
    const box = frame.getBoundingClientRect();
    const scale = box.width / frame.clientWidth;
    const left = box.left + frame.clientLeft * scale;
    const top = box.top + frame.clientTop * scale;
    candidates.push(...candidatesIn(doc, rect => ({ left: left + rect.left * scale, top: top + rect.top * scale, width: rect.width * scale, height: rect.height * scale })));
  });
  // Points outside every declared node, or on a node whose id is not in the registry, give null: the section fallback.
  const declared = candidates.filter(candidate => resolve(candidate.id));
  const hit = pickEditTargetCandidate(declared, clientX, clientY);
  return hit ? { id: hit.id as EditTargetId, rect: hit.rect } : null;
}

/** One rule for stamping a preview: every node `selector` matches gets the id `target` returns for it (null clears it). */
export type EditTargetStamp = { selector: string; target: (element: Element, index: number) => string | null };

/**
 * Stamps data-edit-target on public nodes inside an admin preview (never on the public site: only preview frames call
 * this). Run it again after the preview re-renders; it only writes attributes that changed. Returns how many nodes
 * carry a target.
 */
export function applyEditTargetStamps(root: ParentNode, stamps: readonly EditTargetStamp[]): number {
  let stamped = 0;
  for (const stamp of stamps) {
    root.querySelectorAll(stamp.selector).forEach((element, index) => {
      const id = stamp.target(element, index);
      if (id) {
        if (element.getAttribute(EDIT_TARGET_ATTRIBUTE) !== id) element.setAttribute(EDIT_TARGET_ATTRIBUTE, id);
        stamped += 1;
      } else if (element.getAttribute(EDIT_TARGET_ATTRIBUTE) !== null) {
        element.removeAttribute(EDIT_TARGET_ATTRIBUTE);
      }
    });
  }
  return stamped;
}

const FOCUSABLE = [
  "input:not([type=hidden]):not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "button:not([disabled])",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

/** The stamped element for `id` inside `container`, or null. */
export function findEditTarget(container: ParentNode, id: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>(EDIT_TARGET_SELECTOR)).find(element => element.getAttribute(EDIT_TARGET_ATTRIBUTE) === id) ?? null;
}

/** The control to focus for a stamped element: the element itself when it takes focus, else its first focusable descendant. */
export function editTargetControl(element: HTMLElement): HTMLElement | null {
  return element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE);
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Scrolls the target's field into view, focuses its control and marks it for the short highlight ring. Reduced motion:
 * no smooth scroll and no ring animation (the ring shows, then goes). Returns false when `id` is not in `container`.
 */
export function focusEditTarget(container: ParentNode, id: string, options: { reducedMotion?: boolean } = {}): boolean {
  const element = findEditTarget(container, id);
  const control = element && editTargetControl(element);
  if (!element || !control) return false;
  const reduced = options.reducedMotion ?? prefersReducedMotion();
  element.scrollIntoView?.({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
  control.focus({ preventScroll: true });
  clearTimeout(flashTimers.get(element));
  element.setAttribute(EDIT_TARGET_FLASH_ATTRIBUTE, reduced ? "static" : "");
  flashTimers.set(element, setTimeout(() => element.removeAttribute(EDIT_TARGET_FLASH_ATTRIBUTE), EDIT_TARGET_FLASH_MS));
  return true;
}

/**
 * Puts focus back on the target's control without scrolling or ringing again (the focus hold uses it when the modal's
 * own initial focus takes focus away). Returns false when the field or its control is not there.
 */
export function refocusEditTarget(container: ParentNode, id: string): boolean {
  const element = findEditTarget(container, id);
  const control = element && editTargetControl(element);
  if (!control) return false;
  control.focus({ preventScroll: true });
  return true;
}

/** Whether `active` (normally document.activeElement) is the target's field or inside it. */
export function editTargetHasFocus(container: ParentNode, id: string, active: Element | null): boolean {
  return Boolean(active && findEditTarget(container, id)?.contains(active));
}

export type EditTargetStampEnvironment = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  observe: (root: Node, onChange: () => void) => { disconnect: () => void };
};
const browserStampEnvironment = (): EditTargetStampEnvironment => ({
  requestFrame: callback => window.requestAnimationFrame(callback),
  cancelFrame: handle => window.cancelAnimationFrame(handle),
  observe: (root, onChange) => { const observer = new MutationObserver(onChange); observer.observe(root, { childList: true, subtree: true }); return observer; },
});

/**
 * Stamps a preview now and again (once per frame) whenever its content changes, such as Schedule or logos that render
 * after the first paint. Call it again with new stamps when the draft changes (rows added, removed or reordered).
 * Returns the cleanup. `environment` is the frame and mutation source (a fake one in tests).
 */
export function watchEditTargetStamps(root: Node & ParentNode, stamps: readonly EditTargetStamp[], environment: EditTargetStampEnvironment = browserStampEnvironment()) {
  let frame = 0;
  const stamp = () => {
    environment.cancelFrame(frame);
    frame = environment.requestFrame(() => applyEditTargetStamps(root, stamps));
  };
  stamp();
  const observer = environment.observe(root, stamp);
  return () => { observer.disconnect(); environment.cancelFrame(frame); };
}
