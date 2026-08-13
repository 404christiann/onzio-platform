"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import { useEditorialIdentity } from "@/components/editorial/EditorialIdentityContext";
import EditorialScheduleMatchCard from "@/components/editorial/EditorialScheduleMatchCard";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { monogram } from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

/**
 * Real Starter-tier editorial@1 match-area page for a single fixture
 * (/schedule/[fixtureId]), ported (visual design) from the approved concept
 * mockup via the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's EditorialMatchArea.tsx.
 *
 * fixtureId arrives as a prop rather than via useParams(), matching
 * ClubhouseMatchAreaPage's own convention (components/ClubhouseMatchAreaPage.tsx)
 * -- app/(public)/schedule/[fixtureId]/page.tsx resolves the fixtureId route
 * param server-side and passes it down, so both templates' match-area
 * components share the same calling shape.
 *
 * Fetches the active-season fixture list through the same tenant-scoped
 * fetchActiveSeason()/fetchSchedule() helpers EditorialSchedule uses (no
 * duplicate query added), then looks up the requested fixture id in that
 * already club-scoped result. A fixture id belonging to a different club can
 * never resolve here: the query is filtered to club.id from the verified
 * tenant context (never a client-supplied value), so a foreign id simply
 * never appears in the fetched list and falls through to the not-found
 * state below -- the same defense-in-depth every other tenant-scoped query
 * in this codebase relies on, backed by onzio.matches RLS.
 *
 * Attendance/scorers (onzio.matches.attendance/scorers, Lions E1) surface
 * here via Fixture.attendance/Fixture.scorers (lib/data.ts, additive E4
 * extension of fetchSchedule's mapping) -- the classic ClubhouseMatchAreaPage
 * does not show either field, so this is editorial@1-only presentation.
 */

export type MatchAreaContentProps = {
  fixture: Fixture | null;
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
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
  league,
}: MatchAreaContentProps) {
  if (!fixture) {
    return (
      <main className="match-area-page match-area-empty grid min-h-screen place-items-center bg-ed-paper px-5 text-ed-ink">
        <div className="grid gap-6 text-center">
          <h1 className="font-display text-5xl font-black uppercase">Match not found.</h1>
          <Link className="font-display text-sm font-black uppercase tracking-[0.16em] text-ed-accent" href="/schedule">
            Return to the schedule
          </Link>
        </div>
      </main>
    );
  }

  const played = fixture.roseCityScore != null && fixture.opponentScore != null;
  const scorers = fixture.scorers ?? [];

  return (
    <main className="match-area-page bg-ed-paper px-5 pb-28 pt-32 text-ed-ink md:px-8">
      <div className="match-area-shell mx-auto grid max-w-[1180px] gap-8">
        <Link className="match-area-back font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent" href="/schedule">
          Team schedule
        </Link>
        <header className="match-area-head grid gap-4">
          <span className="eyebrow">{played ? "Match report" : "Next match"}</span>
          <h1 className="text-[clamp(4rem,13vw,11rem)] font-black uppercase leading-[0.78]">
            {played ? "Full time" : "Match area"}
          </h1>
        </header>
        <div className="match-area-layout grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <EditorialScheduleMatchCard
            fixture={fixture}
            clubShortName={clubShortName}
            clubInitials={clubInitials}
            crestOnDarkUrl={crestOnDarkUrl}
            showAction={false}
          />
          <aside className="match-area-notes grid content-start gap-6 border border-[color:var(--ed-line)] bg-ed-panel-glass p-6">
            <span className="font-display text-xs font-black uppercase tracking-[0.16em] text-ed-accent">Match information</span>
            <h2 className="font-display text-4xl font-black uppercase leading-none">{fixture.competition || league || clubShortName}</h2>
            <dl className="grid gap-4">
              <div className="grid gap-1 border-t border-[color:var(--ed-line)] pt-4">
                <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Setting</dt>
                <dd className="text-lg font-semibold">{fixture.home ? "Home" : "Away"}</dd>
              </div>
              <div className="grid gap-1 border-t border-[color:var(--ed-line)] pt-4">
                <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Venue</dt>
                <dd className="text-lg font-semibold">{fixture.venue}</dd>
              </div>
              {played && fixture.attendance != null && (
                <div className="grid gap-1 border-t border-[color:var(--ed-line)] pt-4">
                  <dt className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">Attendance</dt>
                  <dd className="text-lg font-semibold">{fixture.attendance.toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {played && scorers.length > 0 ? (
              <div className="match-area-scorers grid gap-2 border-t border-[color:var(--ed-line)] pt-4">
                <span className="font-display text-xs font-black uppercase tracking-[0.14em] text-ed-muted">{clubShortName} scorers</span>
                <p className="text-lg font-semibold">{scorers.join(" · ")}</p>
              </div>
            ) : (
              <p className="match-area-copy text-ed-muted">
                Matchday updates and final details will appear here as kickoff approaches.
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function EditorialMatchArea({ fixtureId }: { fixtureId: string }) {
  const club = useClubContext();
  const { identity, crestOnDarkUrl } = useEditorialIdentity();
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSeason(club.id)
      .then((season) => (season ? fetchSchedule(season.id, club.id) : Promise.resolve([])))
      .then((rows) => {
        if (!cancelled) setFixtures(rows);
      })
      .catch((error: unknown) => {
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
  const clubInitials = identity?.initials || monogram(club.name);

  return (
    <MatchAreaContent
      fixture={fixture}
      clubShortName={clubShortName}
      clubInitials={clubInitials}
      crestOnDarkUrl={crestOnDarkUrl}
      league={identity?.league}
    />
  );
}
