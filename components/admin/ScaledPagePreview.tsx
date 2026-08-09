"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shared scaler behind the admin "live-style" previews.
 *
 * Every `Scaled*Preview` renders the real public component at a fixed desktop
 * width and scales it down so the preview keeps the proportions a visitor
 * actually sees, instead of re-flowing into the narrow admin column.
 *
 * The first version of this measured through an absolutely positioned canvas
 * pinned with `inset: 0`. That is what made the Tryouts preview sit wrong in
 * its panel: `inset: 0` forces the canvas box to the *wrapper's* height (the
 * already-scaled height), so the page inside it is laid out against a box
 * shorter than itself. Anything sized against that box — `h-full`, percentage
 * heights, `items-center` on a section — resolves against the wrong number,
 * and `scrollHeight` then feeds that wrong number straight back into the next
 * measurement.
 *
 * This version keeps the canvas in normal flow at its natural height and only
 * transforms it. `transform` does not affect layout, so `offsetHeight` is the
 * true unscaled height and the wrapper height is simply that times the scale.
 * A zero-width frame (a preview mounted inside a collapsed or not-yet-laid-out
 * container) no longer collapses the whole preview to `scale(0)`; the scale is
 * held at 1 until a real width is measured.
 */
const DESKTOP_PREVIEW_WIDTH = 1440;

export default function ScaledPagePreview({
  children,
  className = "",
  width = DESKTOP_PREVIEW_WIDTH,
}: {
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const available = frame.clientWidth;
      // A frame with no measurable width means the panel has not been laid out
      // yet. Scaling by 0 would blank the preview permanently, because a 0x0
      // element never fires another resize.
      const nextScale = available > 0 ? Math.min(1, available / width) : 1;
      setScale(nextScale);
      setScaledHeight(canvas.offsetHeight * nextScale);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    // ResizeObserver alone is not enough: the first measurement happens before
    // web fonts land and before images inside the previewed page have a height,
    // and a preview mounted in a collapsed panel gets no resize entry at all.
    // A window listener plus one settle pass on the next frame covers both.
    window.addEventListener("resize", measure);
    const frameId = requestAnimationFrame(measure);
    void document.fonts?.ready.then(measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frameId);
    };
  }, [width]);

  return (
    <div ref={frameRef} className={`w-full overflow-hidden ${className}`}>
      <div style={{ height: scaledHeight || undefined, overflow: "hidden" }}>
        <div
          ref={canvasRef}
          aria-hidden="true"
          style={{
            width,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
