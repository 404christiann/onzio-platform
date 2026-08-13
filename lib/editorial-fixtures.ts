import type { Fixture } from "@/lib/data";

/**
 * Pure fixture-resolution helpers, split into their own non-JSX module so
 * contract tests can import and exercise them directly -- this repo's
 * vitest.config.ts has no JSX-transform plugin, so dynamically importing
 * any "use client" .tsx component (even just for its named exports) fails
 * at the vite import-analysis step. Mirrors the date-parsing
 * NextMatchCard.tsx and AcademyNextMatch.tsx already use for the same
 * "find the next fixture" purpose.
 *
 * Originally home-page-only (E3, components/editorial/EditorialNextMatch.tsx);
 * E4 added the month/status-filter and W/L/D outcome helpers below for
 * components/editorial/EditorialScheduleView.tsx and
 * EditorialScheduleMatchCard.tsx, which need the exact same non-JSX
 * testability.
 */

/** Converts the stored local match date and 24-hour time into a Date. */
export function fixtureKickoff(fixture: Fixture): Date {
  const [year, month, day] = fixture.date.split("-").map(Number);
  const [hours, minutes] = (fixture.time || "00:00").split(":").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
}

export function findNextFixture(fixtures: Fixture[]): Fixture | null {
  const now = Date.now();
  const upcoming = fixtures.filter((fixture) => {
    if (!fixture.date) return false;
    const kickoff = fixtureKickoff(fixture);
    return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() > now;
  });
  upcoming.sort((a, b) => fixtureKickoff(a).getTime() - fixtureKickoff(b).getTime());
  return upcoming[0] ?? null;
}

export function findLatestResult(fixtures: Fixture[]): Fixture | null {
  const now = Date.now();
  const played = fixtures.filter((fixture) => {
    if (!fixture.date || fixture.roseCityScore == null || fixture.opponentScore == null) {
      return false;
    }
    const kickoff = fixtureKickoff(fixture);
    return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() <= now;
  });
  played.sort((a, b) => fixtureKickoff(b).getTime() - fixtureKickoff(a).getTime());
  return played[0] ?? null;
}

/** Text-only fallback badge for a crest-less club/opponent, e.g. "LFC" for "Lions Football Club". */
export function monogram(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return initials.slice(0, 3) || "?";
}

// ── Schedule/match-area helpers (E4) ─────────────────────────────────

const byDate = (a: Fixture, b: Fixture) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** A fixture with a recorded result on both sides -- mirrors findLatestResult's own criterion. */
export function isPlayedFixture(fixture: Fixture): boolean {
  return fixture.roseCityScore != null && fixture.opponentScore != null;
}

/** "2026-08-15" -> "2026-08". */
export function monthKey(date: string): string {
  return date.slice(0, 7);
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
 * when the list is empty.
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

export type ScheduleStatusFilter = "all" | "upcoming" | "played";

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

export type MatchOutcome = "W" | "L" | "D";

/** The club's own result vs the opponent, independent of home/away side. */
export function outcomeForFixture(fixture: Fixture): MatchOutcome | null {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  if (fixture.roseCityScore > fixture.opponentScore) return "W";
  if (fixture.roseCityScore < fixture.opponentScore) return "L";
  return "D";
}
