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
 * E4 added the W/L/D outcome helpers below for schedule and match-area
 * surfaces, which need the exact same non-JSX testability.
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

/** A fixture with a recorded result on both sides. */
export function isPlayedFixture(fixture: Fixture): boolean {
  return fixture.roseCityScore != null && fixture.opponentScore != null;
}

/** The id of the earliest upcoming (unplayed) fixture, or null. */
export function firstUpcomingFixtureId(fixtures: Fixture[]): string | null {
  const sorted = [...fixtures].sort(byDate);
  return sorted.find((fixture) => !isPlayedFixture(fixture))?.id ?? null;
}

export type MatchOutcome = "W" | "L" | "D";

/** The club's own result vs the opponent, independent of home/away side. */
export function outcomeForFixture(fixture: Fixture): MatchOutcome | null {
  if (fixture.roseCityScore == null || fixture.opponentScore == null) return null;
  if (fixture.roseCityScore > fixture.opponentScore) return "W";
  if (fixture.roseCityScore < fixture.opponentScore) return "L";
  return "D";
}
