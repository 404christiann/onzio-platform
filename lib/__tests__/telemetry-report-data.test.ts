import { describe, expect, it } from "vitest";
import {
  availableMonths,
  buildMonthlyReport,
  chooseReportMonth,
  currentClubMonth,
  monthRange,
  parseReportMonth,
  parseReportSponsor,
  reportHref,
  type MatchRow,
  type SponsorListing,
  type SponsorRow,
  type TotalsRow,
} from "@/lib/telemetry/report-data";

const ZONE = "America/Los_Angeles";
// Mid-month, so the month is "so far" in November 2026 unless a test says otherwise.
const NOW = new Date("2026-11-18T20:00:00Z");

const NIKE = "11111111-aaaa-4aaa-8aaa-000000000001";
const ACME = "11111111-aaaa-4aaa-8aaa-000000000002";
const ZED = "11111111-aaaa-4aaa-8aaa-000000000003";
const GONE = "11111111-aaaa-4aaa-8aaa-0000000000ff";

const SPONSORS: SponsorListing[] = [
  { id: NIKE, name: "Nike Portland", logo_url: "https://example.test/nike.png" },
  { id: ACME, name: "Acme Plumbing", logo_url: null },
  { id: ZED, name: "Zed Dental", logo_url: "https://example.test/zed.png" },
];

function totals(local_date: string, overrides: Partial<TotalsRow> = {}): TotalsRow {
  return { local_date, views: 0, visitors: 0, visits: 0, engaged_ms: 0, engaged_views: 0, dropped: 0, ...overrides };
}

function logos(local_date: string, sponsor_id: string, overrides: Partial<SponsorRow> = {}): SponsorRow {
  return { local_date, sponsor_id, logo_views: 0, logo_viewers: 0, clicks: 0, ...overrides };
}

function report(overrides: Partial<Parameters<typeof buildMonthlyReport>[0]> = {}) {
  return buildMonthlyReport({
    month: "2026-11",
    sponsor: "all",
    timeZone: ZONE,
    now: NOW,
    totals: [],
    sponsorRows: [],
    sponsors: SPONSORS,
    matches: [],
    ...overrides,
  });
}

describe("parseReportMonth", () => {
  it.each(["2026-11", "2026-01", "2026-12", "1999-06"])("accepts %s", (value) => {
    expect(parseReportMonth(value)).toBe(value);
  });

  it.each(["2026-00", "2026-13", "2026-1", "26-11", "2026-11-01", "2026/11", " 2026-11", "november", "", "2026-1a"])(
    "rejects %j",
    (value) => {
      expect(parseReportMonth(value)).toBeNull();
    },
  );

  it("rejects values that are not text and takes the first of a repeated parameter", () => {
    expect(parseReportMonth(undefined)).toBeNull();
    expect(parseReportMonth(null)).toBeNull();
    expect(parseReportMonth(202611)).toBeNull();
    expect(parseReportMonth({})).toBeNull();
    expect(parseReportMonth([])).toBeNull();
    expect(parseReportMonth(["2026-11", "2026-10"])).toBe("2026-11");
    expect(parseReportMonth(["nope", "2026-10"])).toBeNull();
  });
});

describe("parseReportSponsor", () => {
  it("lowercases a uuid and sends everything else to all", () => {
    expect(parseReportSponsor(NIKE.toUpperCase())).toBe(NIKE);
    expect(parseReportSponsor(NIKE)).toBe(NIKE);
    expect(parseReportSponsor("all")).toBe("all");
    expect(parseReportSponsor(undefined)).toBe("all");
    expect(parseReportSponsor("")).toBe("all");
    expect(parseReportSponsor("not-a-uuid")).toBe("all");
    expect(parseReportSponsor(`${NIKE}x`)).toBe("all");
    expect(parseReportSponsor(`'; drop table sponsors; --`)).toBe("all");
    expect(parseReportSponsor(42)).toBe("all");
  });

  it("takes the first item of a repeated parameter", () => {
    expect(parseReportSponsor([ACME.toUpperCase(), NIKE])).toBe(ACME);
    expect(parseReportSponsor(["nope", NIKE])).toBe("all");
  });
});

describe("monthRange", () => {
  it("returns the first day, last day and the first day of the next month", () => {
    expect(monthRange("2026-11")).toEqual({ start: "2026-11-01", last: "2026-11-30", next: "2026-12-01" });
    expect(monthRange("2026-01")).toEqual({ start: "2026-01-01", last: "2026-01-31", next: "2026-02-01" });
    expect(monthRange("2026-04")).toEqual({ start: "2026-04-01", last: "2026-04-30", next: "2026-05-01" });
  });

  it("handles February in a leap year, a century year and an ordinary year", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", last: "2028-02-29", next: "2028-03-01" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", last: "2026-02-28", next: "2026-03-01" });
    expect(monthRange("2100-02").last).toBe("2100-02-28");
    expect(monthRange("2000-02").last).toBe("2000-02-29");
  });

  it("rolls December into January of the next year", () => {
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", last: "2026-12-31", next: "2027-01-01" });
  });

  it("refuses something that is not a report month", () => {
    expect(() => monthRange("2026-13")).toThrow(RangeError);
    expect(() => monthRange("soon")).toThrow(RangeError);
  });
});

describe("currentClubMonth", () => {
  it("reads the month in the club's zone, not UTC", () => {
    // 03:00 UTC on 1 December is still the evening of 30 November in Portland.
    const instant = new Date("2026-12-01T03:00:00Z");
    expect(currentClubMonth("America/Los_Angeles", instant)).toBe("2026-11");
    expect(currentClubMonth("UTC", instant)).toBe("2026-12");
    expect(currentClubMonth("Pacific/Auckland", instant)).toBe("2026-12");
  });

  it("rolls into the new month once the club's own midnight has passed", () => {
    expect(currentClubMonth("America/Los_Angeles", new Date("2026-12-01T08:30:00Z"))).toBe("2026-12");
    // And back across new year.
    expect(currentClubMonth("America/Los_Angeles", new Date("2027-01-01T05:00:00Z"))).toBe("2026-12");
  });
});

describe("availableMonths, chooseReportMonth and reportHref", () => {
  it("lists distinct months, newest first, ignoring anything unreadable", () => {
    expect(availableMonths(["2026-10-03", "2026-11-30", "2026-10-31", "2025-12-01", "2026-11-01", "garbage", ""])).toEqual([
      "2026-11",
      "2026-10",
      "2025-12",
    ]);
    expect(availableMonths([])).toEqual([]);
  });

  it("chooses the requested month when it has data", () => {
    expect(chooseReportMonth("2026-10", ["2026-11", "2026-10"], "2026-11")).toBe("2026-10");
  });

  it("falls back to the current month, then the newest, then none", () => {
    expect(chooseReportMonth("2024-01", ["2026-11", "2026-10"], "2026-10")).toBe("2026-10");
    expect(chooseReportMonth(null, ["2026-11", "2026-10"], "2026-10")).toBe("2026-10");
    expect(chooseReportMonth(null, ["2026-09", "2026-08"], "2026-11")).toBe("2026-09");
    expect(chooseReportMonth("2026-11", [], "2026-11")).toBeNull();
  });

  it("builds the report address with the sponsor defaulting to all and encoded", () => {
    expect(reportHref("2026-11")).toBe("/admin/insights/report?month=2026-11&sponsor=all");
    expect(reportHref("2026-11", NIKE)).toBe(`/admin/insights/report?month=2026-11&sponsor=${NIKE}`);
    expect(reportHref("2026-11", "a&b=c d")).toBe("/admin/insights/report?month=2026-11&sponsor=a%26b%3Dc%20d");
  });
});

describe("buildMonthlyReport: the month and the club's zone", () => {
  it("labels the month", () => {
    expect(report().monthLabel).toBe("November 2026");
    expect(report({ month: "2028-02" }).monthLabel).toBe("February 2028");
  });

  it("marks the current club month as so far, through the club's today", () => {
    const current = report();
    expect(current.soFar).toBe(true);
    expect(current.throughDate).toBe("2026-11-18");
  });

  it("does not mark a past month as so far", () => {
    const past = report({ month: "2026-10" });
    expect(past.soFar).toBe(false);
    expect(past.throughDate).toBeNull();
    expect(report({ month: "2026-12" }).soFar).toBe(false);
  });

  it("decides the current month in the club's zone", () => {
    const instant = new Date("2026-12-01T03:00:00Z");
    const november = report({ month: "2026-11", now: instant });
    expect(november.soFar).toBe(true);
    expect(november.throughDate).toBe("2026-11-30");
    expect(report({ month: "2026-12", now: instant }).soFar).toBe(false);
    // The same instant in UTC is already December.
    const utcDecember = report({ month: "2026-12", now: instant, timeZone: "UTC" });
    expect(utcDecember.soFar).toBe(true);
    expect(utcDecember.throughDate).toBe("2026-12-01");
  });

  it("ignores rows outside the month, on both edges", () => {
    const result = report({
      sponsor: NIKE,
      totals: [
        totals("2026-10-31", { views: 1000, visitors: 900, visits: 800, engaged_ms: 9_000_000, dropped: 7 }),
        totals("2026-11-01", { views: 10, visitors: 8, visits: 6, engaged_ms: 100_000, dropped: 1 }),
        totals("2026-11-30", { views: 20, visitors: 15, visits: 12, engaged_ms: 200_000, dropped: 2 }),
        totals("2026-12-01", { views: 5000, visitors: 4000, visits: 3000, engaged_ms: 1_000_000, dropped: 9 }),
      ],
      sponsorRows: [
        logos("2026-10-31", NIKE, { logo_views: 500, logo_viewers: 400, clicks: 50 }),
        logos("2026-11-01", NIKE, { logo_views: 4, logo_viewers: 3, clicks: 1 }),
        logos("2026-12-01", NIKE, { logo_views: 600, logo_viewers: 500, clicks: 60 }),
      ],
      matches: [
        { date: "2026-10-31", opponent: "October FC", home: true },
        { date: "2026-11-01", opponent: "Nov FC", home: true },
        { date: "2026-12-01", opponent: "December FC", home: true },
      ],
    });
    expect(result.site).toEqual({ views: 30, visitorDays: 23, visits: 18, avgTimeOnPageMs: 10_000, dropped: 3 });
    expect(result.pages[0].totals).toEqual({ logoViews: 4, viewerDays: 3, clicks: 1, clickRate: 0.25 });
    expect(result.pages[0].busiestDays.map((day) => day.date)).toEqual(["2026-11-30", "2026-11-01"]);
    expect(result.pages[0].busiestDays.find((day) => day.date === "2026-11-01")?.matches).toEqual(["vs Nov FC"]);
  });

  it("includes the whole of a leap-year February", () => {
    const result = report({
      month: "2028-02",
      now: NOW,
      totals: [totals("2028-02-29", { views: 3 }), totals("2028-03-01", { views: 9 })],
    });
    expect(result.site.views).toBe(3);
  });
});

describe("buildMonthlyReport: site traffic", () => {
  it("sums views, visits, visitor days and dropped, and averages time on page over views", () => {
    const result = report({
      totals: [
        totals("2026-11-02", { views: 100, visitors: 60, visits: 70, engaged_ms: 3_000_000, dropped: 2 }),
        totals("2026-11-03", { views: 50, visitors: 30, visits: 35, engaged_ms: 1_500_000, dropped: 0 }),
      ],
    });
    expect(result.site).toEqual({ views: 150, visitorDays: 90, visits: 105, avgTimeOnPageMs: 30_000, dropped: 2 });
  });

  it("rounds the average to a whole millisecond", () => {
    expect(report({ totals: [totals("2026-11-02", { views: 3, engaged_ms: 10 })] }).site.avgTimeOnPageMs).toBe(3);
    expect(report({ totals: [totals("2026-11-02", { views: 3, engaged_ms: 11 })] }).site.avgTimeOnPageMs).toBe(4);
  });

  it("leaves time on page empty when there are no views or no engaged time was measured", () => {
    expect(report({ totals: [] }).site.avgTimeOnPageMs).toBeNull();
    expect(report({ totals: [totals("2026-11-02", { views: 0, engaged_ms: 5000 })] }).site.avgTimeOnPageMs).toBeNull();
    expect(report({ totals: [totals("2026-11-02", { views: 40, engaged_ms: 0 })] }).site.avgTimeOnPageMs).toBeNull();
    expect(report({ totals: [] }).site).toEqual({ views: 0, visitorDays: 0, visits: 0, avgTimeOnPageMs: null, dropped: 0 });
  });

  it("accepts numbers that arrive as strings", () => {
    const result = report({
      totals: [
        {
          local_date: "2026-11-02",
          views: "100",
          visitors: "60",
          visits: "70",
          engaged_ms: "3000000",
          engaged_views: "40",
          dropped: "4",
        } as unknown as TotalsRow,
      ],
      sponsor: NIKE,
      sponsorRows: [{ local_date: "2026-11-02", sponsor_id: NIKE, logo_views: "8", logo_viewers: "6", clicks: "2" } as unknown as SponsorRow],
    });
    expect(result.site).toEqual({ views: 100, visitorDays: 60, visits: 70, avgTimeOnPageMs: 30_000, dropped: 4 });
    expect(result.pages[0].totals).toEqual({ logoViews: 8, viewerDays: 6, clicks: 2, clickRate: 0.25 });
  });
});

describe("buildMonthlyReport: sponsor pages", () => {
  const rows: SponsorRow[] = [
    logos("2026-11-02", NIKE, { logo_views: 30, logo_viewers: 20, clicks: 3 }),
    logos("2026-11-03", NIKE, { logo_views: 10, logo_viewers: 8, clicks: 1 }),
    logos("2026-11-02", ACME, { logo_views: 40, logo_viewers: 25, clicks: 4 }),
    logos("2026-11-04", ZED, { logo_views: 0, logo_viewers: 0, clicks: 0 }),
  ];

  it("with all, makes a page per active sponsor, most logo views first, and drops sponsors with no activity", () => {
    const result = report({ sponsor: "all", sponsorRows: rows });
    // Nike and Acme both have 40 logo views: ties break by name, so Acme (A) comes before Nike (N).
    expect(result.pages.map((page) => page.sponsorId)).toEqual([ACME, NIKE]);
    expect(result.pages.map((page) => page.name)).toEqual(["Acme Plumbing", "Nike Portland"]);
    expect(result.pages.find((page) => page.sponsorId === ZED)).toBeUndefined();
  });

  it("orders by logo views first, then name", () => {
    const result = report({
      sponsorRows: [
        logos("2026-11-02", ZED, { logo_views: 50, logo_viewers: 10 }),
        logos("2026-11-02", NIKE, { logo_views: 7, logo_viewers: 5 }),
        logos("2026-11-02", ACME, { logo_views: 7, logo_viewers: 5 }),
      ],
    });
    expect(result.pages.map((page) => page.name)).toEqual(["Zed Dental", "Acme Plumbing", "Nike Portland"]);
  });

  it("counts a sponsor that was only clicked as active", () => {
    const result = report({ sponsorRows: [logos("2026-11-02", NIKE, { logo_views: 0, clicks: 2 })] });
    expect(result.pages.map((page) => page.sponsorId)).toEqual([NIKE]);
    expect(result.pages[0].totals.clickRate).toBeNull();
  });

  it("makes exactly one page for a chosen sponsor, even with no activity", () => {
    const quiet = report({ sponsor: ZED, sponsorRows: rows });
    expect(quiet.pages).toHaveLength(1);
    expect(quiet.pages[0]).toMatchObject({
      sponsorId: ZED,
      name: "Zed Dental",
      logoUrl: "https://example.test/zed.png",
      removed: false,
      totals: { logoViews: 0, viewerDays: 0, clicks: 0, clickRate: null },
    });
    const nothingAtAll = report({ sponsor: NIKE, sponsorRows: [] });
    expect(nothingAtAll.pages).toHaveLength(1);
    expect(nothingAtAll.pages[0].totals).toEqual({ logoViews: 0, viewerDays: 0, clicks: 0, clickRate: null });
  });

  it("uses the chosen sponsor's own rows only, and accepts an upper-case id", () => {
    const result = report({ sponsor: NIKE.toUpperCase(), sponsorRows: rows });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].sponsorId).toBe(NIKE);
    expect(result.pages[0].totals).toEqual({ logoViews: 40, viewerDays: 28, clicks: 4, clickRate: 0.1 });
  });

  it("treats a sponsor that is not a uuid as all", () => {
    expect(report({ sponsor: "everyone", sponsorRows: rows }).pages.map((page) => page.sponsorId).sort()).toEqual([ACME, NIKE].sort());
  });

  it("reports a deleted sponsor's history as Removed sponsor", () => {
    const result = report({
      sponsorRows: [logos("2026-11-02", GONE, { logo_views: 12, logo_viewers: 9, clicks: 3 }), ...rows],
    });
    const removed = result.pages.find((page) => page.sponsorId === GONE);
    expect(removed).toMatchObject({ name: "Removed sponsor", logoUrl: null, removed: true });
    expect(removed?.totals).toEqual({ logoViews: 12, viewerDays: 9, clicks: 3, clickRate: 0.25 });
    expect(result.pages.filter((page) => page.removed)).toHaveLength(1);
    expect(result.pages.filter((page) => !page.removed).every((page) => page.name !== "Removed sponsor")).toBe(true);
  });

  it("makes a page for a chosen sponsor that is no longer listed", () => {
    const result = report({ sponsor: GONE, sponsorRows: [logos("2026-11-02", GONE, { logo_views: 2, clicks: 1 })] });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ sponsorId: GONE, name: "Removed sponsor", removed: true });
  });

  it("never returns NaN or Infinity for the click rate", () => {
    const result = report({ sponsorRows: [logos("2026-11-02", NIKE, { logo_views: 0, logo_viewers: 0, clicks: 5 })] });
    expect(result.pages[0].totals.clickRate).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it("gives a click rate of zero, not null, when there were views and no clicks", () => {
    const result = report({ sponsor: NIKE, sponsorRows: [logos("2026-11-02", NIKE, { logo_views: 10, logo_viewers: 7, clicks: 0 })] });
    expect(result.pages[0].totals.clickRate).toBe(0);
  });

  it("keeps a sponsor with no logo url as null", () => {
    const result = report({ sponsor: ACME });
    expect(result.pages[0].logoUrl).toBeNull();
  });
});

describe("buildMonthlyReport: busiest days and matches", () => {
  const month: TotalsRow[] = [
    totals("2026-11-01", { views: 10 }),
    totals("2026-11-07", { views: 90 }),
    totals("2026-11-08", { views: 70 }),
    totals("2026-11-14", { views: 70 }),
    totals("2026-11-15", { views: 30 }),
    totals("2026-11-16", { views: 0 }),
  ];

  it("takes the top three days by site views, with ties going to the earlier date", () => {
    const result = report({ sponsor: NIKE, totals: month });
    expect(result.pages[0].busiestDays.map((day) => [day.date, day.siteViews])).toEqual([
      ["2026-11-07", 90],
      ["2026-11-08", 70],
      ["2026-11-14", 70],
    ]);
  });

  it("leaves out days with no site views and returns fewer than three when there are fewer", () => {
    const result = report({
      sponsor: NIKE,
      totals: [totals("2026-11-02", { views: 0 }), totals("2026-11-03", { views: 4 }), totals("2026-11-04", { views: 0 })],
    });
    expect(result.pages[0].busiestDays).toEqual([{ date: "2026-11-03", siteViews: 4, logoViews: 0, matches: [] }]);
    expect(report({ sponsor: NIKE, totals: [] }).pages[0].busiestDays).toEqual([]);
  });

  it("shows this sponsor's logo views on each of those days, zero where it had none", () => {
    const result = report({
      sponsor: NIKE,
      totals: month,
      sponsorRows: [
        logos("2026-11-07", NIKE, { logo_views: 25 }),
        logos("2026-11-07", ACME, { logo_views: 99 }),
        logos("2026-11-14", NIKE, { logo_views: 6 }),
        logos("2026-11-15", NIKE, { logo_views: 3 }),
      ],
    });
    expect(result.pages[0].busiestDays.map((day) => [day.date, day.logoViews])).toEqual([
      ["2026-11-07", 25],
      ["2026-11-08", 0],
      ["2026-11-14", 6],
    ]);
  });

  it("uses the same days on every sponsor's page", () => {
    const result = report({
      totals: month,
      sponsorRows: [logos("2026-11-07", NIKE, { logo_views: 5 }), logos("2026-11-08", ACME, { logo_views: 4 })],
    });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].busiestDays.map((day) => day.date)).toEqual(result.pages[1].busiestDays.map((day) => day.date));
  });

  it("labels home games vs and away games at, and a game with no home flag vs", () => {
    const matches: MatchRow[] = [
      { date: "2026-11-07", opponent: "Eastside FC", home: true },
      { date: "2026-11-08", opponent: "Westside United", home: false },
      { date: "2026-11-14", opponent: "Northgate", home: null },
    ];
    const result = report({ sponsor: NIKE, totals: month, matches });
    expect(result.pages[0].busiestDays.map((day) => day.matches)).toEqual([["vs Eastside FC"], ["at Westside United"], ["vs Northgate"]]);
  });

  it("lists several games on one day, in the order given", () => {
    const result = report({
      sponsor: NIKE,
      totals: month,
      matches: [
        { date: "2026-11-07", opponent: "Morning Rovers", home: true },
        { date: "2026-11-07", opponent: "Evening Athletic", home: false },
      ],
    });
    expect(result.pages[0].busiestDays[0].matches).toEqual(["vs Morning Rovers", "at Evening Athletic"]);
  });

  it("does not show games on days that are not among the busiest", () => {
    const result = report({
      sponsor: NIKE,
      totals: month,
      matches: [{ date: "2026-11-01", opponent: "Quiet Day FC", home: true }],
    });
    expect(result.pages[0].busiestDays.every((day) => day.matches.length === 0)).toBe(true);
  });

  it("adds up a day's rows if one arrives twice", () => {
    const result = report({ sponsor: NIKE, totals: [totals("2026-11-05", { views: 4 }), totals("2026-11-05", { views: 6 })] });
    expect(result.pages[0].busiestDays).toEqual([{ date: "2026-11-05", siteViews: 10, logoViews: 0, matches: [] }]);
  });
});
