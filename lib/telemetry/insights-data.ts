import type { SupabaseClient } from "@supabase/supabase-js";
import {
  averageTimeMs,
  clickRate,
  INSIGHTS_DIMENSIONS,
  INSIGHTS_TOP_LIMIT,
  insightsWindow,
  sponsorDisplayName,
  type InsightsDimension,
  type InsightsRange,
} from "@/lib/telemetry/insights-math";

// TELEMETRY-04: the Sponsor Insights reader. It uses the client it is given
// (the signed-in cookie client), so RLS is the boundary: only a fresh-session
// owner or admin of the club sees any rollup row, and everyone else gets
// "no-rollups". Every query is also filtered by club_id (defense in depth).
// Reads only: five tables, no RPC, never the service-role client.
//
// PostgREST caps a response at 1000 rows and aggregates are off, so each read
// pages with a stable order. Visitors are counted per club-local day; sums over
// days are visitor-days, never unique visitors.

export type InsightsTotals = {
  views: number;
  /** Sum of per-day visitors over the range: visitor-days, never unique visitors. */
  visitorDays: number;
  visits: number;
  engagedMs: number;
  engagedViews: number;
  /** engagedMs / engagedViews, null when nothing was measured. */
  avgTimeMs: number | null;
  dropped: number;
};

export type InsightsDay = {
  date: string;
  /** null when the day has no rollup row (no data), never a fake 0. */
  views: number | null;
  visitorDays: number | null;
  visits: number | null;
  matchDay: boolean;
};

export type InsightsTopRow = {
  value: string;
  views: number;
  visitorDays: number;
  engagedMs: number;
  /** engagedMs / views for the row (time per page view), null when unmeasured. */
  avgTimeMs: number | null;
};

export type InsightsSponsorRow = {
  sponsorId: string;
  name: string;
  removed: boolean;
  logoViews: number;
  /** logo_viewers summed over days: visitor-days. */
  logoViewerDays: number;
  clicks: number;
  /** clicks / logoViews, null with no logo views. */
  clickRate: number | null;
};

export type InsightsMatch = { date: string; opponent: string; home: boolean };

export type InsightsData = {
  status: "ready";
  range: InsightsRange;
  start: string;
  end: string;
  totals: InsightsTotals;
  daily: InsightsDay[];
  top: Record<InsightsDimension, InsightsTopRow[]>;
  sponsors: InsightsSponsorRow[];
  matches: InsightsMatch[];
  dropped: number;
  /** Latest computed_at of the club's rollups, ISO string; null if none in range. */
  computedAt: string | null;
  /** Public paths for the campaign link builder: "/" first, then paths seen in traffic. */
  sitePaths: string[];
};

export type InsightsResult = InsightsData | { status: "no-rollups" } | { status: "error" };

export type InsightsClient = SupabaseClient<any, any, any>;

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type Row = Record<string, unknown>;
type PageResult = { data: Row[] | null; error: unknown };
type Pageable = { range: (from: number, to: number) => PromiseLike<PageResult> };

class InsightsReadError extends Error {}

/** Every row of a stably ordered query, one page at a time; too many pages is an error. */
async function fetchAll(build: () => Pageable): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new InsightsReadError("insights read failed");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new InsightsReadError("insights read exceeded the page cap");
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function isPublicPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !/^\/(admin|api)(\/|$)/.test(value) &&
    !value.startsWith("/r/") &&
    !/[?#\u0000-\u001f\u007f]/.test(value)
  );
}

export async function loadInsightsData(
  supabase: InsightsClient,
  input: { clubId: string; timeZone: string; range: InsightsRange; now?: Date },
): Promise<InsightsResult> {
  const { clubId, range } = input;
  const window = insightsWindow(range, input.timeZone, input.now);
  const db = supabase.schema("onzio");

  try {
    const anyRollup = await db.from("page_daily_totals").select("local_date").eq("club_id", clubId).limit(1);
    if (anyRollup.error) return { status: "error" };
    if (!anyRollup.data || anyRollup.data.length === 0) return { status: "no-rollups" };

    const inWindow = <T extends { gte: (c: string, v: string) => any }>(query: T, column = "local_date") =>
      query.gte(column, window.start).lte(column, window.end);

    const [totalRows, sponsorRows, matchRows, ...breakdownRows] = await Promise.all([
      fetchAll(() =>
        inWindow(
          db
            .from("page_daily_totals")
            .select("local_date,views,visitors,visits,engaged_ms,engaged_views,dropped,computed_at")
            .eq("club_id", clubId),
        ).order("local_date", { ascending: true }),
      ),
      fetchAll(() =>
        inWindow(
          db.from("sponsor_daily_rollups").select("local_date,sponsor_id,logo_views,logo_viewers,clicks").eq("club_id", clubId),
        )
          .order("local_date", { ascending: true })
          .order("sponsor_id", { ascending: true }),
      ),
      fetchAll(() =>
        inWindow(db.from("matches").select("id,date,opponent,home").eq("club_id", clubId), "date")
          .order("date", { ascending: true })
          .order("id", { ascending: true }),
      ),
      ...INSIGHTS_DIMENSIONS.map((dimension) =>
        fetchAll(() =>
          inWindow(
            db
              .from("page_daily_breakdowns")
              .select("local_date,value,views,visitors,engaged_ms")
              .eq("club_id", clubId)
              .eq("dimension", dimension),
          )
            .order("local_date", { ascending: true })
            .order("value", { ascending: true }),
        ),
      ),
    ]);

    // Totals and the per-day series.
    const totals = { views: 0, visitorDays: 0, visits: 0, engagedMs: 0, engagedViews: 0, dropped: 0 };
    const byDate = new Map<string, { views: number; visitorDays: number; visits: number }>();
    let computedAt: number | null = null;
    for (const row of totalRows) {
      const views = num(row.views);
      const visitors = num(row.visitors);
      const visits = num(row.visits);
      totals.views += views;
      totals.visitorDays += visitors;
      totals.visits += visits;
      totals.engagedMs += num(row.engaged_ms);
      totals.engagedViews += num(row.engaged_views);
      totals.dropped += num(row.dropped);
      byDate.set(String(row.local_date), { views, visitorDays: visitors, visits });
      const stamp = Date.parse(String(row.computed_at));
      if (Number.isFinite(stamp) && (computedAt === null || stamp > computedAt)) computedAt = stamp;
    }

    const matches = matchRows.map((row) => ({
      date: String(row.date),
      opponent: String(row.opponent ?? ""),
      home: row.home === true,
    }));
    const matchDates = new Set(matches.map((match) => match.date));
    const daily = window.dates.map((date) => {
      const day = byDate.get(date);
      return {
        date,
        views: day ? day.views : null,
        visitorDays: day ? day.visitorDays : null,
        visits: day ? day.visits : null,
        matchDay: matchDates.has(date),
      };
    });

    // Top rows per dimension.
    const top = {} as Record<InsightsDimension, InsightsTopRow[]>;
    INSIGHTS_DIMENSIONS.forEach((dimension, index) => {
      // Breakdowns have no engaged_views, so time per view divides only by views on days that recorded time.
      const sums = new Map<string, { views: number; visitorDays: number; engagedMs: number; timedViews: number }>();
      for (const row of breakdownRows[index]) {
        const value = String(row.value);
        const sum = sums.get(value) ?? { views: 0, visitorDays: 0, engagedMs: 0, timedViews: 0 };
        const engagedMs = num(row.engaged_ms);
        sum.views += num(row.views);
        sum.visitorDays += num(row.visitors);
        sum.engagedMs += engagedMs;
        if (engagedMs > 0) sum.timedViews += num(row.views);
        sums.set(value, sum);
      }
      top[dimension] = [...sums]
        .map(([value, { timedViews, ...sum }]) => ({ value, ...sum, avgTimeMs: averageTimeMs(sum.engagedMs, timedViews) }))
        .sort((a, b) => b.views - a.views || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
        .slice(0, INSIGHTS_TOP_LIMIT);
    });

    // Sponsors: sums per id, names from the club's current sponsor list.
    const sponsorSums = new Map<string, { logoViews: number; logoViewerDays: number; clicks: number }>();
    for (const row of sponsorRows) {
      const id = String(row.sponsor_id);
      const sum = sponsorSums.get(id) ?? { logoViews: 0, logoViewerDays: 0, clicks: 0 };
      sum.logoViews += num(row.logo_views);
      sum.logoViewerDays += num(row.logo_viewers);
      sum.clicks += num(row.clicks);
      sponsorSums.set(id, sum);
    }
    const names = new Map<string, string>();
    const sponsorIds = [...sponsorSums.keys()];
    for (let i = 0; i < sponsorIds.length; i += 100) {
      const named = await db
        .from("site_sponsor_logos")
        .select("id,name")
        .eq("club_id", clubId)
        .in("id", sponsorIds.slice(i, i + 100));
      if (named.error) return { status: "error" };
      for (const row of named.data ?? []) names.set(String(row.id), String(row.name ?? ""));
    }
    const sponsors: InsightsSponsorRow[] = sponsorIds
      .map((sponsorId) => {
        const sum = sponsorSums.get(sponsorId)!;
        return { sponsorId, ...sponsorDisplayName(names, sponsorId), ...sum, clickRate: clickRate(sum.clicks, sum.logoViews) };
      })
      .sort((a, b) => b.logoViews - a.logoViews || a.name.localeCompare(b.name) || (a.sponsorId < b.sponsorId ? -1 : 1));

    // Paths for the campaign link builder: the home page first, then traffic.
    const pathViews = new Map<string, number>();
    for (const row of breakdownRows[INSIGHTS_DIMENSIONS.indexOf("path")]) {
      const value = String(row.value);
      pathViews.set(value, (pathViews.get(value) ?? 0) + num(row.views));
    }
    const seen = [...pathViews]
      .filter(([value]) => value !== "/" && isPublicPath(value))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([value]) => value);
    const sitePaths = ["/", ...seen].slice(0, 50);

    return {
      status: "ready",
      range,
      start: window.start,
      end: window.end,
      totals: { ...totals, avgTimeMs: averageTimeMs(totals.engagedMs, totals.engagedViews) },
      daily,
      top,
      sponsors,
      matches,
      dropped: totals.dropped,
      computedAt: computedAt === null ? null : new Date(computedAt).toISOString(),
      sitePaths,
    };
  } catch {
    return { status: "error" };
  }
}
