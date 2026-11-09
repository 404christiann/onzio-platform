import { describe, expect, it } from "vitest";
import {
  clubKickoffInstant,
  clubTimeZoneOrDefault,
  clubToday,
  DEFAULT_CLUB_TIME_ZONE,
  formatClubDate,
  formatClubTime,
  isKickoffPast,
  isValidTimeZone,
  nextClubSaturday,
  parseKickoffTime,
} from "../club-time";

describe("isValidTimeZone", () => {
  it.each([
    "America/Chicago",
    "America/Los_Angeles",
    "America/Argentina/Buenos_Aires",
    "America/Port-au-Prince",
    "Etc/GMT+5",
    "UTC",
    "Europe/London",
  ])("accepts %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it.each([
    ["a made-up zone with the right shape", "Mars/Phobos"],
    ["free text", "Chicago time"],
    ["an empty string", ""],
    ["a too-long value", `America/${"A".repeat(70)}`],
    ["a non-string", 42],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isValidTimeZone(value)).toBe(false);
  });
});

describe("clubTimeZoneOrDefault", () => {
  it("keeps a valid zone and falls back to Los Angeles otherwise", () => {
    expect(clubTimeZoneOrDefault("America/Chicago")).toBe("America/Chicago");
    expect(clubTimeZoneOrDefault("Mars/Phobos")).toBe(DEFAULT_CLUB_TIME_ZONE);
    expect(clubTimeZoneOrDefault(undefined)).toBe("America/Los_Angeles");
  });
});

describe("clubToday", () => {
  // 2026-03-15 04:30 UTC is 11:30 PM on the 14th in Chicago and 9:30 PM in Los Angeles.
  const lateSaturday = new Date("2026-03-15T04:30:00Z");
  // 2026-03-15 06:30 UTC is already the 15th in Chicago (1:30 AM) but still the 14th in Los Angeles.
  const afterChicagoMidnight = new Date("2026-03-15T06:30:00Z");

  it("uses the club's own midnight, not the server's or UTC's", () => {
    expect(clubToday("America/Chicago", lateSaturday)).toBe("2026-03-14");
    expect(clubToday("America/Los_Angeles", lateSaturday)).toBe("2026-03-14");
    expect(clubToday("America/Chicago", afterChicagoMidnight)).toBe("2026-03-15");
    expect(clubToday("America/Los_Angeles", afterChicagoMidnight)).toBe("2026-03-14");
    expect(clubToday("UTC", lateSaturday)).toBe("2026-03-15");
  });

  it("falls back to Los Angeles for a bad zone", () => {
    expect(clubToday("Mars/Phobos", afterChicagoMidnight)).toBe("2026-03-14");
  });
});

describe("clubKickoffInstant", () => {
  it("reads the stored wall clock in the club's zone", () => {
    expect(clubKickoffInstant("2026-01-10", "18:00", "America/Chicago").toISOString()).toBe("2026-01-11T00:00:00.000Z");
    expect(clubKickoffInstant("2026-01-10", "18:00", "America/Los_Angeles").toISOString()).toBe("2026-01-11T02:00:00.000Z");
    expect(clubKickoffInstant("2026-01-10", "6:00 PM", "America/Chicago").toISOString()).toBe("2026-01-11T00:00:00.000Z");
  });

  it("follows daylight saving on both change days", () => {
    // Spring forward 2026-03-08: Chicago goes from UTC-6 to UTC-5 at 2 AM.
    expect(clubKickoffInstant("2026-03-07", "10:00", "America/Chicago").toISOString()).toBe("2026-03-07T16:00:00.000Z");
    expect(clubKickoffInstant("2026-03-08", "10:00", "America/Chicago").toISOString()).toBe("2026-03-08T15:00:00.000Z");
    // Fall back 2026-11-01: Chicago goes from UTC-5 to UTC-6 at 2 AM.
    expect(clubKickoffInstant("2026-10-31", "10:00", "America/Chicago").toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(clubKickoffInstant("2026-11-01", "10:00", "America/Chicago").toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });

  it("treats a missing or TBD time as midnight and an unreadable date as invalid", () => {
    expect(clubKickoffInstant("2026-01-10", null, "America/Chicago").toISOString()).toBe("2026-01-10T06:00:00.000Z");
    expect(clubKickoffInstant("2026-01-10", "TBD", "America/Chicago").toISOString()).toBe("2026-01-10T06:00:00.000Z");
    expect(Number.isNaN(clubKickoffInstant("", "18:00", "America/Chicago").getTime())).toBe(true);
  });
});

describe("isKickoffPast", () => {
  const now = new Date("2026-01-11T00:30:00Z"); // 6:30 PM in Chicago, 4:30 PM in Los Angeles

  it("answers in the club's zone", () => {
    expect(isKickoffPast("2026-01-10", "18:00", "America/Chicago", 0, now)).toBe(true);
    expect(isKickoffPast("2026-01-10", "18:00", "America/Los_Angeles", 0, now)).toBe(false);
  });

  it("waits for the grace period", () => {
    expect(isKickoffPast("2026-01-10", "18:00", "America/Chicago", 45, now)).toBe(false);
    expect(isKickoffPast("2026-01-10", "18:00", "America/Chicago", 30, now)).toBe(true);
  });

  it("is never past for an unreadable date", () => {
    expect(isKickoffPast("not-a-date", "18:00", "America/Chicago", 0, now)).toBe(false);
  });
});

describe("parseKickoffTime", () => {
  it.each([
    ["18:00", 18, 0],
    ["09:05", 9, 5],
    ["18:00:00", 18, 0],
    ["6:00 PM", 18, 0],
    ["12:15 am", 0, 15],
    ["12:30 PM", 12, 30],
    ["TBD", 0, 0],
    ["25:00", 0, 0],
    ["", 0, 0],
  ])("%s -> %i:%i", (input, hours, minutes) => {
    expect(parseKickoffTime(input)).toEqual({ hours, minutes });
  });
});

describe("formatClubDate and formatClubTime", () => {
  it("prints the stored date without shifting a day", () => {
    expect(formatClubDate("2026-12-31")).toBe("Dec 31");
    expect(formatClubDate("2026-03-14", "weekday-day")).toBe("Sat 14");
    expect(formatClubDate("2026-03-14", "weekday-day-month")).toBe("Sat 14 Mar");
    expect(formatClubDate("2026-03-14", "month-year")).toBe("March 2026");
    expect(formatClubDate("2026-03-14", "long")).toBe("March 14, 2026");
    expect(formatClubDate("")).toBeNull();
    expect(formatClubDate("2026-3-4")).toBeNull();
  });

  it("prints the stored time as 12-hour", () => {
    expect(formatClubTime("18:00")).toBe("6:00 PM");
    expect(formatClubTime("00:05")).toBe("12:05 AM");
    expect(formatClubTime("12:00")).toBe("12:00 PM");
    expect(formatClubTime("TBD")).toBe("");
    expect(formatClubTime(null)).toBe("");
  });
});

// ADMIN-RE-07: a new game defaults to the next Saturday at 10:00, club time.
describe("nextClubSaturday", () => {
  it("is the coming Saturday midweek", () => {
    expect(nextClubSaturday("America/Los_Angeles", new Date("2026-11-11T20:00:00Z"))).toBe("2026-11-14");
  });

  it("is a week away when today is Saturday", () => {
    expect(nextClubSaturday("America/Los_Angeles", new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-21");
  });

  it("is six days away on a Sunday", () => {
    expect(nextClubSaturday("America/Chicago", new Date("2026-11-08T18:00:00Z"))).toBe("2026-11-14");
  });

  it("reads today in the club's zone, not the server's", () => {
    // 06:00 UTC on Saturday is still Friday night in Los Angeles but already Saturday in Chicago.
    const now = new Date("2026-11-14T06:00:00Z");
    expect(nextClubSaturday("America/Los_Angeles", now)).toBe("2026-11-14");
    expect(nextClubSaturday("America/Chicago", now)).toBe("2026-11-21");
  });

  it("crosses the month and the year", () => {
    expect(nextClubSaturday("America/Chicago", new Date("2026-12-28T18:00:00Z"))).toBe("2027-01-02");
  });

  it("prints in the picker's short form", () => {
    expect(formatClubDate("2026-11-14", "weekday-short")).toBe("Sat, Nov 14");
  });

  it("falls back to the default zone for an invalid one", () => {
    const now = new Date("2026-11-14T06:00:00Z");
    expect(nextClubSaturday("Mars/Phobos", now)).toBe(nextClubSaturday(DEFAULT_CLUB_TIME_ZONE, now));
  });
});
