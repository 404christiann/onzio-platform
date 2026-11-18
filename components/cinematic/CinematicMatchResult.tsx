"use client";

import { Fragment, useState, type ReactNode } from "react";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { MATCH_REPLAY_EMBED_PATTERN } from "@/lib/youtube-embed";

type MatchProps = { fixture: Fixture; clubLabel: string; crestUrl: string };

/** Sam's white "Watch on YouTube" logo, always on the black side of the replay card. */
const WATCH_LOGO = <NativeImage className="replay-logo" src="/rose-city/icons/watch-on-youtube-white.png" alt="" width={891} height={120} />;

const opponentLabel = (fixture: Fixture) => fixture.opponentShortName || fixture.opponent;
const resultDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** The latest played match (Schedule-owned), shown after the match photographs. */
export function CinematicLatestResult({ fixture, clubLabel, crestUrl }: MatchProps) {
  const opponent = opponentLabel(fixture);
  const scorers = (fixture.scorers ?? []).filter(Boolean);
  return <section className="result-strip" aria-label={`Latest result: ${clubLabel} ${fixture.roseCityScore}, ${opponent} ${fixture.opponentScore}`}>
    {fixture.competition && <p className="result-competition">{fixture.competition}</p>}
    <p className="result-meta">{[resultDate(fixture.date), fixture.venue].filter(Boolean).join(" | ")}</p>
    <div className="result-row">
      <strong className="result-name home">{clubLabel}</strong>
      <div className="result-crest">{crestUrl && <NativeImage src={crestUrl} alt="" />}</div>
      <div className="result-score" aria-hidden="true"><span>{fixture.roseCityScore}</span><b>|</b><span>{fixture.opponentScore}</span></div>
      <div className="result-crest"><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={140} /></div>
      <strong className="result-name away">{opponent}</strong>
      {scorers.length > 0 && <p className="result-events">{scorers.map((scorer, index) => <Fragment key={index}><span>{scorer}{index < scorers.length - 1 ? "," : ""}</span>{index < scorers.length - 1 ? " " : ""}</Fragment>)}</p>}
    </div>
  </section>;
}

/**
 * Replay the match: an embedded YouTube player the size of Behind the Rose. The matchup card is the
 * click-to-play cover, or a "coming soon" placeholder while the match has no stored replay.
 */
export function CinematicReplay({ fixture, clubLabel, crestUrl }: MatchProps) {
  const [playing, setPlaying] = useState(false);
  const opponent = opponentLabel(fixture);
  const title = `${clubLabel} vs ${opponent} match replay`;
  const stored = fixture.replayVideoUrl ?? "";
  const embed = MATCH_REPLAY_EMBED_PATTERN.test(stored) ? `${stored}&autoplay=1` : "";
  const cover = (label: ReactNode) => <>
    <span className="replay-side home">{crestUrl && <NativeImage src={crestUrl} alt="" />}</span>
    <span className="replay-vs" aria-hidden="true">vs</span>
    <span className="replay-side away"><OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={220} variant="dark" /></span>
    <span className="replay-watch">{label}</span>
  </>;
  return <section className="replay" aria-labelledby="replay-title">
    <p className="eyebrow">{clubLabel} vs {opponent}</p>
    <h2 id="replay-title">Replay the match</h2>
    <div className="replay-card">
      {!embed ? <div className="replay-cover" role="img" aria-label={`${title} coming soon`}>{cover(<>{WATCH_LOGO}<span className="replay-soon">Coming soon</span></>)}</div>
        : playing ? <iframe src={embed} title={title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        : <button type="button" className="replay-cover" aria-label={`Play ${title}`} onClick={() => setPlaying(true)}>{cover(WATCH_LOGO)}</button>}
    </div>
  </section>;
}
