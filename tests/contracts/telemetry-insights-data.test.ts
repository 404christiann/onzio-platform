import { describe, expect, it } from "vitest";
import { loadInsightsData, type InsightsClient } from "@/lib/telemetry/insights-data";

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "gte" | "lte" | "in"; column: string; value: unknown };
type Recorded = { table: string; filters: Filter[]; ranges: Array<[number, number]> };

const CLUB = "club-a";

function fakeClient(tables: Record<string, Row[]>, failTable?: string) {
  const queries: Recorded[] = [];
  const client = {
    schema: () => client,
    from(table: string) {
      const filters: Filter[] = [];
      const orders: Array<{ column: string; ascending: boolean }> = [];
      const recorded: Recorded = { table, filters, ranges: [] };
      queries.push(recorded);
      let limit = Infinity;
      let range: [number, number] | null = null;
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push({ op: "eq", column, value }), builder),
        gte: (column: string, value: unknown) => (filters.push({ op: "gte", column, value }), builder),
        lte: (column: string, value: unknown) => (filters.push({ op: "lte", column, value }), builder),
        in: (column: string, value: unknown) => (filters.push({ op: "in", column, value }), builder),
        order: (column: string, options?: { ascending?: boolean }) => (orders.push({ column, ascending: options?.ascending !== false }), builder),
        limit: (n: number) => ((limit = n), builder),
        range: (from: number, to: number) => ((range = [from, to]), recorded.ranges.push([from, to]), builder),
        then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown) {
          if (table === failTable) return resolve({ data: null, error: { message: "boom" } });
          let rows = (tables[table] ?? []).filter((row) =>
            filters.every((f) => {
              const v = row[f.column] as string | number;
              if (f.op === "eq") return v === f.value;
              if (f.op === "gte") return v >= (f.value as string);
              if (f.op === "lte") return v <= (f.value as string);
              return (f.value as unknown[]).includes(v);
            }),
          );
          rows = [...rows].sort((a, b) => {
            for (const o of orders) {
              const x = a[o.column] as string | number;
              const y = b[o.column] as string | number;
              if (x < y) return o.ascending ? -1 : 1;
              if (x > y) return o.ascending ? 1 : -1;
            }
            return 0;
          });
          if (range) rows = rows.slice(range[0], range[1] + 1);
          return resolve({ data: rows.slice(0, limit), error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as InsightsClient, queries };
}

// now = 2026-11-21 noon UTC in Los Angeles => end 2026-11-20, a 7-day window starts 2026-11-14.
const NOW = new Date("2026-11-21T20:00:00Z");
const input = { clubId: CLUB, timeZone: "America/Los_Angeles", range: 7 as const, now: NOW };

const total = (local_date: string, over: Row = {}): Row => ({
  club_id: CLUB, local_date, views: 10, visitors: 4, visits: 5, engaged_ms: 60_000, engaged_views: 6, dropped: 1,
  computed_at: "2026-11-21T10:00:00Z", ...over,
});
const crumb = (dimension: string, value: string, views: number, over: Row = {}): Row => ({
  club_id: CLUB, local_date: "2026-11-15", dimension, value, views, visitors: views, engaged_ms: views * 1000, ...over,
});

describe("loadInsightsData", () => {
  it("is no-rollups when the club has no totals row at all", async () => {
    const { client } = fakeClient({ page_daily_totals: [total("2026-11-15", { club_id: "other" })] });
    expect(await loadInsightsData(client, input)).toEqual({ status: "no-rollups" });
  });

  it("is ready with empty totals when rollups exist only outside the window", async () => {
    const { client } = fakeClient({ page_daily_totals: [total("2026-01-01")] });
    const result = await loadInsightsData(client, input);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.totals.views).toBe(0);
    expect(result.daily.every((day) => day.views === null)).toBe(true);
    expect(result.computedAt).toBeNull();
  });

  it.each(["page_daily_totals", "page_daily_breakdowns", "sponsor_daily_rollups", "matches", "site_sponsor_logos"])(
    "is error when a %s query fails",
    async (failing) => {
      const { client } = fakeClient(
        {
          page_daily_totals: [total("2026-11-15")],
          sponsor_daily_rollups: [{ club_id: CLUB, local_date: "2026-11-15", sponsor_id: "s1", logo_views: 1, logo_viewers: 1, clicks: 0 }],
        },
        failing,
      );
      expect(await loadInsightsData(client, input)).toEqual({ status: "error" });
    },
  );

  it("sums totals, treats visitors as visitor-days, and nulls days without data", async () => {
    const { client } = fakeClient({
      page_daily_totals: [
        total("2026-11-15"),
        total("2026-11-17", { views: 20, visitors: 8, visits: 9, engaged_ms: 120_000, engaged_views: 4, dropped: 2, computed_at: "2026-11-21T12:00:00Z" }),
        total("2026-11-01"),
      ],
      matches: [
        { club_id: CLUB, id: "m1", date: "2026-11-17", opponent: "Rivals", home: true },
        { club_id: CLUB, id: "m2", date: "2026-11-01", opponent: "Old", home: false },
        { club_id: "other", id: "m3", date: "2026-11-16", opponent: "Nope", home: true },
      ],
    });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.start).toBe("2026-11-14");
    expect(result.end).toBe("2026-11-20");
    expect(result.totals).toEqual({
      views: 30, visitorDays: 12, visits: 14, engagedMs: 180_000, engagedViews: 10, avgTimeMs: 18_000, dropped: 3,
    });
    expect(result.dropped).toBe(3);
    expect(result.daily.map((d) => d.date)).toEqual([
      "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
    ]);
    expect(result.daily[0]).toEqual({ date: "2026-11-14", views: null, visitorDays: null, visits: null, matchDay: false });
    expect(result.daily[1]).toMatchObject({ views: 10, visitorDays: 4, visits: 5, matchDay: false });
    expect(result.daily[3]).toMatchObject({ views: 20, matchDay: true });
    expect(result.matches).toEqual([{ date: "2026-11-17", opponent: "Rivals", home: true }]);
    expect(result.computedAt).toBe("2026-11-21T12:00:00.000Z");
  });

  it("has a null average time when nothing was measured", async () => {
    const { client } = fakeClient({ page_daily_totals: [total("2026-11-15", { engaged_ms: 0, engaged_views: 0 })] });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.totals.avgTimeMs).toBeNull();
  });

  it("keeps the top 10 per dimension by views, ties by value, with time per page view", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 12; i += 1) rows.push(crumb("source", `s${String(i).padStart(2, "0")}`, 100 - i));
    rows.push(crumb("source", "s00", 5, { local_date: "2026-11-16" })); // adds to s00 across days: 105
    rows.push(crumb("device", "mobile", 7), crumb("device", "desktop", 7), crumb("device", "tablet", 9));
    rows.push(crumb("country", "US", 4, { engaged_ms: 0 }));
    rows.push(crumb("source", "out-of-window", 999, { local_date: "2026-01-01" }));
    const { client } = fakeClient({ page_daily_totals: [total("2026-11-15")], page_daily_breakdowns: rows });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.top.source).toHaveLength(10);
    expect(result.top.source[0]).toMatchObject({ value: "s00", views: 105, visitorDays: 105, engagedMs: 105_000, avgTimeMs: 1000 });
    expect(result.top.source.map((r) => r.value).slice(0, 3)).toEqual(["s00", "s01", "s02"]);
    expect(result.top.source.some((r) => r.value === "s11" || r.value === "out-of-window")).toBe(false);
    expect(result.top.device.map((r) => r.value)).toEqual(["tablet", "desktop", "mobile"]);
    expect(result.top.country[0].avgTimeMs).toBeNull();
    expect(result.top.city).toEqual([]);
  });

  it("names sponsors, labels removed ones, and gives a null click rate with no logo views", async () => {
    const sp = (sponsor_id: string, logo_views: number, clicks: number, local_date = "2026-11-15"): Row => ({
      club_id: CLUB, local_date, sponsor_id, logo_views, logo_viewers: Math.ceil(logo_views / 2), clicks,
    });
    const { client, queries } = fakeClient({
      page_daily_totals: [total("2026-11-15")],
      sponsor_daily_rollups: [sp("s1", 100, 5), sp("s1", 100, 3, "2026-11-16"), sp("gone", 10, 1), sp("zero", 0, 0), sp("s2", 100, 0)],
      site_sponsor_logos: [
        { club_id: CLUB, id: "s1", name: "Acme" },
        { club_id: CLUB, id: "s2", name: "Beta" },
        { club_id: CLUB, id: "zero", name: "Zero Views" },
        { club_id: "other", id: "gone", name: "Leak" },
      ],
    });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.sponsors.map((s) => s.name)).toEqual(["Acme", "Beta", "Removed sponsor", "Zero Views"]);
    expect(result.sponsors[0]).toMatchObject({ sponsorId: "s1", logoViews: 200, logoViewerDays: 100, clicks: 8, clickRate: 0.04, removed: false });
    expect(result.sponsors[2]).toMatchObject({ sponsorId: "gone", removed: true, clickRate: 0.1 });
    expect(result.sponsors[3]).toMatchObject({ logoViews: 0, clickRate: null });
    const names = queries.find((q) => q.table === "site_sponsor_logos")!;
    expect(names.filters).toContainEqual({ op: "eq", column: "club_id", value: CLUB });
  });

  it("pages past 1000 rows with a stable order", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 2500; i += 1) rows.push(crumb("referrer", `r${String(i).padStart(4, "0")}`, 1));
    const { client, queries } = fakeClient({ page_daily_totals: [total("2026-11-15")], page_daily_breakdowns: rows });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    const referrerQueries = queries.filter(
      (q) => q.table === "page_daily_breakdowns" && q.filters.some((f) => f.column === "dimension" && f.value === "referrer"),
    );
    // Each page is its own build: three pages of a stably ordered query.
    expect(referrerQueries.map((q) => q.ranges[0])).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(result.top.referrer).toHaveLength(10);
  });

  it("is error when the page cap is hit", async () => {
    const endless = {
      schema: () => endless,
      from: (table: string) => {
        const builder = {
          select: () => builder, eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder,
          order: () => builder, limit: () => builder,
          range: () => builder,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: table === "page_daily_totals" ? [{ local_date: "2026-11-15" }] : new Array(1000).fill({ local_date: "2026-11-15", value: "x", views: 1 }), error: null }),
        };
        return builder;
      },
    } as unknown as InsightsClient;
    expect(await loadInsightsData(endless, input)).toEqual({ status: "error" });
  });

  it("lists site paths: home first, then public paths by views, no admin/api/redirect/query paths", async () => {
    const paths: Array<[string, number]> = [
      ["/schedule", 50], ["/tickets", 80], ["/admin/insights", 999], ["/api/t", 998], ["/r/abc", 997],
      ["/shop?x=1", 996], ["/about#top", 995], ["/with\u0007bell", 994], ["no-slash", 993], ["/", 1], ["/admin", 992], ["/administrators", 3],
    ];
    const { client } = fakeClient({
      page_daily_totals: [total("2026-11-15")],
      page_daily_breakdowns: paths.map(([value, views]) => crumb("path", value, views)),
    });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.sitePaths).toEqual(["/", "/tickets", "/schedule", "/administrators"]);
  });

  it("includes home even with no traffic and caps site paths at 50", async () => {
    const many = Array.from({ length: 80 }, (_, i) => crumb("path", `/p${String(i).padStart(2, "0")}`, 100 - i));
    const { client } = fakeClient({ page_daily_totals: [total("2026-11-15")], page_daily_breakdowns: many });
    const result = await loadInsightsData(client, input);
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.sitePaths).toHaveLength(50);
    expect(result.sitePaths[0]).toBe("/");
    expect(result.sitePaths[1]).toBe("/p00");
  });

  it("filters every query by club_id and only reads the allowed tables", async () => {
    const { client, queries } = fakeClient({
      page_daily_totals: [total("2026-11-15")],
      sponsor_daily_rollups: [{ club_id: CLUB, local_date: "2026-11-15", sponsor_id: "s1", logo_views: 1, logo_viewers: 1, clicks: 0 }],
    });
    await loadInsightsData(client, input);
    expect(queries.length).toBeGreaterThanOrEqual(12);
    for (const query of queries) {
      expect(query.filters, query.table).toContainEqual({ op: "eq", column: "club_id", value: CLUB });
    }
    expect(new Set(queries.map((q) => q.table))).toEqual(
      new Set(["page_daily_totals", "page_daily_breakdowns", "sponsor_daily_rollups", "matches", "site_sponsor_logos"]),
    );
  });
});
