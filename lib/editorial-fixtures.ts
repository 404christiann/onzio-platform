import type { Fixture } from "@/lib/data";

/**
 * Pure fixture-resolution helpers for components/editorial/EditorialNextMatch.tsx,
 * split into their own non-JSX module so tests/contracts/editorial-home.test.ts
 * can import and exercise them directly -- this repo's vitest.config.ts has
 * no JSX-transform plugin, so dynamically importing any "use client" .tsx
 * component (even just for its named exports) fails at the vite
 * import-analysis step. Mirrors the date-parsing NextMatchCard.tsx and
 * AcademyNextMatch.tsx already use for the same "find the next fixture"
 * purpose.
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
