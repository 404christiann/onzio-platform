"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns true only once `active` has been continuously true for `delayMs`,
 * and — once shown — stays true for at least `minVisibleMs` even if `active`
 * goes false sooner, so the escalated UI never flashes for a split second.
 *
 * Used to avoid flashing a heavier loading treatment (e.g.
 * `AdminFullPageLoader`) on fast loads: callers show a lightweight skeleton
 * immediately when `active` becomes true, and escalate to the heavier
 * treatment only once this hook returns true — which then holds for a
 * minimum, comfortable duration once it appears, instead of flickering.
 */
export function useDelayedLoading(
  active: boolean,
  delayMs = 400,
  minVisibleMs = 1000,
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (visible) return;
      const delayTimer = setTimeout(() => {
        shownAtRef.current = performance.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(delayTimer);
    }

    if (!visible) return;

    const shownAt = shownAtRef.current ?? performance.now();
    const remaining = Math.max(0, minVisibleMs - (performance.now() - shownAt));
    const hideTimer = setTimeout(() => {
      setVisible(false);
      shownAtRef.current = null;
    }, remaining);
    return () => clearTimeout(hideTimer);
  }, [active, delayMs, minVisibleMs, visible]);

  return visible;
}
