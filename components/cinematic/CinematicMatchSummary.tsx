"use client";

// RC2027-MATCH-SUMMARY: Sam's Match Summary page (approved preview: outer design-explorations/match-summary-2027).
// The score header and the replay card are the Home components. Every value comes from the Schedule
// editor; sections a match has no details for are hidden.
import { Fragment } from "react";
import Link from "next/link";
import type { Fixture } from "@/lib/data";
import NativeImage from "@/components/ResilientNativeImage";
import OpponentCrest from "@/components/OpponentCrest";
import { scheduleDate, scheduleKickoff } from "@/lib/cinematic-schedule";
import { youtubeWatchUrl } from "@/lib/youtube-embed";
import { MATCH_SIDES, type MatchEvent, type MatchPerson, type MatchSummary } from "@/lib/match-summary";
import { CinematicLatestResult, CinematicReplay } from "./CinematicMatchResult";
import "./match-summary.css";

type Props = { fixture: Fixture; clubLabel: string; crestUrl: string; timeZone: string };
const ICON = "/rose-city/icons";
const KIND_ICON = { yellow: "yellow-card", red: "red-card", sub: "sub-arrows" } as const;
const KIND_LABEL = { goal: "Goal", yellow: "Yellow card", red: "Red card", sub: "Substitution" } as const;
const STATE_NAMES: Record<string, string> = { CA: "California" };

function Crest({ club, crestUrl, fixture }: { club: boolean; crestUrl: string; fixture: Fixture }) {
  return <span className="event-crest">{club ? crestUrl && <NativeImage src={crestUrl} alt="" /> : <OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={44} />}</span>;
}

function Timeline({ events, fixture, crestUrl, clubLabel }: { events: MatchEvent[]; fixture: Fixture; crestUrl: string; clubLabel: string }) {
  let club = 0, opponent = 0;
  return <ol className="summary-timeline">{events.map((event, index) => {
    if (event.kind === "goal") { if (event.side === "club") club += 1; else opponent += 1; }
    const isClub = event.side === "club";
    const text = <span className="event-text">{event.kind === "sub"
      ? <><span className="sub-on"><b aria-hidden="true" className="arrow up" />{event.player}<span className="sr-only"> on</span></span>{event.detail && <span className="sub-off"><b aria-hidden="true" className="arrow down" />{event.detail}<span className="sr-only"> off</span></span>}</>
      : <><span className="event-player">{event.kind === "goal" ? `Goal: ${event.player}` : event.player}</span>{event.detail && <span className="event-detail">{event.detail}</span>}</>}</span>;
    return <li key={index} className={`summary-event ${event.side}`} aria-label={`${event.minute.replace(/′/g, " minutes")}, ${isClub ? clubLabel : fixture.opponent}, ${KIND_LABEL[event.kind]}`}>
      <div className="event-half club">{isClub && <>{text}<Crest club crestUrl={crestUrl} fixture={fixture} /><span className="event-minute">{event.minute}</span></>}</div>
      <div className="event-mark">{event.kind === "goal" ? <span className="event-score">{club} : {opponent}</span> : <span className="event-icon"><img src={`${ICON}/${KIND_ICON[event.kind]}.png`} alt="" /></span>}</div>
      <div className="event-half opponent">{!isClub && <><span className="event-minute">{event.minute}</span><Crest club={false} crestUrl={crestUrl} fixture={fixture} />{text}</>}</div>
    </li>;
  })}</ol>;
}

function Statistics({ stats, fixture, crestUrl, clubLabel }: { stats: MatchSummary["stats"]; fixture: Fixture; crestUrl: string; clubLabel: string }) {
  return <section className="summary-section" aria-labelledby="stats-title"><h2 id="stats-title">Statistics</h2>
    <div className="stats-teams"><span>{crestUrl && <NativeImage src={crestUrl} alt="" />}{clubLabel}</span><span>{fixture.opponentShortName || fixture.opponent}<OpponentCrest name={fixture.opponent} logoUrl={fixture.opponentLogoUrl} size={40} /></span></div>
    <dl className="summary-stats">{stats.map((stat, index) => {
      const total = stat.club + stat.opponent;
      const share = total > 0 ? Math.round(stat.club / total * 1000) / 10 : 50;
      return <div key={index} className="stat-row">
        <dt>{stat.label}</dt>
        <dd className="stat-value club" data-lead={stat.club > stat.opponent}>{stat.club}</dd>
        <dd className="stat-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></dd>
        <dd className="stat-value opponent" data-lead={stat.opponent > stat.club}>{stat.opponent}</dd>
      </div>;
    })}</dl>
  </section>;
}

function Information({ fixture, summary, timeZone }: { fixture: Fixture; summary: MatchSummary | null; timeZone: string }) {
  const place = [fixture.city, fixture.state ? STATE_NAMES[fixture.state] ?? fixture.state : ""].filter(Boolean).join(", ");
  const rows = ([
    ["soccer-field", "Stadium", fixture.venue], ["location-pin", "Location", place],
    ["calendar", "Date", scheduleDate(fixture.date)], ["clock", "Kickoff", scheduleKickoff(fixture.time, timeZone)],
    ["fan", "Attendance", fixture.attendance != null ? fixture.attendance.toLocaleString("en-US") : ""],
  ] as const).filter(row => row[2]);
  const officials = summary?.officials ?? [], kit = summary?.kit ?? [];
  return <section className="summary-section" aria-labelledby="info-title"><h2 id="info-title">Match information</h2>
    <div className="summary-info">
      <dl className="info-list">{rows.map(([icon, label, value]) => <div key={label}><dt><img src={`${ICON}/${icon}.png`} alt="" />{label}:</dt><dd>{value}</dd></div>)}</dl>
      {(officials.length > 0 || kit.length > 0) && <div className="info-groups">
        {officials.length > 0 && <dl><img src={`${ICON}/referee-whistle.png`} alt="" className="group-icon" />{officials.map((person, i) => <div key={i}><dt>{person.role}:</dt><dd>{person.name}</dd></div>)}</dl>}
        {kit.length > 0 && <dl><img src={`${ICON}/jersey.png`} alt="" className="group-icon" />{kit.map((row, i) => <div key={i}><dt>{row.item} color:</dt><dd>{row.color}</dd></div>)}</dl>}
      </div>}
    </div>
  </section>;
}

function People({ title, people, club, rules }: { title: string; people: MatchPerson[]; club: boolean; rules?: boolean }) {
  return <div className={`lineup ${club ? "club" : "opponent"}`}><h3>{title}</h3><ul data-rules={rules}>{people.map((person, i) => <li key={i}>{club
    ? <>{person.number && <><b>#{person.number}</b> </>}{person.name}</>
    : <>{person.name}{person.number && <> <b>#{person.number}</b></>}</>}</li>)}</ul></div>;
}

export default function CinematicMatchSummary({ fixture, clubLabel, crestUrl, timeZone }: Props) {
  const played = fixture.roseCityScore != null && fixture.opponentScore != null;
  const summary = fixture.summary ?? null;
  const opponent = fixture.opponentShortName || fixture.opponent;
  const video = youtubeWatchUrl(fixture.replayVideoUrl);
  const heading = <header className="summary-heading"><h1>Match Summary</h1><p>Summary, stats, info, lineups &amp; replay</p></header>;
  if (!played) return <div className="match-summary">{heading}
    <div className="summary-pending"><p>The summary for {clubLabel} vs {opponent} on {scheduleDate(fixture.date)} will appear after the match.</p><Link href="/schedule">Back to the schedule</Link></div>
  </div>;
  const hasLineups = summary ? MATCH_SIDES.some(side => summary.lineups[side].starting.length || summary.lineups[side].bench.length || summary.lineups[side].staff.length) : false;
  return <div className="match-summary">
    {heading}
    <div className="summary-score">
      <CinematicLatestResult fixture={fixture} clubLabel={clubLabel} crestUrl={crestUrl} />
      {video && <a className="summary-youtube" href={video} target="_blank" rel="noopener noreferrer"><span>Watch the match below or on YouTube</span><img src={`${ICON}/youtube-logo.png`} alt="YouTube (opens in a new tab)" /></a>}
    </div>
    <div className="summary-body">
      {summary && summary.events.length > 0 && <section className="summary-section" aria-labelledby="summary-title"><h2 id="summary-title">Summary</h2><Timeline events={summary.events} fixture={fixture} crestUrl={crestUrl} clubLabel={clubLabel} /></section>}
      {summary && summary.stats.length > 0 && <Statistics stats={summary.stats} fixture={fixture} crestUrl={crestUrl} clubLabel={clubLabel} />}
      <Information fixture={fixture} summary={summary} timeZone={timeZone} />
    </div>
    <CinematicReplay fixture={fixture} clubLabel={clubLabel} crestUrl={crestUrl} />
    {summary && hasLineups && <div className="summary-lineups">{MATCH_SIDES.map(side => {
      const lineup = summary.lineups[side], club = side === "club", label = club ? clubLabel : opponent;
      return <Fragment key={side}><div className={`lineup-column ${side}`}>
        {lineup.starting.length > 0 && <People title={`${label} Starting XI`} people={lineup.starting} club={club} />}
        {lineup.bench.length > 0 && <People title={`${label} Bench`} people={lineup.bench} club={club} rules />}
        {lineup.staff.length > 0 && <div className={`lineup ${side}`}><h3>{label} Managers</h3><ul data-rules="true">{lineup.staff.map((person, i) => <li key={i} className="staff"><span>{person.name}</span>{person.role && <small>{person.role}</small>}</li>)}</ul></div>}
      </div></Fragment>;
    })}</div>}
  </div>;
}
