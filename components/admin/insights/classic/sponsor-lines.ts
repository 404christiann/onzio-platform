import { clickRate } from "@/lib/telemetry/insights-math";
import type { MonthlyReport, SponsorListing, TotalsRow } from "@/lib/telemetry/report-data";

// UI-POLISH-INSIGHTS: what the Insights tab and the report's summary page show
// per sponsor for one month, built from the month report that
// lib/telemetry/report-data.ts already reads. Presentation only: no reads here.

export type SponsorLine = {
  id: string;
  name: string;
  removed: boolean;
  logoViews: number;
  /** Logo viewers summed over days: visitor-days, never unique people. */
  viewerDays: number;
  clicks: number;
  /** clicks / logoViews; null when the logo was never seen. */
  clickRate: number | null;
};

export type SponsorSummary = {
  lines: SponsorLine[];
  logoViews: number;
  clicks: number;
  clickRate: number | null;
};

/**
 * Every sponsor with numbers this month (a deleted one as "Removed sponsor"),
 * plus every listed sponsor that was not seen, so a sponsor with nothing to show
 * still has its row. Most logo views first, then most clicks, then by name.
 */
export function sponsorSummary(report: MonthlyReport, listed: readonly SponsorListing[]): SponsorSummary {
  const lines: SponsorLine[] = report.pages.map((page) => ({
    id: page.sponsorId,
    name: page.name,
    removed: page.removed,
    logoViews: page.totals.logoViews,
    viewerDays: page.totals.viewerDays,
    clicks: page.totals.clicks,
    clickRate: page.totals.clickRate,
  }));
  const seen = new Set(lines.map((line) => line.id.toLowerCase()));
  for (const sponsor of listed) {
    if (seen.has(sponsor.id.toLowerCase())) continue;
    lines.push({ id: sponsor.id, name: sponsor.name, removed: false, logoViews: 0, viewerDays: 0, clicks: 0, clickRate: null });
  }
  lines.sort((a, b) => b.logoViews - a.logoViews || b.clicks - a.clicks || a.name.localeCompare(b.name, "en"));
  const logoViews = lines.reduce((sum, line) => sum + line.logoViews, 0);
  const clicks = lines.reduce((sum, line) => sum + line.clicks, 0);
  return { lines, logoViews, clicks, clickRate: clickRate(clicks, logoViews) };
}

/** The month name people say: "November", or "November 2025" for another year. */
export function spokenMonth(report: MonthlyReport, currentMonth: string): string {
  const [name, year] = report.monthLabel.split(" ");
  return year && report.month.slice(0, 4) !== currentMonth.slice(0, 4) ? `${name} ${year}` : name;
}

/** The page's one-line answer to "what did my sponsors get this month?". */
export function sponsorHeadline(summary: SponsorSummary, report: MonthlyReport, currentMonth: string): string {
  const month = spokenMonth(report, currentMonth);
  if (summary.lines.length === 0) return "No sponsors on your website yet";
  if (summary.logoViews === 0) {
    return report.soFar ? `No sponsor logos seen so far in ${month}` : `No sponsor logos were seen in ${month}`;
  }
  const times = `${summary.logoViews.toLocaleString("en-US")} ${summary.logoViews === 1 ? "time" : "times"}`;
  return report.soFar ? `Your sponsors have been seen ${times} so far in ${month}` : `Your sponsors were seen ${times} in ${month}`;
}

export type DayBar = { date: string; views: number | null; matchDay: boolean };

/** One bar per day of the month up to its last counted day; null where no row exists. */
export function monthDays(report: MonthlyReport, totals: readonly TotalsRow[], matchDates: ReadonlySet<string>): DayBar[] {
  const byDate = new Map<string, number>();
  for (const row of totals) {
    const views = Number(row.views);
    const date = String(row.local_date).slice(0, 10);
    if (date.startsWith(report.month)) byDate.set(date, (byDate.get(date) ?? 0) + (Number.isFinite(views) ? views : 0));
  }
  const [year, month] = report.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = report.throughDate ? Number(report.throughDate.slice(8, 10)) : daysInMonth;
  const days: DayBar[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${report.month}-${String(day).padStart(2, "0")}`;
    days.push({ date, views: byDate.get(date) ?? null, matchDay: matchDates.has(date) });
  }
  return days;
}
