import type { Fixture } from "@/lib/data";

/** Matches are stored as venue wall-clock dates/times, independent of visitor location. */
export function nextHomeFixture(fixtures: Fixture[], now = new Date(), timeZone = "UTC"): Fixture | null {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const value = (name: string) => parts.find(part => part.type === name)?.value ?? "";
  const current = `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
  const kickoff = (fixture: Fixture): string | null => {
    const date = new Date(`${fixture.date}T00:00:00Z`);
    const time = fixture.time || "00:00";
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fixture.date || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
    return `${fixture.date}T${time.length === 5 ? `${time}:00` : time}`;
  };
  return fixtures.map(fixture => ({ fixture, kickoff: kickoff(fixture) }))
    .filter((item): item is { fixture: Fixture; kickoff: string } => item.fixture.home && item.kickoff !== null && item.kickoff > current)
    .sort((left, right) => left.kickoff.localeCompare(right.kickoff))[0]?.fixture ?? null;
}

export function cinematicMatchDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).replace(",", "");
}

export function cinematicMatchTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")}${hours >= 12 ? "pm" : "am"}`;
}
