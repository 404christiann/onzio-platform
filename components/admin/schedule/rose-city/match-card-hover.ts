import { resolveEditTarget } from "@/lib/admin-edit-targets";
import { editTargetHitAt } from "@/components/admin/ui/editor-kit/editTargets";
import { matchOwnsTarget } from "./match-edit-targets";

/**
 * Click-to-field on a Schedule match card. The card is the Schedule editor's own markup (not the kit's PreviewCards), so the
 * hit test and the hover outline live here, built on the same kit helper PreviewCards uses. `button` is the card's overlay
 * button; its parent is the preview wrap holding the thumb and the outline.
 */
export function matchFieldUnder(button: HTMLElement, matchKey: string, x: number, y: number) {
  const wrap = button.parentElement;
  const hit = wrap ? editTargetHitAt(wrap, x, y) : null;
  const target = hit ? resolveEditTarget(hit.id) : null;
  return hit && target && matchOwnsTarget(matchKey, target) ? hit : null;
}

/** The outline is moved directly (no React state), so moving the mouse never re-renders the cards. */
export function showMatchFieldHover(button: HTMLElement, matchKey: string, x: number, y: number) {
  const clip = button.parentElement?.querySelector<HTMLElement>(":scope > [data-field-hover-clip]");
  const outline = clip?.firstElementChild as HTMLElement | null | undefined;
  if (!clip || !outline) return;
  const hit = matchFieldUnder(button, matchKey, x, y);
  if (!hit) { outline.hidden = true; delete outline.dataset.target; return; }
  const box = clip.getBoundingClientRect();
  outline.style.left = `${hit.rect.left - box.left}px`;
  outline.style.top = `${hit.rect.top - box.top}px`;
  outline.style.width = `${hit.rect.width}px`;
  outline.style.height = `${hit.rect.height}px`;
  outline.dataset.target = hit.id;
  outline.hidden = false;
}

export function hideMatchFieldHover(button: HTMLElement) {
  const outline = button.parentElement?.querySelector<HTMLElement>(":scope > [data-field-hover-clip] > [data-field-hover]");
  if (outline) { outline.hidden = true; delete outline.dataset.target; }
}
