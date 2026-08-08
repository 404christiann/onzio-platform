"use client";

import { type CSSProperties, useState } from "react";
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
