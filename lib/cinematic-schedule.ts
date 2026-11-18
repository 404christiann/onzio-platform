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

/** Compare stored venue wall-clock times in the club zone, including DST. */
export function nextScheduleFixture(fixtures: readonly Fixture[], now: Date, timeZone: string): Fixture | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: scheduleTimeZone(timeZone), hourCycle: "h23", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  const wallClock = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
  return orderedSchedule(fixtures).find(fixture => {
    if (fixture.roseCityScore != null && fixture.opponentScore != null) return false;
    const date = new Date(`${fixture.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fixture.date) return false;
    const time = fixture.time || "";
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return false;
    return `${fixture.date}T${time.length === 5 ? time + ":00" : time}` > wallClock;
  }) ?? null;
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
