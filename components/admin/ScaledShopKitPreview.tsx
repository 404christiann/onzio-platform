"use client";

import { useLayoutEffect, useRef, useState } from "react";
import ShopKitSection from "@/components/ShopKitSection";
import type {
  DBShopKitPhoto,
  DBShopKitSection,
} from "@/lib/db-types";

const DESKTOP_PREVIEW_WIDTH = 1700;

interface ScaledShopKitPreviewProps {
  section: DBShopKitSection;
  photos: DBShopKitPhoto[];
}

export default function ScaledShopKitPreview({
  section,
  photos,
}: ScaledShopKitPreviewProps) {
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
          <ShopKitSection
            animate={false}
            section={section}
            photos={photos}
          />
        </div>
      </div>
    </div>
  );
}
