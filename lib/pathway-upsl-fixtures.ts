/**
 * Pure fixture-resolution helpers for the pathway@1 UPSL fixtures page,
 * split into their own non-JSX module so contract tests can import and
 * exercise them directly -- this repo's vitest.config.ts has no
 * JSX-transform plugin, so importing a .tsx component (even only for its
 * named exports) fails at the vite import-analysis step. This is the same
 * split lib/editorial-fixtures.ts already makes for the editorial@1
 * schedule surfaces, for the same reason.
 *
 * Behaviour mirrors components/AcademyFixtureRow.tsx (formatDate /
 * formatTime / result label) and the schedule route's getNextMatchIndex:
 * the first fixture whose kickoff is still in the future is "next", and
 * every fixture before it is "past". The legacy version shifts kickoff
 * from America/Los_Angeles to UTC before comparing; pathway compares in
 * plain local time instead, because this tenant publishes no real fixtures
 * yet and the extra timezone machinery would only add a failure mode.
 */

export type PathwayUpslFixtureResult = {
  label: "W" | "D" | "L";
  score: string;
};

export type PathwayUpslFixture = {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM" 24h. Omitted (or "TBD") when kickoff is not set yet. */
  time?: string;
  opponent: string;
  opponentLogoUrl?: string;
  /** Omitted or empty renders "Venue TBA". */
  venue?: string;
  home: boolean;
  result?: PathwayUpslFixtureResult;
};

/** True when the fixture carries no usable kickoff time. */
export function isPathwayFixtureTimeTba(time?: string): boolean {
  const trimmed = (time ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.toUpperCase() === "TBD" || trimmed.toUpperCase() === "TBA") {
    return true;
  }
  return !/^\d{1,2}:\d{2}$/.test(trimmed);
}

/**
 * The fixture's kickoff as a local-time Date. A time-not-set fixture is
 * treated as midnight local, so it only becomes "past" once its day has.
 */
export function pathwayFixtureKickoff(fixture: PathwayUpslFixture): Date {
  const [year, month, day] = fixture.date.split("-").map(Number);
  let hours = 0;
  let minutes = 0;

  if (!isPathwayFixtureTimeTba(fixture.time)) {
    const [hourPart, minutePart] = (fixture.time ?? "").trim().split(":");
    hours = Number(hourPart);
    minutes = Number(minutePart);
  }

  return new Date(
    year,
    (month || 1) - 1,
    day || 1,
    hours || 0,
    minutes || 0,
  );
}

/**
 * Index of the first fixture still ahead of `now`, or `fixtures.length`
 * when every fixture has kicked off. Fixtures before it are past.
 */
export function pathwayNextFixtureIndex(
  fixtures: PathwayUpslFixture[],
  now: Date,
): number {
  const index = fixtures.findIndex(
    (fixture) => pathwayFixtureKickoff(fixture).getTime() > now.getTime(),
  );
  return index === -1 ? fixtures.length : index;
}

/** "2026-09-05" -> "September 5, 2026". */
export function formatPathwayFixtureDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );
}

/** "19:00" -> "7:00 PM". Returns "" when kickoff is not set. */
export function formatPathwayFixtureTime(time?: string): string {
  if (isPathwayFixtureTimeTba(time)) return "";
  const [hourPart, minutePart] = (time ?? "").trim().split(":");
  let hours = parseInt(hourPart, 10);
  const minutes = parseInt(minutePart, 10);
  const meridiem = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

/** Two-digit row ordinal, matching the reference row's "01" gutter. */
export function pathwayFixtureOrdinal(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/**
 * Crest fallback monogram: the opponent's first letter, matching the
 * reference row (which renders "P" for "Portland FC"), with "TBA" kept
 * whole. Deliberately not the multi-letter abbreviation the standings
 * table uses -- in a fixtures row the crest sits beside the numbered
 * gutter, and an initials-plus-digit monogram reads as a second ordinal.
 */
export function pathwayOpponentMonogram(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toUpperCase() === "TBA") return "TBA";
  return trimmed.charAt(0).toUpperCase() || "?";
}
