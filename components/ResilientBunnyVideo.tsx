"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { bunnyVideoMp4Url } from "@/lib/bunny-video";

type Props = {
  guid: string;
  posterSrc: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
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
}: Props) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The `autoPlay` attribute alone is not reliably honored when the element
  // mounts client-side (these sections render with `ssr: false`): the video
  // buffered fully but sat paused on its poster frame, which is exactly the
  // "hero renders a static photo" symptom seen in local dev. Kick playback
  // explicitly, the same way the sales mockup's Hero does — set muted before
  // play() so autoplay policy allows it, and retry once on first touch for
  // mobile browsers that defer autoplay until user interaction.
  useEffect(() => {
    if (failed) return;
    const video = videoRef.current;
    if (!video) return;
    const play = () => {
      video.muted = true;
      video.play().catch(() => {});
    };
    play();
    document.addEventListener("touchstart", play, { once: true });
    return () => document.removeEventListener("touchstart", play);
  }, [failed]);

  if (failed) {
    return (
      <ResilientNativeImage
        src={posterSrc}
        alt={alt}
        className={className}
        style={style}
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
      onError={() => setFailed(true)}
    >
      <source src={bunnyVideoMp4Url(guid)} type="video/mp4" />
    </video>
  );
}
