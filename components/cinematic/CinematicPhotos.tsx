"use client";

import { useEffect, useRef, useState } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import { useHomepagePiece } from "@/lib/homepage-editor/preview-context";
import { useCinematicMotion } from "./useCinematicMotion";

type Photo = { id: string; url: string; alt: string };
export default function CinematicPhotos({ photos }: { photos: Photo[] }) {
  const piece = useHomepagePiece("photos");
  const { playing } = useCinematicMotion();
  const [index, setIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const startX = useRef<number | null>(null);
  const active = photos.length ? index % photos.length : 0;
  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % photos.length), 6000);
    return () => window.clearInterval(timer);
  }, [playing, photos.length]);
  const advance = (delta: number) => {
    if (!photos.length) return;
    const next = (active + delta + photos.length) % photos.length;
    setIndex(next); setAnnouncement(`Photograph ${next + 1} of ${photos.length}`);
  };
  if (!photos.length && !piece["data-homepage-piece"]) return null;
  return <section {...piece} className="slideshow" aria-label="Club match photographs" aria-roledescription="carousel" tabIndex={0}
    onKeyDown={event => { piece.onKeyDown?.(event); if (event.defaultPrevented) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); advance(event.key === "ArrowRight" ? 1 : -1); } }}
    onPointerDown={event => { if (event.pointerType === "touch") startX.current = event.clientX; }}
    onPointerUp={event => { const start = startX.current; if (start !== null && Math.abs(event.clientX - start) > 55) advance(event.clientX < start ? 1 : -1); startX.current = null; }}
    onPointerCancel={() => { startX.current = null; }}>
    <div className="cinematic-slides">{photos.map((photo, position) => <NativeImage key={photo.id} src={photo.url} alt={photo.alt} width={1200} height={670} loading={position === 0 ? "eager" : "lazy"} className={active === position ? "active" : ""} aria-hidden={active !== position} />)}</div>
    <span className="sr-only" aria-live="polite">{announcement}</span>
  </section>;
}
