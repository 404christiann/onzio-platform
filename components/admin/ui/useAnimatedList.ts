"use client";

import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef } from "react";

import { ADMIN_MOTION_CURVES, ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";

type ListChange =
  | { type: "remove"; key: string }
  | { type: "add"; key: string }
  | { type: "reorder" };

type LeavingRow = {
  element: HTMLElement;
  animation: Animation;
};

type PositionedList = {
  element: HTMLElement;
  originalInlinePosition: string;
};

function restoreListPosition(positioned: PositionedList) {
  if (positioned.element.style.position === "relative") {
    positioned.element.style.position = positioned.originalInlinePosition;
  }
}

const rowSelector = "[data-admin-animated-key]";
const focusableSelector =
  "button:not([disabled]), [href], input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

function activeRows(list: HTMLElement) {
  return Array.from(list.children)
    .filter((element): element is HTMLElement =>
      element instanceof HTMLElement &&
      element.matches(rowSelector) &&
      !element.hasAttribute("data-admin-list-leaving"),
    );
}

function rowKey(row: HTMLElement) {
  return row.dataset.adminAnimatedKey;
}

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useAnimatedList({ axis = "vertical" }: { axis?: "vertical" | "both" } = {}) {
  const listRef = useRef<HTMLDivElement>(null);
  const movement = useRef(new Map<HTMLElement, Animation>());
  const leaving = useRef(new Map<string, LeavingRow>());
  const positionedList = useRef<PositionedList | null>(null);

  useEffect(() => () => {
    for (const animation of movement.current.values()) animation.cancel();
    for (const row of leaving.current.values()) {
      row.animation.cancel();
      row.element.remove();
    }
    movement.current.clear();
    leaving.current.clear();
    if (positionedList.current) {
      restoreListPosition(positionedList.current);
      positionedList.current = null;
    }
  }, []);

  const rowProps = useCallback((key: string) => ({
    "data-admin-animated-key": key,
  }), []);

  const change = useCallback((operation: ListChange, mutate: () => void) => {
    const list = listRef.current;
    if (!list) {
      flushSync(mutate);
      return false;
    }

    if (positionedList.current && positionedList.current.element !== list) {
      restoreListPosition(positionedList.current);
      positionedList.current = null;
    }

    const beforeRows = activeRows(list);
    const byKey = new Map(beforeRows.map((row) => [rowKey(row), row]));
    const removed = operation.type === "remove" ? byKey.get(operation.key) : undefined;
    if (operation.type === "remove" && !removed) return false;

    const before = new Map(beforeRows.map((row) => [
      rowKey(row),
      row.getBoundingClientRect(),
    ]));
    const listBounds = list.getBoundingClientRect();
    const removedBounds = removed?.getBoundingClientRect();
    const ghost = removed?.cloneNode(true) as HTMLElement | undefined;
    const focusedInRemoved = removed?.contains(document.activeElement) ?? false;
    const removedIndex = removed ? beforeRows.indexOf(removed) : -1;

    for (const animation of movement.current.values()) animation.cancel();
    movement.current.clear();

    if (operation.type === "add") {
      const priorGhost = leaving.current.get(operation.key);
      if (priorGhost) {
        priorGhost.animation.cancel();
        priorGhost.element.remove();
        leaving.current.delete(operation.key);
      }
    }

    if (ghost && removedBounds && getComputedStyle(list).position === "static") {
      if (!positionedList.current) {
        positionedList.current = {
          element: list,
          originalInlinePosition: list.style.position,
        };
      }
      list.style.position = "relative";
    }

    if (focusedInRemoved) {
      // Keep modal recovery from observing body when the active row is removed.
      if (!list.hasAttribute("tabindex")) list.tabIndex = -1;
      list.focus({ preventScroll: true });
    }

    flushSync(mutate);

    if (focusedInRemoved) {
      queueMicrotask(() => {
        if (!list.isConnected) return;
        const active = list.ownerDocument.activeElement;
        if (active !== list && active !== list.ownerDocument.body) return;
        const remaining = activeRows(list);
        const neighbor = remaining[Math.min(removedIndex, remaining.length - 1)];
        const target = neighbor?.querySelector<HTMLElement>(focusableSelector);
        if (target) {
          target.focus({ preventScroll: true });
        } else {
          list.tabIndex = -1;
          list.focus({ preventScroll: true });
        }
      });
    }

    const reduced = isReducedMotion();
    for (const row of activeRows(list)) {
      const key = rowKey(row);
      const earlier = before.get(key);
      if (earlier && !reduced) {
        const current = row.getBoundingClientRect();
        const deltaY = earlier.top - current.top;
        const deltaX = axis === "both" ? earlier.left - current.left : 0;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
        const start = axis === "both"
          ? `translateX(${deltaX}px) translateY(${deltaY}px)`
          : `translateY(${deltaY}px)`;
        const end = axis === "both" ? "translateX(0) translateY(0)" : "translateY(0)";
        const animation = row.animate(
          [{ transform: start }, { transform: end }],
          {
            duration: ADMIN_MOTION_DURATIONS.listFlip,
            easing: ADMIN_MOTION_CURVES.easeOut,
          },
        );
        movement.current.set(row, animation);
        void animation.finished.catch(() => {}).then(() => {
          if (movement.current.get(row) === animation) movement.current.delete(row);
        });
      } else if (!earlier && operation.type === "add" && key === operation.key) {
        const animation = row.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          {
            duration: reduced
              ? ADMIN_MOTION_DURATIONS.reducedMotionFade
              : ADMIN_MOTION_DURATIONS.listAdd,
            easing: "ease-out",
          },
        );
        movement.current.set(row, animation);
        void animation.finished.catch(() => {}).then(() => {
          if (movement.current.get(row) === animation) movement.current.delete(row);
        });
      }
    }

    if (ghost && removedBounds) {
      ghost.removeAttribute("data-admin-animated-key");
      ghost.setAttribute("data-admin-list-leaving", operation.type === "remove" ? operation.key : "");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("inert", "");
      ghost.removeAttribute("id");
      ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      ghost.querySelectorAll("input, select, textarea, button").forEach((element) => {
        (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement).disabled = true;
      });
      Object.assign(ghost.style, {
        position: "absolute",
        top: `${removedBounds.top - listBounds.top + list.scrollTop - list.clientTop}px`,
        left: `${removedBounds.left - listBounds.left + list.scrollLeft - list.clientLeft}px`,
        width: `${removedBounds.width}px`,
        height: `${removedBounds.height}px`,
        margin: "0",
        pointerEvents: "none",
        transform: "none",
        zIndex: "1",
      });
      list.append(ghost);
      const animation = ghost.animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: reduced ? "translateX(0)" : "translateX(-24px)" },
        ],
        {
          duration: reduced
            ? ADMIN_MOTION_DURATIONS.reducedMotionFade
            : ADMIN_MOTION_DURATIONS.listLeave,
          easing: "ease-out",
          fill: "forwards",
        },
      );
      leaving.current.set(operation.type === "remove" ? operation.key : "", {
        element: ghost,
        animation,
      });
      void animation.finished.catch(() => {}).then(() => {
        ghost.remove();
        const key = operation.type === "remove" ? operation.key : "";
        if (leaving.current.get(key)?.animation === animation) leaving.current.delete(key);
      });
    }

    return true;
  }, [axis]);

  return { listRef, rowProps, change };
}

