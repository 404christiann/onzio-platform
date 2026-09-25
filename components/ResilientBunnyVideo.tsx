"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";

type Props = {
  guid: string;
  posterSrc: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** Fires when a video frame or the static poster can be displayed. */
  onVisualReady?: () => void;
};

/**
 * Autoplay/muted/loop background video backed by Bunny Stream, following
 * this codebase's `ResilientNativeImage`/`ImageFallback` convention: if
 * Bunny playback ever fails (network error, unsupported source, blocked
 * request), it falls back to rendering the same poster image as a static
 * native image element instead of showing a broken player.
 */
export default function ResilientBunnyVideo({
  guid,
  posterSrc,
  alt,
  className,
  style,
  onVisualReady,
}: Props) {
  const preview = useHomepagePreview();
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const editing = preview !== null && (!preview.playback || reducedMotion);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readyRef = useRef(false);
  const markVisualReady = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    onVisualReady?.();
  };

  // The `autoPlay` attribute alone is not reliably honored when the element
  // mounts client-side (these sections render with `ssr: false`): the video
  // buffered fully but sat paused on its poster frame, which is exactly the
  // "hero renders a static photo" symptom seen in local dev. Kick playback
  // explicitly, the same way the sales mockup's Hero does — set muted before
  // play() so autoplay policy allows it, and retry once on first touch for
  // mobile browsers that defer autoplay until user interaction.
  useEffect(() => {
    if (editing || failed) return;
    const video = videoRef.current;
    if (!video) return;
    const play = () => {
      video.muted = true;
      video.play().catch((error: unknown) => {
        // Autoplay can be denied on mobile even for a muted video. In that
        // case use the poster instead of leaving the hero veiled indefinitely.
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setFailed(true);
        }
      });
    };
    play();
    document.addEventListener("touchstart", play, { once: true });
    return () => document.removeEventListener("touchstart", play);
  }, [failed, editing]);

  useEffect(() => {
    if (!onVisualReady || editing || failed || readyRef.current) return;
    // A stalled network request may never emit loadeddata or error. Settle to
    // the local poster so the page can finish loading in that case.
    const timeout = window.setTimeout(() => setFailed(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [onVisualReady, editing, failed]);

  if (editing || failed) {
    return (
      <ResilientNativeImage
        src={posterSrc}
        alt={alt}
        className={className}
        style={style}
        onLoad={markVisualReady}
        onError={markVisualReady}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster={posterSrc}
      aria-label={alt}
      className={className}
      style={style}
      onLoadedData={markVisualReady}
      onPlaying={markVisualReady}
      onError={() => setFailed(true)}
    >
      <source src={bunnyVideoMp4Url(guid)} type="video/mp4" />
    </video>
  );
}
