"use client";

import { useLayoutEffect, useRef, useState } from "react";
import AcademyTryoutsPage from "@/components/AcademyTryoutsPage";
import type { TryoutContent } from "@/lib/queries";

/**
 * Live-style preview for /admin/tryouts, following the same shape as
 * ScaledShopKitPreview: render the real public component at a fixed desktop
 * width and scale the whole thing down, so the preview keeps the proportions a
 * visitor sees instead of re-flowing into the narrow admin column.
 */
const DESKTOP_PREVIEW_WIDTH = 1440;

interface ScaledTryoutsPreviewProps {
  tryouts: TryoutContent[];
  clubName: string;
  contactEmail: string;
}

export default function ScaledTryoutsPreview({
  tryouts,
  clubName,
  contactEmail,
}: ScaledTryoutsPreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const nextScale = Math.min(1, frame.clientWidth / DESKTOP_PREVIEW_WIDTH);
      setScale(nextScale);
      setScaledHeight(canvas.scrollHeight * nextScale);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    document.fonts?.ready.then(measure);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="relative w-full overflow-hidden">
      <div
        style={{
          position: "relative",
          width: DESKTOP_PREVIEW_WIDTH * scale,
          height: scaledHeight || undefined,
          margin: "0 auto",
        }}
      >
        <div
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: DESKTOP_PREVIEW_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          <AcademyTryoutsPage
            tryouts={tryouts}
            clubName={clubName}
            contactEmail={contactEmail}
          />
        </div>
      </div>
    </div>
  );
}
