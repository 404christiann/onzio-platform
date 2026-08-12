"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import EditorialScheduleMatchCard from "@/components/editorial/EditorialScheduleMatchCard";
import type { Fixture } from "@/lib/data";

/**
 * Presentational editorial schedule view, ported from the approved concept
 * mockup (soccerplatformmockups src/components/public/ScheduleScreen.tsx).
 *
 * The caller (`EditorialSchedule`) supplies the already-fetched active-season
 * fixture list as a prop, so this component stays independently testable
 * without mocking Supabase — the same `EditorialHome`/`EditorialRoster`
 * fetch-once-and-pass-down convention established in L4/L5.
 *
 * Titled "Team schedule": a functional month rail built from the distinct
 * months actually present in the fixture list, an unboxed status-tab row
 * (All / Upcoming / Results), and a solid-color matchup card grid. No season
 * selector — Starter is locked to the single active season
 * (`lib/club-features.ts` never grants the `seasons` feature to Starter), so
 * this view never renders one, not even a disabled placeholder. Filter/month
 * changes use the same Framer Motion `AnimatePresence` exit/reveal approach
 * L5's roster filter established, with a `prefers-reduced-motion` fallback.
 */

export type ScheduleStatusFilter = "all" | "upcoming" | "played";

const STATUS_FILTERS: ScheduleStatusFilter[] = ["all", "upcoming", "played"];

const STATUS_LABEL: Record<ScheduleStatusFilter, string> = {
  all: "All matches",
  upcoming: "Upcoming",
  played: "Results",
};

const monthLabelFormat = new Intl.DateTimeFormat("en-US", { month: "short" });
const monthHeadingFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

/** "2026-08-15" -> "2026-08". */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** A safe mid-month noon Date for a "YYYY-MM" key, immune to timezone day-boundary drift. */
function monthKeyToDate(month: string): Date {
  return new Date(`${month}-02T12:00:00`);
}

const byDate = (a: Fixture, b: Fixture) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** A fixture with a recorded result on both sides — mirrors `findLatestResult`'s own criterion. */
export function isPlayedFixture(fixture: Fixture): boolean {
  return fixture.roseCityScore != null && fixture.opponentScore != null;
}

/** Distinct months actually present in the fixture list, in chronological order. */
export function distinctMonths(fixtures: Fixture[]): string[] {
  const months: string[] = [];
  const seen = new Set<string>();
  for (const fixture of [...fixtures].sort(byDate)) {
    const key = monthKey(fixture.date);
    if (!seen.has(key)) {
      seen.add(key);
      months.push(key);
    }
  }
  return months;
}

/**
 * The month of the first upcoming (unplayed) fixture, or the month of the
 * last fixture when every fixture has been played, or the current month
 * when the list is empty — mirroring the mockup's own `initialMonth`.
 */
export function initialMonthKey(fixtures: Fixture[], now: Date = new Date()): string {
  const sorted = [...fixtures].sort(byDate);
  const firstUpcoming = sorted.find((fixture) => !isPlayedFixture(fixture));
  if (firstUpcoming) return monthKey(firstUpcoming.date);
  const last = sorted.at(-1);
  return last ? monthKey(last.date) : monthKey(now.toISOString().slice(0, 10));
}

/** The id of the earliest upcoming (unplayed) fixture, or null. */
export function firstUpcomingFixtureId(fixtures: Fixture[]): string | null {
  const sorted = [...fixtures].sort(byDate);
  return sorted.find((fixture) => !isPlayedFixture(fixture))?.id ?? null;
}

/** Fixtures in the selected month matching the selected status filter. */
export function visibleFixturesForFilter(
  fixtures: Fixture[],
  month: string,
  statusFilter: ScheduleStatusFilter,
): Fixture[] {
  return [...fixtures].sort(byDate).filter((fixture) => {
    if (monthKey(fixture.date) !== month) return false;
    if (statusFilter === "all") return true;
    return statusFilter === "played" ? isPlayedFixture(fixture) : !isPlayedFixture(fixture);
  });
}

export default function EditorialScheduleView({
  fixtures,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  timeZone,
  league,
}: {
  fixtures: Fixture[];
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
  timeZone?: string;
  league?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const months = useMemo(() => distinctMonths(fixtures), [fixtures]);
  const [selectedMonth, setSelectedMonth] = useState(() => initialMonthKey(fixtures));
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("all");
  const nextFixtureId = useMemo(() => firstUpcomingFixtureId(fixtures), [fixtures]);
  const visibleFixtures = visibleFixturesForFilter(fixtures, selectedMonth, statusFilter);

  return (
    <div className="schedule-calendar-page">
      <main className="schedule-calendar-shell">
        <header className="schedule-calendar-head">
          <div>
            <h1>Team schedule</h1>
          </div>
        </header>

        <div className="schedule-filter-panel">
          <fieldset>
            <legend>Match status</legend>
            {STATUS_FILTERS.map((status) => (
              <button
                type="button"
                key={status}
                aria-pressed={statusFilter === status}
                data-active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </fieldset>
        </div>

        <nav className="schedule-month-rail" aria-label="Schedule months">
          {months.map((month) => (
            <button
              type="button"
              key={month}
              aria-pressed={selectedMonth === month}
              data-active={selectedMonth === month}
              onClick={() => setSelectedMonth(month)}
            >
              {monthLabelFormat.format(monthKeyToDate(month))}
            </button>
          ))}
        </nav>

        <section className="schedule-month-section">
          <div className="schedule-month-heading">
            <div>
              <span>
                {visibleFixtures.length} {visibleFixtures.length === 1 ? "match" : "matches"}
              </span>
              <h2>{monthHeadingFormat.format(monthKeyToDate(selectedMonth))}</h2>
            </div>
            {league && <small>{league}</small>}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="schedule-card-grid"
              key={`${selectedMonth}-${statusFilter}`}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{
                duration: prefersReducedMotion ? 0.12 : 0.4,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {visibleFixtures.map((fixture, index) => (
                <motion.div
                  key={fixture.id ?? `${fixture.date}-${fixture.opponent}`}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.48, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                >
                  <EditorialScheduleMatchCard
                    fixture={fixture}
                    clubShortName={clubShortName}
                    clubInitials={clubInitials}
                    crestOnDarkUrl={crestOnDarkUrl}
                    timeZone={timeZone}
                    isNext={Boolean(fixture.id) && fixture.id === nextFixtureId}
                  />
                </motion.div>
              ))}
              {visibleFixtures.length === 0 && (
                <div className="schedule-empty">
                  <strong>No matches in this view.</strong>
                  <p>Choose another month or update the match-status filter.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
