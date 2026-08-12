"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import EditorialScheduleMatchCard from "@/components/editorial/EditorialScheduleMatchCard";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import type { Fixture } from "@/lib/data";

/**
 * Real Starter-tier Lions match-area page for a single fixture
 * (`/schedule/[fixtureId]`), ported from the approved concept mockup
 * (soccerplatformmockups src/components/public/MatchAreaScreen.tsx).
 *
 * Fetches the active-season fixture list through the same tenant-scoped
 * `fetchActiveSeason`/`fetchSchedule` helpers `EditorialSchedule` uses (no
 * duplicate query added), then looks up the requested fixture id in that
 * already club-scoped result. A fixture id belonging to a different club can
 * never resolve here: the query is filtered to `club.id` from the verified
 * tenant context (never a client-supplied value), so a foreign id simply
 * never appears in the fetched list and falls through to the not-found
 * state below — the same defense-in-depth every other tenant-scoped query in
 * this codebase relies on, backed by `onzio.matches` RLS.
 */

export type MatchAreaContentProps = {
  fixture: Fixture | null;
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
  timeZone?: string;
  league?: string;
};

/**
 * Presentational body, exported separately so the found/not-found states and
 * the played/upcoming eyebrow can be rendered and tested directly without
 * mocking the fetch effect below.
 */
export function MatchAreaContent({
  fixture,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  timeZone,
  league,
}: MatchAreaContentProps) {
  if (!fixture) {
    return (
      <main className="match-area-page match-area-empty">
        <h1>Match not found.</h1>
        <Link href="/schedule">Return to the schedule</Link>
      </main>
    );
  }

  const played = fixture.roseCityScore != null && fixture.opponentScore != null;
  const scorers = fixture.scorers ?? [];

  return (
    <main className="match-area-page">
      <div className="match-area-shell">
        <Link className="match-area-back" href="/schedule">
          ← Team schedule
        </Link>
        <header className="match-area-head">
          <span className="eyebrow">{played ? "Match report" : "Next match"}</span>
          <h1>{played ? "Full time" : "Match area"}</h1>
        </header>
        <div className="match-area-layout">
          <EditorialScheduleMatchCard
            fixture={fixture}
            clubShortName={clubShortName}
            clubInitials={clubInitials}
            crestOnDarkUrl={crestOnDarkUrl}
            timeZone={timeZone}
            showAction={false}
          />
          <aside className="match-area-notes">
            <span>Match information</span>
            <h2>{fixture.competition || league || clubShortName}</h2>
            <dl>
              <div>
                <dt>Setting</dt>
                <dd>{fixture.home ? "Home" : "Away"}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{fixture.venue}</dd>
              </div>
              {played && fixture.attendance != null && (
                <div>
                  <dt>Attendance</dt>
                  <dd>{fixture.attendance.toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {played && scorers.length > 0 ? (
              <div className="match-area-scorers">
                <span>{clubShortName} scorers</span>
                <p>{scorers.join(" · ")}</p>
              </div>
            ) : (
              <p className="match-area-copy">
                Matchday updates and final details will appear here as kickoff approaches.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function EditorialMatchArea() {
  const club = useClubContext();
  const { identity, crestOnDarkUrl } = useEditorialIdentity();
  const params = useParams<{ fixtureId: string }>();
  const fixtureId = params?.fixtureId;
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSeason(club.id)
      .then((season) => (season ? fetchSchedule(season.id, club.id) : Promise.resolve([])))
      .then((rows) => {
        if (!cancelled) setFixtures(rows);
      })
      .catch((error) => {
        console.error("EditorialMatchArea:", error);
        if (!cancelled) setFixtures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  if (fixtures === null) return null;

  const fixture = fixtures.find((item) => item.id === fixtureId) ?? null;
  const clubShortName = identity?.shortName || club.name;
  const clubInitials = identity?.initials || club.name.slice(0, 3).toUpperCase();

  return (
    <MatchAreaContent
      fixture={fixture}
      clubShortName={clubShortName}
      clubInitials={clubInitials}
      crestOnDarkUrl={crestOnDarkUrl}
      timeZone={identity?.timeZone}
      league={identity?.league}
    />
  );
}
