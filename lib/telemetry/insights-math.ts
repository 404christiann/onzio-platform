import { clubToday, formatClubDate } from "@/lib/club-time";

// TELEMETRY-04: the pure pieces of the Sponsor Insights tab, shared by the
// server reader (lib/telemetry/insights-data.ts) and the dashboard. No I/O.
//
// Visitors are counted per club-local day (a new salt each day), so a sum over
// days is "visitor-days", never "monthly visitors".

export const INSIGHTS_RANGES = [7, 30, 90] as const;
export type InsightsRange = (typeof INSIGHTS_RANGES)[number];
export const DEFAULT_INSIGHTS_RANGE: InsightsRange = 30;

export const INSIGHTS_DIMENSIONS = [
  "path",
  "source",
  "device",
  "country",
  "city",
  "referrer",
  "utm_campaign",
  "utm_source",
] as const;
export type InsightsDimension = (typeof INSIGHTS_DIMENSIONS)[number];

export const INSIGHTS_TOP_LIMIT = 10;
export const REMOVED_SPONSOR_NAME = "Removed sponsor";

/** The ?range= search param as a supported range; anything else is the default. */
export function parseInsightsRange(value: string | string[] | undefined): InsightsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return (INSIGHTS_RANGES as readonly number[]).includes(parsed) ? (parsed as InsightsRange) : DEFAULT_INSIGHTS_RANGE;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * The club-local days a range covers, oldest first: `range` days ending
 * yesterday in the club's time zone (today is still being counted).
 */
export function insightsWindow(
  range: InsightsRange,
  timeZone: string,
  now: Date = new Date(),
): { start: string; end: string; dates: string[] } {
  const end = shiftDate(clubToday(timeZone, now), -1);
  const start = shiftDate(end, -(range - 1));
  const dates = Array.from({ length: range }, (_, index) => shiftDate(start, index));
  return { start, end, dates };
}

/** Average engaged time in ms, or null when nothing was measured (never a fake 0:00). */
export function averageTimeMs(engagedMs: number, engagedCount: number): number | null {
  if (!Number.isFinite(engagedMs) || !Number.isFinite(engagedCount) || engagedCount <= 0 || engagedMs <= 0) return null;
  return engagedMs / engagedCount;
}

/** A duration as m:ss ("2:05"); 60 minutes and over as h:mm:ss. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Clicks per logo view, 0..1, or null with no logo views (no rate to show). */
export function clickRate(clicks: number, logoViews: number): number | null {
  if (!Number.isFinite(clicks) || !Number.isFinite(logoViews) || logoViews <= 0) return null;
  return clicks / logoViews;
}

/** A click rate for people to read: "4.2%"; "—" when there is none. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  const percent = rate * 100;
  return `${percent >= 10 || percent === 0 ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

/** The sponsor's saved name, or "Removed sponsor" once its row is gone. */
export function sponsorDisplayName(names: ReadonlyMap<string, string>, sponsorId: string): { name: string; removed: boolean } {
  const name = names.get(sponsorId)?.trim();
  return name ? { name, removed: false } : { name: REMOVED_SPONSOR_NAME, removed: true };
}

/** A rollup's plain club-local date for people to read: "Nov 14". */
export function formatInsightsDate(date: string): string {
  return formatClubDate(date, "short") ?? date;
}

/** A count with thousands separators: "12,345". */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
