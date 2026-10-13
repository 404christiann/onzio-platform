"use client";

import { useState } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import type { DBBehindTheRoseSection } from "@/lib/db-types";
import { useHomepagePiece, useHomepagePreview } from "@/lib/homepage-editor/preview-context";

export default function CinematicEpisode({ content, posterUrl, crestUrl }: { content: DBBehindTheRoseSection; posterUrl?: string | null; crestUrl?: string | null }) {
  const piece = useHomepagePiece("video");
  const preview = useHomepagePreview();
  const [playingSource, setPlayingSource] = useState<string | null>(null);
  const visible = content.visible || !!piece["data-homepage-piece"];
  if (!visible) return null;
  const canPlay = !preview || preview.playback;
  const playing = playingSource === content.video_url && canPlay;
  let source = content.video_url;
  try { const url = new URL(source); url.searchParams.set("autoplay", "1"); source = url.toString(); } catch { /* empty data produces no embed */ }
  return <section {...piece} className="behind-rose"><p className="eyebrow">{content.eyebrow}</p><h2>{content.title}</h2><p className="body-copy">{content.description}</p>
    {content.video_url && <div className="episode-player">{playing ? <iframe src={source} title={content.video_title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <button type="button" aria-label={`Play ${content.video_title}`} onClick={() => { if (canPlay) setPlayingSource(content.video_url); }}>
      {posterUrl && <NativeImage src={posterUrl} alt={content.video_title} loading="lazy" />}
      <span className="episode-title">{crestUrl && <NativeImage src={crestUrl} alt="" />}{content.video_title}</span><span className="youtube-play" aria-hidden="true">▶</span><span className="watch-youtube" aria-hidden="true">Watch on YouTube</span>
    </button>}</div>}
  </section>;
}
