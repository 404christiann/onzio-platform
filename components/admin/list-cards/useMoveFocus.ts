"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps keyboard focus on a move button after the list reorders. The item (or the dialog) stays mounted,
 * but a button that reaches the first or last place becomes disabled and the browser would drop focus to
 * the page. Focus goes to the same direction if it is still enabled, otherwise to the opposite one.
 * Pass the draft as `dependency`: the effect runs after the reorder is rendered.
 */
export function useMoveFocus(dependency: unknown) {
  const moved = useRef<{ id: string; delta: -1 | 1; inDialog: boolean } | null>(null);
  useEffect(() => {
    const move = moved.current;
    if (!move) return;
    moved.current = null;
    const root = move.inDialog ? document.querySelector("[data-editor-dialog]") : document.querySelector(`[data-item-card="${CSS.escape(move.id)}"]`);
    if (!root) return;
    const pick = (delta: -1 | 1) => root.querySelector<HTMLButtonElement>(move.inDialog ? (delta < 0 ? "[data-move-earlier]" : "[data-move-later]") : `[data-move="${CSS.escape(`${move.id}:${delta}`)}"]`);
    [pick(move.delta), pick(move.delta === 1 ? -1 : 1)].find(button => button && !button.disabled)?.focus();
  }, [dependency]);
  return (id: string, delta: -1 | 1, inDialog: boolean) => { moved.current = { id, delta, inDialog }; };
}
