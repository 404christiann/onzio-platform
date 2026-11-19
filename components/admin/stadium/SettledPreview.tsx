"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Keeps a live section preview invisible until its images and fonts have settled, so the public
 * page's own late layout (a caption moving when its image gets a size, a fallback replacing a
 * broken image, a font swap) happens while nothing is painted and never reads as a page shift.
 * `visibility: hidden` keeps the box size, so nothing around it moves when it is revealed. While hidden it carries
 * `data-preview-settling="true"`, which PreviewCards reads to show its shimmer placeholder.
 */
export function SettledPreview({ urls, children }: { urls: readonly string[]; children: ReactNode }) {
  const [settled, setSettled] = useState(false);
  const key = urls.join("|");
  const frame = useRef<number | null>(null);
  useEffect(() => {
    let active = true;
    setSettled(false);
    const loads = urls.map(url => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = image.onerror = () => resolve();
      image.src = url;
    }));
    const fonts = typeof document !== "undefined" && document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve();
    const cap = new Promise<void>(resolve => setTimeout(resolve, 4000));
    void Promise.race([Promise.all([...loads, fonts]).then(() => undefined), cap]).then(() => {
      if (!active) return;
      // Two frames: the browser lays the settled content out before it is revealed.
      frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(() => { if (active) setSettled(true); }); });
    });
    return () => { active = false; if (frame.current !== null) cancelAnimationFrame(frame.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the url list
  }, [key]);
  return <div style={{ visibility: settled ? "visible" : "hidden" }} data-preview-settled={settled || undefined} data-preview-settling={settled ? undefined : "true"}>{children}</div>;
}
