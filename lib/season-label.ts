export type SeasonYears = { start_year: number; end_year: number; label?: string };

/** seasons.label is free text of 1 to 40 characters, unique per club. */
export const SEASON_NAME_MAX = 40;

// seasons.start_year is between 2000 and 2200 (20260726000200_phase2_content.sql).
const MIN_YEAR = 2000;
const MAX_YEAR = 2200;

const HALF_YEAR_NAME = /^(spring|fall)\s+(\d{4})$/i;

function yearsLabel(start_year: number, end_year: number): string {
  return start_year === end_year ? String(start_year) : `${start_year}–${String(end_year).slice(-2)}`;
}

/**
 * The season "Start next season" suggests after `latest`.
 *
 * A club that names its seasons "Spring 2026" and "Fall 2026" alternates:
 * Spring is followed by Fall of the same year, and Fall by Spring of the next.
 * Any other name falls back to the years: both move on by one, so a single-year
 * season (start = end, e.g. Diverse City's "2026") becomes "2027" and a split
 * season (2025 to 2026) becomes "2026–27". Before ADMIN-PLATFORM-FIXES-02 the
 * single-year case produced "2027–27".
 */
export function nextSeasonAfter(latest: SeasonYears): SeasonYears & { label: string } {
  const half = HALF_YEAR_NAME.exec((latest.label ?? "").trim());
  if (half && latest.start_year === latest.end_year) {
    if (half[1].toLowerCase() === "spring") {
      return { label: `Fall ${half[2]}`, start_year: latest.start_year, end_year: latest.end_year };
    }
    const next = Number(half[2]) + 1;
    return { label: `Spring ${next}`, start_year: latest.start_year + 1, end_year: latest.end_year + 1 };
  }
  const start_year = latest.start_year + 1;
  const end_year = latest.end_year + 1;
  return { label: yearsLabel(start_year, end_year), start_year, end_year };
}

/**
 * The suggestion for a club with no season yet: the club's current year.
 * `today` is the club's own date, "YYYY-MM-DD" (lib/club-time.ts clubToday).
 */
export function firstSeasonAfterNothing(today: string): SeasonYears & { label: string } {
  const parsed = Number(today.slice(0, 4));
  const year = Number.isInteger(parsed) ? Math.min(MAX_YEAR, Math.max(MIN_YEAR, parsed)) : MIN_YEAR;
  return { label: String(year), start_year: year, end_year: year };
}

type SeasonOrderFields = { label: string; start_year: number; end_year: number; created_at: string };

// Fall comes after Spring of the same year; every other name ties.
function halfYearRank(label: string): number {
  const half = HALF_YEAR_NAME.exec(label.trim());
  if (!half) return 0;
  return half[1].toLowerCase() === "fall" ? 1 : 0;
}

/** Sort comparator: the latest season first. */
export function newestSeasonFirst(a: SeasonOrderFields, b: SeasonOrderFields): number {
  return (
    b.start_year - a.start_year ||
    b.end_year - a.end_year ||
    halfYearRank(b.label) - halfYearRank(a.label) ||
    (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
  );
}

export type SeasonNameProblem = "empty" | "too-long" | "taken";

const characters = (text: string) => [...text].length;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What is wrong with a season name, or null. The name is judged as it will be
 * saved (trimmed), counted in characters as the database does, and compared
 * with the club's other seasons ignoring capitals and spaces at the ends.
 */
export function seasonNameProblem(name: string, takenNames: readonly string[]): SeasonNameProblem | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "empty";
  if (characters(trimmed) > SEASON_NAME_MAX) return "too-long";
  if (takenNames.some((taken) => sameName(taken, trimmed))) return "taken";
  return null;
}

const SHOWN_NAME_MAX = 30;

export function seasonNameProblemText(problem: SeasonNameProblem, name: string): string {
  if (problem === "empty") return "Give the season a name.";
  if (problem === "too-long") return `Use ${SEASON_NAME_MAX} characters or fewer.`;
  const trimmed = name.trim();
  const shown = characters(trimmed) > SHOWN_NAME_MAX ? `${[...trimmed].slice(0, SHOWN_NAME_MAX).join("")}…` : trimmed;
  return `A season called “${shown}” already exists. Pick another name.`;
}

const YEAR_ONLY = /^(\d{4})$/;
const YEAR_SPLIT = /^(\d{4})[–-](\d{2}|\d{4})$/;

/**
 * The years saved with a season whose name the admin may have typed over the
 * suggestion: a Spring or Fall name takes its year, "2028" takes 2028, and
 * "2025–26" takes 2025 to 2026, so the next suggestion and the order follow
 * the name. A name that says nothing about years, or whose years the database
 * would refuse (2000 to 2200, end at most two after the start), keeps the
 * suggestion's years.
 */
export function yearsForSeasonName(
  name: string,
  fallback: { startYear: number; endYear: number },
): { startYear: number; endYear: number } {
  const trimmed = name.trim();
  const half = HALF_YEAR_NAME.exec(trimmed);
  const only = YEAR_ONLY.exec(trimmed);
  const split = YEAR_SPLIT.exec(trimmed);
  let startYear: number;
  let endYear: number;
  if (half || only) {
    startYear = endYear = Number((half ?? only)![half ? 2 : 1]);
  } else if (split) {
    startYear = Number(split[1]);
    endYear = split[2].length === 2 ? Math.floor(startYear / 100) * 100 + Number(split[2]) : Number(split[2]);
    // "2099–01" is 2099 to 2101: a two-digit end year past the century rolls over.
    if (split[2].length === 2 && endYear < startYear) endYear += 100;
  } else {
    return fallback;
  }
  const accepted = startYear >= MIN_YEAR && startYear <= MAX_YEAR && endYear >= startYear && endYear <= startYear + 2;
  return accepted ? { startYear, endYear } : fallback;
}
