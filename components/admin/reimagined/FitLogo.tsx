"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { cropGeometry, MAX_LOGO_ZOOM, MIN_LOGO_ZOOM } from "@/lib/your-club";
import styles from "./your-club.module.css";

// ADMIN-RE-14: "Fit your logo" (group 3 decision 11). A square frame with zoom,
// and small previews of where the logo shows (menu, footer, browser tab), before
// the logo is kept. Zoom 1 shows the whole logo inside the square. "Use this
// fit" makes a square PNG (the media server takes PNG or WebP for logos);
// "Use it as it is" keeps the file the owner chose.

/** The frame's side in CSS pixels. */
const FRAME = 240;
/** The square PNG's side in pixels. */
const OUTPUT = 512;
const NUDGE = 8;

const PREVIEWS = [
  { id: "menu", label: "Menu", size: 32, round: true },
  { id: "footer", label: "Footer", size: 44, round: false },
  { id: "tab", label: "Browser tab", size: 16, round: false },
] as const;

function Picture({
  url,
  size,
  geometry,
  className,
}: {
  url: string;
  size: number;
  geometry: ReturnType<typeof cropGeometry>;
  className?: string;
}) {
  const ratio = size / FRAME;
  return (
    <ResilientNativeImage
      src={url}
      alt=""
      draggable={false}
      className={className}
      style={{
        width: geometry.drawWidth * ratio,
        height: geometry.drawHeight * ratio,
        left: geometry.drawX * ratio,
        top: geometry.drawY * ratio,
      }}
    />
  );
}

export function FitLogo({
  file,
  onUse,
  onUseAsIs,
  onCancel,
}: {
  file: File;
  /** The fitted square PNG. */
  onUse: (fitted: File) => void;
  onUseAsIs: () => void;
  onCancel: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(MIN_LOGO_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    image.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [url]);

  const geometry = cropGeometry({
    naturalWidth: natural?.width ?? 0,
    naturalHeight: natural?.height ?? 0,
    frame: FRAME,
    zoom,
    offsetX: offset.x,
    offsetY: offset.y,
  });

  function move(next: { x: number; y: number }) {
    const fitted = cropGeometry({
      naturalWidth: natural?.width ?? 0,
      naturalHeight: natural?.height ?? 0,
      frame: FRAME,
      zoom,
      offsetX: next.x,
      offsetY: next.y,
    });
    setOffset({ x: fitted.offsetX, y: fitted.offsetY });
  }

  function changeZoom(value: number) {
    const next = cropGeometry({
      naturalWidth: natural?.width ?? 0,
      naturalHeight: natural?.height ?? 0,
      frame: FRAME,
      zoom: value,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    setZoom(next.zoom);
    setOffset({ x: next.offsetX, y: next.offsetY });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: offset };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    move({
      x: drag.current.from.x + (event.clientX - drag.current.x),
      y: drag.current.from.y + (event.clientY - drag.current.y),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    move({ x: offset.x + step[0], y: offset.y + step[1] });
  }

  function useThisFit() {
    const image = imageRef.current;
    if (!image || working) return;
    setWorking(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) {
      setWorking(false);
      setFailed(true);
      return;
    }
    const k = OUTPUT / FRAME;
    context.drawImage(image, geometry.drawX * k, geometry.drawY * k, geometry.drawWidth * k, geometry.drawHeight * k);
    canvas.toBlob((blob) => {
      setWorking(false);
      if (!blob) {
        setFailed(true);
        return;
      }
      onUse(new File([blob], "club-logo.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <AdminModal
      open
      onClose={onCancel}
      className={styles.fitDialog}
      backdropClassName={styles.fitBackdrop}
      aria-labelledby="fit-logo-title"
    >
      <h2 id="fit-logo-title" className={styles.fitTitle}>
        Fit your logo
      </h2>
      {failed ? (
        <p className={styles.fitError} role="alert">
          That picture could not be opened. Choose a different logo.
        </p>
      ) : (
        <>
          <div
            className={styles.fitFrame}
            style={{ width: FRAME, height: FRAME }}
            tabIndex={0}
            role="group"
            aria-label="Logo frame. Drag, or use the arrow keys, to move the logo."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={onKeyDown}
            data-testid="fit-logo-frame"
          >
            {natural ? <Picture url={url} size={FRAME} geometry={geometry} className={styles.fitImage} /> : null}
          </div>
          <label className={styles.fitZoom}>
            <span>Zoom</span>
            <input
              type="range"
              min={MIN_LOGO_ZOOM}
              max={MAX_LOGO_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
              aria-label="Zoom"
            />
          </label>
          <ul className={styles.fitPreviews} aria-label="How it will look">
            {PREVIEWS.map((preview) => (
              <li key={preview.id} className={styles.fitPreview}>
                <span
                  className={styles.fitPreviewBox}
                  data-round={preview.round || undefined}
                  style={{ width: preview.size, height: preview.size }}
                >
                  {natural ? <Picture url={url} size={preview.size} geometry={geometry} className={styles.fitImage} /> : null}
                </span>
                <span className={styles.fitPreviewLabel}>{preview.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={styles.fitActions}>
        {failed ? null : (
          <button type="button" className={styles.primary} disabled={!natural || working} onClick={useThisFit}>
            Use this fit
          </button>
        )}
        {failed ? null : (
          <button type="button" className={styles.secondary} disabled={!natural || working} onClick={onUseAsIs}>
            Use it as it is
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </AdminModal>
  );
}
