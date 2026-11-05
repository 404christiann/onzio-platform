"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { fetchFixtureById } from "@/lib/queries";
import { fetchClubIdentity } from "@/lib/editorial-identity";
import type { Fixture } from "@/lib/data";
import CinematicMatchSummary from "./CinematicMatchSummary";

type Loaded = { fixture: Fixture | null; clubLabel: string; timeZone: string };

/** Loads one of this club's matches for the cinematic@2 Match Summary page. */
export default function CinematicMatchSummaryPage({ fixtureId }: { fixtureId: string }) {
  const club = useClubContext();
  const branding = useClubBranding();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data: Loaded | null; failed: boolean }>({ key: "", data: null, failed: false });
  const key = `${club.id}:${fixtureId}`;
  useEffect(() => {
    let active = true;
    setState({ key, data: null, failed: false });
    void Promise.all([fetchFixtureById(fixtureId, club.id), fetchClubIdentity(club.id)]).then(([fixture, identity]) => {
      if (active) setState({ key, data: { fixture, clubLabel: identity?.initials || club.name, timeZone: identity?.timeZone || "UTC" }, failed: false });
    }).catch(() => { if (active) setState({ key, data: null, failed: true }); });
    return () => { active = false; };
  }, [key, fixtureId, club.id, club.name, retry]);
  const current = state.key === key ? state : null;
  if (!current?.data) return <div className="cinematic-schedule"><div className="schedule-state">
    <p role={current?.failed ? "alert" : "status"}>{current?.failed ? "This match summary is temporarily unavailable." : "Loading match…"}</p>
    {current?.failed && <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>}
  </div></div>;
  if (!current.data.fixture) return <div className="cinematic-schedule"><div className="schedule-state"><p role="status">We couldn’t find this match.</p><Link href="/schedule">Back to the schedule</Link></div></div>;
  return <CinematicMatchSummary fixture={current.data.fixture} clubLabel={current.data.clubLabel} crestUrl={branding.clubLogoUrl} timeZone={current.data.timeZone} />;
}
