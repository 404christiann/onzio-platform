// The club's own time zone (decision 0014). ADMIN-RE-02 added the validator the
// automatic browser set and the operator script share; ADMIN-RE-03 adds the
// club's "today", kickoff instants and the plain-date formatters.
//
// Match dates and times are stored as the club's wall clock: a plain
// "2026-03-14" and "18:00", with no zone. Two different questions follow:
//  - "When is that, really?" (is it past, what's next, the countdown) needs the
//    club's zone, so a visitor in another zone sees the same answer.
//  - "How do I print that date?" needs no zone at all: the plain date is already
//    the club's date, so it is formatted in UTC to stop it shifting a day.

export const DEFAULT_CLUB_TIME_ZONE = "America/Los_Angeles";

// The same shape onzio.clubs.time_zone's check constraint enforces
// (20261108120000_admin_reimagined_foundation.sql), so a zone that passes here
// never fails the database write.
const TIME_ZONE_SHAPE = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2})$/;

/**
 * True for a real IANA time zone the runtime can format with. The shape check
 * alone lets "Mars/Phobos" through; Intl rejects it with a RangeError.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64 || !TIME_ZONE_SHAPE.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The stored zone when it is valid, otherwise the default. */
export function clubTimeZoneOrDefault(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_CLUB_TIME_ZONE;
}

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };

function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function offsetMs(instant: Date, timeZone: string): number {
  const wall = wallParts(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return asUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
}

/** The club's calendar date right now, as "YYYY-MM-DD". */
export function clubToday(timeZone: string, now: Date = new Date()): string {
  const wall = wallParts(now, clubTimeZoneOrDefault(timeZone));
  return [wall.year, String(wall.month).padStart(2, "0"), String(wall.day).padStart(2, "0")].join("-");
}

/**
 * A stored kickoff time as hours and minutes: "18:00", "6:00 PM" and "6:00pm"
 * all work. Empty, "TBD" or anything unreadable is midnight, as before.
 */
export function parseKickoffTime(time: string | null | undefined): { hours: number; minutes: number } {
  const value = (time ?? "").trim();
  const twelve = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelve) {
    let hours = Number(twelve[1]) % 12;
    if (twelve[3].toUpperCase() === "PM") hours += 12;
    return { hours, minutes: Number(twelve[2]) };
  }
  const twentyFour = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour && Number(twentyFour[1]) < 24 && Number(twentyFour[2]) < 60) {
    return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
  }
  return { hours: 0, minutes: 0 };
}

/**
 * The real moment a game kicks off: its stored date and wall-clock time, read in
 * the club's zone (daylight saving included). Invalid Date for an unreadable date.
 */
export function clubKickoffInstant(date: string, time: string | null | undefined, timeZone: string): Date {
  const [year, month, day] = (date ?? "").split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  const { hours, minutes } = parseKickoffTime(time);
  const zone = clubTimeZoneOrDefault(timeZone);
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const first = asUtc - offsetMs(new Date(asUtc), zone);
  const second = asUtc - offsetMs(new Date(first), zone);
  return new Date(second);
}

/** True once kickoff plus the grace period has passed, in the club's zone. */
export function isKickoffPast(
  date: string,
  time: string | null | undefined,
  timeZone: string,
  graceMinutes = 0,
  now: Date = new Date(),
): boolean {
  const kickoff = clubKickoffInstant(date, time, timeZone);
  if (Number.isNaN(kickoff.getTime())) return false;
  return kickoff.getTime() + graceMinutes * 60_000 <= now.getTime();
}

export type ClubDateStyle = "short" | "weekday-day" | "weekday-day-month" | "month-year" | "long";

const PLAIN_DATE_FORMATS: Record<ClubDateStyle, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric" },
  "weekday-day": { weekday: "short", day: "2-digit" },
  "weekday-day-month": { weekday: "short", day: "2-digit", month: "short" },
  "month-year": { month: "long", year: "numeric" },
  long: { month: "long", day: "numeric", year: "numeric" },
};

const plainDateFormatters = new Map<ClubDateStyle, Intl.DateTimeFormat>();

/**
 * A stored plain date for people to read, never shifted a day:
 *  short "Dec 31" · weekday-day "Sat 14" · weekday-day-month "Sat 14 Mar" ·
 *  month-year "March 2026" · long "March 14, 2026". Null for an unreadable date.
 */
export function formatClubDate(date: string, style: ClubDateStyle = "short"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  let formatter = plainDateFormatters.get(style);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { ...PLAIN_DATE_FORMATS[style], timeZone: "UTC" });
    plainDateFormatters.set(style, formatter);
  }
  if (style === "weekday-day" || style === "weekday-day-month") {
    const parts = formatter.formatToParts(parsed);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return [part("weekday"), part("day"), style === "weekday-day-month" ? part("month") : ""].filter(Boolean).join(" ");
  }
  return formatter.format(parsed);
}

/** A stored wall-clock time for people to read: "18:00" -> "6:00 PM". Empty for none or "TBD". */
export function formatClubTime(time: string | null | undefined): string {
  const value = (time ?? "").trim();
  if (!value || value.toUpperCase() === "TBD") return "";
  const { hours, minutes } = parseKickoffTime(value);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
