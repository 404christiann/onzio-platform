"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubTimeZone } from "@/components/ClubTimeZoneProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { fetchFixtureById } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import type { Fixture } from "@/lib/data";
import CinematicMatchSummary from "./CinematicMatchSummary";

type Loaded = { fixture: Fixture | null; clubLabel: string };

/** The server's read of this match for the first paint (Rose City's site page); absent when the browser loads it. */
export type CinematicMatchSummaryInitial = { data: Loaded | null; failed: boolean };

/**
 * Loads one of this club's matches for the cinematic@2 Match Summary page. Seeded with `initial` it renders on first
 * paint and does not fetch again; a failed server read keeps the retry button. The kickoff uses the club's saved time
 * zone at render time, so it is not part of what is fetched.
 */
export default function CinematicMatchSummaryPage({ fixtureId, initial }: { fixtureId: string; initial?: CinematicMatchSummaryInitial }) {
  const club = useClubContext();
  const timeZone = useClubTimeZone();
  const branding = useClubBranding();
  const [retry, setRetry] = useState(0);
  const key = `${club.id}:${fixtureId}`;
  const seeded = useRef(initial ? key : null);
  const [state, setState] = useState<{ key: string; data: Loaded | null; failed: boolean }>({ key: initial ? key : "", data: initial?.data ?? null, failed: initial?.failed ?? false });
  useEffect(() => {
    if (retry === 0 && seeded.current === key) return;
    let active = true;
    setState({ key, data: null, failed: false });
    void Promise.all([fetchFixtureById(fixtureId, club.id), fetchClubIdentity(club.id)]).then(([fixture, identity]) => {
      if (active) setState({ key, data: { fixture, clubLabel: identity?.initials || club.name }, failed: false });
    }).catch(() => { if (active) setState({ key, data: null, failed: true }); });
    return () => { active = false; };
  }, [key, fixtureId, club.id, club.name, retry]);
  const current = state.key === key ? state : null;
  if (!current?.data) return <div className="cinematic-schedule"><div className="schedule-state">
    <p role={current?.failed ? "alert" : "status"}>{current?.failed ? "This match summary is temporarily unavailable." : "Loading match…"}</p>
    {current?.failed && <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>}
  </div></div>;
  if (!current.data.fixture) return <div className="cinematic-schedule"><div className="schedule-state"><p role="status">We couldn’t find this match.</p><Link href="/schedule">Back to the schedule</Link></div></div>;
  return <CinematicMatchSummary fixture={current.data.fixture} clubLabel={current.data.clubLabel} crestUrl={branding.clubLogoUrl} timeZone={timeZone} />;
}
