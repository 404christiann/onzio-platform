import type { Fixture } from "@/lib/data";

export const SCHEDULE_PAGE_SIZE = 4;

/** Keep the season order stable while pagination appends, never mutating query data. */
export function orderedSchedule(fixtures: readonly Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) =>
    `${a.date}T${a.time || "00:00"}`.localeCompare(`${b.date}T${b.time || "00:00"}`),
  );
}

export function scheduleTimeZone(timeZone: string): string {
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return timeZone; }
  catch { return "UTC"; }
}

/** "Now" as wall-clock text in the club zone, including DST, comparable with stored venue times. */
function clubWallClock(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: scheduleTimeZone(timeZone), hourCycle: "h23", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

const isPlayed = (fixture: Fixture) => fixture.roseCityScore != null && fixture.opponentScore != null;
const isRealDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const KICKOFF = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/** The stored kickoff as wall-clock text, or null when its date or time is not set. */
function kickoff(fixture: Fixture): string | null {
  const time = fixture.time || "";
  if (!isRealDate(fixture.date) || !KICKOFF.test(time)) return null;
  return `${fixture.date}T${time.length === 5 ? time + ":00" : time}`;
}

export function nextScheduleFixture(fixtures: readonly Fixture[], now: Date, timeZone: string): Fixture | null {
  const wallClock = clubWallClock(now, timeZone);
  return orderedSchedule(fixtures).find(fixture => {
    const start = kickoff(fixture);
    return !isPlayed(fixture) && start !== null && start > wallClock;
  }) ?? null;
}

export type ScheduleListItem = { fixture: Fixture; matchNumber: number };

/**
 * Sam's order: the next match first, then the matches already played or kicked off, newest first. Fixtures
 * after the next one stay hidden; each moves up to Next by itself once the one before it kicks off.
 * matchNumber keeps each fixture's place in the season so the list counts down from the next match.
 */
export function scheduleDisplay(fixtures: readonly Fixture[], now: Date, timeZone: string): { next: Fixture | null; list: ScheduleListItem[] } {
  const season = orderedSchedule(fixtures).map((fixture, index) => ({ fixture, matchNumber: index + 1 }));
  const next = nextScheduleFixture(fixtures, now, timeZone);
  const wallClock = clubWallClock(now, timeZone);
  const today = wallClock.slice(0, 10);
  const past = season.filter(({ fixture }) => {
    if (fixture === next) return false;
    if (isPlayed(fixture)) return true;
    const start = kickoff(fixture);
    return start !== null ? start <= wallClock : isRealDate(fixture.date) && fixture.date < today;
  }).reverse();
  // A first upcoming fixture still waiting on its kickoff time leads the list without the Next badge.
  const lead = season.find(item => item.fixture === next) ?? season.find(item => !isPlayed(item.fixture) && !past.includes(item));
  return { next, list: lead ? [lead, ...past] : past };
}

export function scheduleDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(parsed)
    : "Date to be announced";
}

export function scheduleKickoff(time: string, timeZone: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return "TBD";
  const [hours, minutes] = time.split(":").map(Number);
  const zone = scheduleTimeZone(timeZone);
  // A general zone label avoids implying EST/PST during daylight saving time.
  const label = zone === "America/Los_Angeles" ? "PT" : zone === "America/New_York" ? "ET" : zone === "UTC" ? "UTC" : zone.split("/").at(-1)?.replaceAll("_", " ");
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}${hours >= 12 ? "PM" : "AM"} ${label}`;
}
