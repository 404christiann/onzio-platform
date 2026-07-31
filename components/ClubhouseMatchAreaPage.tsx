"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import Image from "@/components/ResilientImage";
import OpponentCrest from "@/components/OpponentCrest";
import { fetchFixtureById } from "@/lib/queries";
import type { Fixture } from "@/lib/data";
import { imageDeliveryProps } from "@/lib/image-delivery";

const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

function fixtureKickoff(fixture: Fixture) {
  const [year, month, day] = fixture.date.split("-").map(Number);
  const [hour = 0, minute = 0] = (fixture.time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function statusLabel(fixture: Fixture) {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) {
    return "Match area";
  }
  return "Full time";
}

function scoreLabel(fixture: Fixture) {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) {
    return "VS";
  }
  return `${fixture.roseCityScore}-${fixture.opponentScore}`;
}

export default function ClubhouseMatchAreaPage({
  fixtureId,
}: {
  fixtureId: string;
}) {
  const club = useClubContext();
  const isClubhouse = club.presentationTemplateKey === "clubhouse@1";
  const { clubLogoUrl } = useClubBranding();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isClubhouse) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFixtureById(fixtureId, club.id)
      .then((nextFixture) => {
        if (!cancelled) setFixture(nextFixture);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load match.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id, fixtureId, isClubhouse]);

  if (!isClubhouse) {
    return (
      <main className="clubhouse-route-page">
        <div className="clubhouse-route-state">Match area unavailable.</div>
      </main>
    );
  }

  return (
    <main className="clubhouse-route-page clubhouse-match-area-page">
      <section className="clubhouse-match-area-shell">
        <Link href="/schedule" className="clubhouse-detail-back">
          Team schedule
        </Link>

        {loading && <div className="clubhouse-route-state">Loading match...</div>}
        {error && !loading && <div className="clubhouse-route-state">{error}</div>}
        {!loading && !error && !fixture && (
          <div className="clubhouse-route-state">Match not found.</div>
        )}
        {!loading && !error && fixture && (
          <>
            <header className="clubhouse-match-area-head">
              <p className="clubhouse-eyebrow">
                {statusLabel(fixture)} / {fixture.competition || "League match"}
              </p>
              <h1>{statusLabel(fixture)}</h1>
            </header>

            <div className="clubhouse-match-area-layout">
              <article className="clubhouse-match-area-card">
                <div className="clubhouse-schedule-match-stage">
                  <div className="clubhouse-schedule-match-team">
                    {clubLogoUrl && (
                      <span className="clubhouse-schedule-match-crest">
                        <Image
                          src={clubLogoUrl}
                          alt={`${club.name} crest`}
                          fill
                          sizes="64px"
                          {...imageDeliveryProps("club-logo")}
                        />
                      </span>
                    )}
                    <strong>{club.name.replace(/ Football Club$/i, " FC")}</strong>
                  </div>
                  <div className="clubhouse-schedule-match-center">
                    <strong>{scoreLabel(fixture)}</strong>
                    <span>{fixture.home ? "Home" : "Away"}</span>
                  </div>
                  <div className="clubhouse-schedule-match-team">
                    <OpponentCrest
                      name={fixture.opponent}
                      logoUrl={fixture.opponentLogoUrl}
                      size={64}
                      variant="dark"
                    />
                    <strong>{fixture.opponentShortName || fixture.opponent}</strong>
                  </div>
                </div>
              </article>

              <aside className="clubhouse-match-area-notes">
                <span>Match information</span>
                <h2>{fixture.opponent}</h2>
                <dl>
                  <div>
                    <dt>Date</dt>
                    <dd>{fullDate.format(fixtureKickoff(fixture))}</dd>
                  </div>
                  <div>
                    <dt>Venue</dt>
                    <dd>{fixture.venue}</dd>
                  </div>
                  <div>
                    <dt>Setting</dt>
                    <dd>{fixture.home ? "Home" : "Away"}</dd>
                  </div>
                  {fixture.city && (
                    <div>
                      <dt>City</dt>
                      <dd>{fixture.city}{fixture.state ? `, ${fixture.state}` : ""}</dd>
                    </div>
                  )}
                </dl>
                <p>
                  {fixture.roseCityScore == null
                    ? "Matchday updates and final details will appear here as kickoff approaches."
                    : `${club.name} finished ${scoreLabel(fixture)} against ${fixture.opponent}.`}
                </p>
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
