"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/** Scale that fits `width` into the box's measured inline size, or `fallback` before it is measured. */
export function fitPreviewScale(boxWidth: number, width: number, fallback: number) {
  return boxWidth > 0 && width > 0 ? boxWidth / width : fallback;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scale for a preview laid out at `width` px so its whole width fits the box. A fixed factor clipped the right side
 * of every section in cards narrower than width × factor (Robinson's .46 × 780 = 359px in a ~306px card at 1280).
 * `fallback` is used until the box is measured and where ResizeObserver is missing. Only a transform changes: the box
 * size is fixed, so this never moves the page.
 */
export function useFitPreviewScale(ref: RefObject<HTMLElement | null>, width: number, fallback: number) {
  const [scale, setScale] = useState(fallback);
  useIsoLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setScale(fitPreviewScale(node.clientWidth, width, fallback));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, width, fallback]);
  return scale;
}
