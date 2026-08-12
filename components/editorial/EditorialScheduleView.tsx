"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import EditorialScheduleMatchCard from "@/components/editorial/EditorialScheduleMatchCard";
import {
  distinctMonths,
  firstUpcomingFixtureId,
  initialMonthKey,
  isPlayedFixture,
  monthKey,
  visibleFixturesForFilter,
  type ScheduleStatusFilter,
} from "@/lib/editorial-fixtures";
import type { Fixture } from "@/lib/data";

export {
  distinctMonths,
  firstUpcomingFixtureId,
  initialMonthKey,
  isPlayedFixture,
  monthKey,
  visibleFixturesForFilter,
};
export type { ScheduleStatusFilter };

/**
 * Presentational editorial schedule view, ported (visual design) from the
 * approved concept mockup via the superseded claude/lions-fc-website-setup-
 * ij0p7t reference branch's EditorialScheduleView.tsx.
 *
 * The caller (EditorialSchedule) supplies the already-fetched active-season
 * fixture list as a prop, so this component stays independently testable
 * without mocking Supabase -- the same EditorialHome/EditorialRoster
 * fetch-once-and-pass-down convention established in E3/E4.
 *
 * Titled "Team schedule": a functional month rail built from the distinct
 * months actually present in the fixture list, an unboxed status-tab row
 * (All / Upcoming / Results), and a solid-color matchup card grid. No season
 * selector -- Starter is locked to the single active season, so this view
 * never renders one, not even a disabled placeholder. Filter/month changes
 * use the same Motion AnimatePresence exit/reveal approach the roster filter
 * established (EditorialRosterView), with a prefers-reduced-motion
 * fallback. Imports from "motion/react" (this repo's real installed
 * package), not "framer-motion" -- see EditorialRosterView.tsx's doc
 * comment for why.
 *
 * The month/status-filter pure logic (monthKey/distinctMonths/
 * initialMonthKey/firstUpcomingFixtureId/isPlayedFixture/
 * visibleFixturesForFilter) lives in lib/editorial-fixtures.ts (a plain,
 * non-JSX module), not here, so contract tests can exercise it directly --
 * see EditorialRosterView.tsx's doc comment for why. Re-exported above for
 * callers that only need to import this one module.
 */

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

/** A safe mid-month noon Date for a "YYYY-MM" key, immune to timezone day-boundary drift. */
function monthKeyToDate(month: string): Date {
  return new Date(`${month}-02T12:00:00`);
}

export default function EditorialScheduleView({
  fixtures,
  clubShortName,
  clubInitials,
  crestOnDarkUrl,
  league,
}: {
  fixtures: Fixture[];
  clubShortName: string;
  clubInitials: string;
  crestOnDarkUrl: string;
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
