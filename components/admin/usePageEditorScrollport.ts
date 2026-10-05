"use client";

import { useEffect, useRef, useState } from "react";

/** Exclude the persistent phone Save bar from the workspace's scroll viewport. */
export function usePageEditorScrollport(breakpoint: number, enabled = true) {
  const workspace = useRef<HTMLDivElement>(null);
  const saveBar = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();

  useEffect(() => {
    const element = workspace.current;
    const bar = saveBar.current;
    if (!enabled || !element || !bar) return;
    const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const measure = () => {
      if (!media.matches) { setMaxHeight(undefined); return; }
      // Both positions use viewport coordinates. The bar includes its actual
      // wrapped controls and safe-area padding, rather than an assumed height.
      setMaxHeight(Math.max(1, bar.getBoundingClientRect().top - element.getBoundingClientRect().top - 8));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    if (element.parentElement) observer.observe(element.parentElement);
    media.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [breakpoint, enabled]);

  return { workspace, saveBar, maxHeight };
}
