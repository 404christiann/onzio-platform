import { describe, expect, it } from "vitest";
import { clubTimeZoneOrDefault, DEFAULT_CLUB_TIME_ZONE, isValidTimeZone } from "../club-time";

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
