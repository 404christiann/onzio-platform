"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Fixture } from "@/lib/data";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import { nextScheduleFixture, orderedSchedule, scheduleDate, scheduleKickoff, SCHEDULE_PAGE_SIZE } from "@/lib/cinematic-schedule";
import { outcomeForFixture } from "@/lib/editorial-fixtures";
import { youtubeWatchUrl } from "@/lib/youtube-embed";
import "./schedule.css";

export type CinematicScheduleData = { fixtures: Fixture[]; seasonLabel: string; timeZone: string };

function Pin() {
  return <svg width="14" height="17" viewBox="0 0 13 16" aria-hidden="true"><path fill="currentColor" d="M6.5 0A6.5 6.5 0 0 0 0 6.5C0 10 6.5 16 6.5 16S13 10 13 6.5A6.5 6.5 0 0 0 6.5 0m0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5" /></svg>;
}

export default function CinematicSchedule({ schedule, initialNow }: { schedule: CinematicScheduleData; initialNow?: Date }) {
  const [now, setNow] = useState(() => initialNow ?? new Date());
  const [visibleCount, setVisibleCount] = useState(SCHEDULE_PAGE_SIZE);
  const list = useRef<HTMLOListElement>(null);
  const newlyRevealedIndex = useRef<number | null>(null);
  const fixtures = useMemo(() => orderedSchedule(schedule.fixtures), [schedule.fixtures]);
  const visible = fixtures.slice(0, visibleCount);
  const next = nextScheduleFixture(fixtures, now, schedule.timeZone);
  const hasMore = visible.length < fixtures.length;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (newlyRevealedIndex.current === null) return;
    list.current?.querySelectorAll<HTMLElement>(".fixture-card")[newlyRevealedIndex.current]?.focus({ preventScroll: true });
    newlyRevealedIndex.current = null;
  }, [visibleCount]);
  function loadMore() {
    newlyRevealedIndex.current = visible.length;
    setVisibleCount(count => Math.min(count + SCHEDULE_PAGE_SIZE, fixtures.length));
  }
  return <div className="cinematic-schedule"><div className="schedule-page">
    <header className="schedule-heading"><h1>Schedule</h1><p>{schedule.seasonLabel} Season</p><div /></header>
    {fixtures.length === 0 ? <div className="schedule-empty"><h2>Schedule coming soon</h2><p>No official fixtures have been published yet.</p></div> : <>
      <div className="schedule-columns" aria-hidden="true"><span>Date</span><span>Opponent</span><span>Kickoff</span><span>League</span><span>Results</span><span>Summary</span><span>Rewatch the match</span></div>
      <ol ref={list} id="cinematic-schedule-fixtures" className="fixture-list">
        {visible.map((fixture, index) => {
          const isNext = next === fixture;
          const outcome = outcomeForFixture(fixture);
          const name = fixture.opponent.trim();
          const played = fixture.roseCityScore != null && fixture.opponentScore != null;
          // One optional YouTube link per match: the stream before kickoff, the replay afterwards.
          const video = youtubeWatchUrl(fixture.replayVideoUrl);
          return <li key={fixture.id ?? `${fixture.date}-${fixture.time}-${name}`} className="fixture-item" data-fixture-id={fixture.id}>
            <span className="fixture-number" aria-hidden="true">{index + 1}</span>
            <article tabIndex={-1} className="fixture-card" data-next={isNext} aria-label={`${name}, ${scheduleDate(fixture.date)}`}>
              <div className="fixture-date"><time dateTime={fixture.date}>{scheduleDate(fixture.date)}</time>{isNext && <span className="next-badge">Next</span>}</div>
              <div className="fixture-opponent">
                <OpponentCrest name={name} logoUrl={fixture.opponentLogoUrl} size={62} variant={isNext ? "dark" : "light"} className="schedule-opponent-crest" />
                <div><div className="opponent-title"><h2>{name}</h2><span className="home-away">{fixture.home ? "Home" : "Away"}</span></div><p className="fixture-venue">{[fixture.venue, [fixture.city, fixture.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")}{fixture.address && <a className="fixture-directions" href={`https://maps.google.com/?q=${encodeURIComponent(fixture.address)}`} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${fixture.venue}`}><Pin />Directions</a>}</p></div>
              </div>
              <div className="fixture-kickoff"><span className="mobile-label">Kickoff</span>{scheduleKickoff(fixture.time, schedule.timeZone)}</div>
              <div className="fixture-league">{fixture.leagueLogoUrl
                ? <NativeImage src={fixture.leagueLogoUrl} alt={fixture.competition ? `${fixture.competition} league logo` : "League logo"} width={38} height={47} />
                : fixture.competition ? <span className="league-name">{fixture.competition}</span> : <span aria-label="League to be announced">—</span>}</div>
              <div className="fixture-result">{outcome ? <><span className="result-outcome" data-outcome={outcome}>{outcome}</span><strong aria-label={`${fixture.roseCityScore} to ${fixture.opponentScore}`}>{fixture.roseCityScore}<span className="score-separator" aria-hidden="true">-</span>{fixture.opponentScore}</strong><span className="sr-only">{outcome === "W" ? "Win" : outcome === "L" ? "Loss" : "Draw"}</span></> : <span className="sr-only">Not played</span>}</div>
              <div className="fixture-summary">{played && fixture.id && <Link href={`/schedule/${fixture.id}`}>Match Summary<span className="sr-only"> for {name}, {scheduleDate(fixture.date)}</span></Link>}</div>
              <div className="fixture-watch">{video
                ? <a href={video} target="_blank" rel="noopener noreferrer" aria-label={`${played ? "Rewatch" : "Watch"} ${name} on YouTube (opens in a new tab)`}><img src={`/rose-city/icons/watch-on-youtube-${isNext ? "white" : "black"}.png`} alt="" /></a>
                : <span className="watch-soon">{played ? "Replay" : "Stream"} coming soon</span>}</div>
            </article>
            {fixture.sponsorLogoUrl && <div className="match-sponsor"><span>Presented by</span><NativeImage src={fixture.sponsorLogoUrl} alt={fixture.sponsorName || "Match sponsor"} width={172} height={35} /></div>}
          </li>;
        })}
      </ol>
      {fixtures.length > SCHEDULE_PAGE_SIZE && <div className="schedule-pagination">
        {hasMore && <button type="button" className="load-more-matches" aria-controls="cinematic-schedule-fixtures" onClick={loadMore}>Load more matches</button>}
        <p role="status" aria-live="polite" aria-atomic="true">{hasMore ? `Showing ${visible.length} of ${fixtures.length} matches` : `All ${fixtures.length} matches shown`}</p>
      </div>}
      <p className="schedule-disclaimer">Match details &amp; venues are subject to change</p>
    </>}
  </div></div>;
}
