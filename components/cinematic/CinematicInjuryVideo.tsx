"use client";

import { useState } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";

const WATCH_LOGO = <NativeImage className="injury-video-logo" src="/rose-city/icons/watch-on-youtube-white.png" alt="" width={891} height={120} />;

/** Like the Home replay: nothing loads from YouTube until a visitor presses play. */
export default function CinematicInjuryVideo({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const embed = MATCH_REPLAY_EMBED_PATTERN.test(url) ? url : "";
  return <div className="injury-video">
    {!embed ? <div className="injury-video-cover" role="img" aria-label={`${title} video coming soon`}>{WATCH_LOGO}<span className="injury-video-soon">Coming soon</span></div>
      : playing ? <iframe src={`${embed}&autoplay=1`} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      : <button type="button" className="injury-video-cover" aria-label={`Play ${title} video`} onClick={() => setPlaying(true)}>{WATCH_LOGO}</button>}
  </div>;
}
