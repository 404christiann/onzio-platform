"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import Image from "@/components/ResilientImage";
import OpponentCrest from "@/components/OpponentCrest";
import type { Fixture } from "@/lib/data";
import { fetchActiveSeason, fetchSchedule } from "@/lib/queries";
import { imageDeliveryProps } from "@/lib/image-delivery";

type StatusFilter = "all" | "upcoming" | "played";

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" });
const monthHeading = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const dayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function fixtureKickoff(fixture: Fixture) {
  const [year, month, day] = fixture.date.split("-").map(Number);
  const [hour = 0, minute = 0] = (fixture.time || "00:00")
    .split(":")
    .map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function formatKickoff(fixture: Fixture) {
  if (!fixture.time || fixture.time.toUpperCase() === "TBD") return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(fixtureKickoff(fixture));
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function matchStatus(fixture: Fixture, now: Date): Exclude<StatusFilter, "all"> {
  if (fixture.roseCityScore !== null && fixture.opponentScore !== null) {
    return "played";
  }
  return fixtureKickoff(fixture).getTime() < now.getTime() ? "played" : "upcoming";
}

function resultLabel(fixture: Fixture) {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  const outcome =
    fixture.roseCityScore > fixture.opponentScore
      ? "W"
      : fixture.roseCityScore < fixture.opponentScore
        ? "L"
        : "D";
  return {
    outcome,
    score: `${fixture.roseCityScore}-${fixture.opponentScore}`,
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export default function ClubhouseSchedulePage() {
  const club = useClubContext();
  const { clubLogoUrl } = useClubBranding();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [seasonLabel, setSeasonLabel] = useState("Current season");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchActiveSeason(club.id)
      .then(async (activeSeason) => {
        const nextFixtures = activeSeason
          ? await fetchSchedule(activeSeason.id, club.id)
          : await fetchSchedule(undefined, club.id);
        if (cancelled) return;
        const currentTime = new Date();
        setSeasonLabel(activeSeason?.label ?? "Current season");
        setFixtures(nextFixtures);
        const upcoming = nextFixtures.find(
          (fixture) => matchStatus(fixture, currentTime) === "upcoming",
        );
        setSelectedMonth(monthKey((upcoming ?? nextFixtures[0])?.date ?? new Date().toISOString()));
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Failed to load schedule.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [club.id]);

  const months = useMemo(
    () => Array.from(new Set(fixtures.map((fixture) => monthKey(fixture.date)))),
    [fixtures],
  );
  const selected = selectedMonth ?? months[0] ?? new Date().toISOString().slice(0, 7);
  const visibleFixtures = fixtures.filter((fixture) => {
    const status = matchStatus(fixture, now);
    return monthKey(fixture.date) === selected && (statusFilter === "all" || statusFilter === status);
  });
  const nextFixture = fixtures.find((fixture) => matchStatus(fixture, now) === "upcoming");

  return (
    <main className="clubhouse-route-page clubhouse-schedule-page">
      <section className="clubhouse-route-hero">
        <div>
          <span className="clubhouse-eyebrow">{seasonLabel}</span>
          <h1>Team schedule</h1>
        </div>
        {clubLogoUrl && (
          <Image
            src={clubLogoUrl}
            alt={`${club.name} crest`}
            width={140}
            height={138}
            priority
            {...imageDeliveryProps("club-logo")}
          />
        )}
      </section>

      <section className="clubhouse-schedule-shell">
        <div className="clubhouse-schedule-filter-panel">
          <fieldset>
            <legend>Match status</legend>
            {(["all", "upcoming", "played"] as const).map((status) => (
              <button
                type="button"
                key={status}
                aria-pressed={statusFilter === status}
                data-active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All matches" : status === "played" ? "Results" : "Upcoming"}
              </button>
            ))}
          </fieldset>
          <p>{fixtures.length} fixtures</p>
        </div>

        {months.length > 0 && (
          <nav className="clubhouse-schedule-month-rail" aria-label="Schedule months">
            {months.map((month) => {
              const date = new Date(`${month}-02T12:00:00`);
              return (
                <button
                  type="button"
                  key={month}
                  aria-pressed={selected === month}
                  data-active={selected === month}
                  onClick={() => setSelectedMonth(month)}
                >
                  {monthLabel.format(date)}
                </button>
              );
            })}
          </nav>
        )}

        <div className="clubhouse-schedule-month-heading">
          <div>
            <span>{visibleFixtures.length} {visibleFixtures.length === 1 ? "match" : "matches"}</span>
            <h2>{monthHeading.format(new Date(`${selected}-02T12:00:00`))}</h2>
          </div>
          <small>{nextFixture ? `Next: ${nextFixture.opponent}` : "Season complete"}</small>
        </div>

        {loading && <div className="clubhouse-route-state">Loading fixtures...</div>}
        {error && !loading && <div className="clubhouse-route-state">Schedule unavailable.</div>}
        {!loading && !error && (
          <div className="clubhouse-schedule-card-grid">
            {visibleFixtures.map((fixture) => (
              <article
                className="clubhouse-schedule-match-card"
                data-next={nextFixture === fixture}
                key={`${fixture.date}-${fixture.opponent}`}
              >
                <div className="clubhouse-schedule-match-stage">
                  <div className="clubhouse-schedule-match-team">
                    {clubLogoUrl && (
                      <span className="clubhouse-schedule-match-crest">
                        <Image
                          src={clubLogoUrl}
                          alt={`${club.name} crest`}
                          fill
                          sizes="60px"
                          {...imageDeliveryProps("club-logo")}
                        />
                      </span>
                    )}
                    <strong>{club.name.replace(/ Football Club$/i, " FC")}</strong>
                  </div>
                  <div className="clubhouse-schedule-match-center">
                    {resultLabel(fixture) ? (
                      <strong>{resultLabel(fixture)?.score}</strong>
                    ) : (
                      <strong>VS</strong>
                    )}
                    <span>{fixture.home ? "Home" : "Away"}</span>
                  </div>
                  <div className="clubhouse-schedule-match-team">
                    <OpponentCrest
                      name={fixture.opponent}
                      logoUrl={fixture.opponentLogoUrl}
                      size={60}
                      variant="dark"
                    />
                    <strong>{fixture.opponentShortName || fixture.opponent}</strong>
                  </div>
                </div>
                <div className="clubhouse-schedule-match-details">
                  <div className="clubhouse-schedule-match-kicker">
                    <span>{fixture.competition || "League match"}</span>
                    {resultLabel(fixture) ? (
                      <b data-outcome={resultLabel(fixture)?.outcome}>{resultLabel(fixture)?.outcome}</b>
                    ) : nextFixture === fixture ? (
                      <b>Next</b>
                    ) : null}
                  </div>
                  <h3>{fixture.opponent}</h3>
                  <dl>
                    <div>
                      <dt>Date</dt>
                      <dd>{dayLabel.format(fixtureKickoff(fixture))}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{formatKickoff(fixture)}</dd>
                    </div>
                    <div>
                      <dt>Venue</dt>
                      <dd>{fixture.venue}</dd>
                    </div>
                  </dl>
                  {fixture.id && (
                    <Link
                      className="clubhouse-schedule-match-action"
                      href={`/schedule/${fixture.id}`}
                    >
                      <span aria-hidden>{initials(fixture.opponent)}</span>
                      Match area
                      <b aria-hidden>→</b>
                    </Link>
                  )}
                  {fixture.address && (
                    <Link
                      className="clubhouse-schedule-match-action clubhouse-schedule-match-action-secondary"
                      href={`https://maps.google.com/?q=${encodeURIComponent(fixture.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span aria-hidden>{initials(fixture.opponent)}</span>
                      Directions
                      <b aria-hidden>→</b>
                    </Link>
                  )}
                </div>
              </article>
            ))}
            {visibleFixtures.length === 0 && (
              <div className="clubhouse-schedule-empty">
                <strong>No matches in this view.</strong>
                <p>Choose another month or status filter.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
