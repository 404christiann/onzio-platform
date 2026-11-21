import { describe, expect, it } from "vitest";
import {
  averageTimeMs,
  clickRate,
  DEFAULT_INSIGHTS_RANGE,
  formatDuration,
  formatRate,
  insightsWindow,
  parseInsightsRange,
  REMOVED_SPONSOR_NAME,
  sponsorDisplayName,
} from "@/lib/telemetry/insights-math";

describe("parseInsightsRange", () => {
  it("accepts the supported ranges and falls back to the default", () => {
    expect(parseInsightsRange("7")).toBe(7);
    expect(parseInsightsRange("30")).toBe(30);
    expect(parseInsightsRange(["90", "7"])).toBe(90);
    for (const bad of [undefined, "", "14", "abc", "-7", "7.5"]) expect(parseInsightsRange(bad)).toBe(DEFAULT_INSIGHTS_RANGE);
  });
});

describe("insightsWindow", () => {
  it("ends yesterday in the club time zone", () => {
    // 07:30Z on Nov 21 is still Nov 20 in Los Angeles, so yesterday is Nov 19.
    const window = insightsWindow(7, "America/Los_Angeles", new Date("2026-11-21T07:30:00Z"));
    expect(window.end).toBe("2026-11-19");
    expect(window.start).toBe("2026-11-13");
    expect(window.dates).toHaveLength(7);
    expect(window.dates[0]).toBe("2026-11-13");
    expect(window.dates.at(-1)).toBe("2026-11-19");
    expect(insightsWindow(7, "UTC", new Date("2026-11-21T07:30:00Z")).end).toBe("2026-11-20");
  });

  it("uses the club's date, not the server's, ahead of UTC", () => {
    // 20:00Z on Nov 20 is already Nov 21 in Auckland.
    expect(insightsWindow(7, "Pacific/Auckland", new Date("2026-11-20T20:00:00Z")).end).toBe("2026-11-20");
    expect(insightsWindow(7, "UTC", new Date("2026-11-20T20:00:00Z")).end).toBe("2026-11-19");
  });

  it("stays one date per day across a DST change", () => {
    // US clocks went back on 2026-11-01; every date is present exactly once.
    const window = insightsWindow(30, "America/Los_Angeles", new Date("2026-11-10T12:00:00Z"));
    expect(window.dates).toHaveLength(30);
    expect(new Set(window.dates).size).toBe(30);
    expect(window.dates).toContain("2026-11-01");
    expect(window.dates).toContain("2026-10-31");
    expect(window.dates).toContain("2026-11-02");
    expect(window.start).toBe("2026-10-11");
    expect(window.end).toBe("2026-11-09");
  });

  it("crosses month and year boundaries", () => {
    const window = insightsWindow(7, "UTC", new Date("2027-01-03T12:00:00Z"));
    expect(window.dates).toEqual(["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  });
});

describe("averageTimeMs", () => {
  it("divides time by the measured count", () => {
    expect(averageTimeMs(90_000, 3)).toBe(30_000);
  });
  it("is null when nothing was measured, never a fake zero", () => {
    expect(averageTimeMs(0, 5)).toBeNull();
    expect(averageTimeMs(5_000, 0)).toBeNull();
    expect(averageTimeMs(-5_000, 2)).toBeNull();
    expect(averageTimeMs(5_000, -2)).toBeNull();
    expect(averageTimeMs(Number.NaN, 2)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(59_400)).toBe("0:59");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-1_000)).toBe("0:00");
  });
});

describe("clickRate and formatRate", () => {
  it("is null with no logo views", () => {
    expect(clickRate(0, 0)).toBeNull();
    expect(clickRate(5, 0)).toBeNull();
  });
  it("is clicks per logo view", () => {
    expect(clickRate(1, 4)).toBe(0.25);
    expect(clickRate(0, 10)).toBe(0);
  });
  it("formats for people", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(0.042)).toBe("4.2%");
    expect(formatRate(0.25)).toBe("25%");
  });
});

describe("sponsorDisplayName", () => {
  const names = new Map([["a", "  Acme Co "], ["b", "   "]]);
  it("uses the saved name, trimmed", () => {
    expect(sponsorDisplayName(names, "a")).toEqual({ name: "Acme Co", removed: false });
  });
  it("falls back to Removed sponsor when gone or blank", () => {
    expect(sponsorDisplayName(names, "zzz")).toEqual({ name: REMOVED_SPONSOR_NAME, removed: true });
    expect(sponsorDisplayName(names, "b")).toEqual({ name: REMOVED_SPONSOR_NAME, removed: true });
  });
});
