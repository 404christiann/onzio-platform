import type { SupabaseClient } from "@supabase/supabase-js";
import { clubLogoUrl } from "@/lib/club-branding";
import { clubToday, formatClubDate } from "@/lib/club-time";

// TELEMETRY-05: the monthly sponsor report's data. Two halves.
//  - Pure helpers that turn the already-rolled-up daily rows into the numbers a sponsor sees. Safe to
//    import from a client component (supabase types are type-only).
//  - A thin reader over the signed-in person's own client. RLS is the boundary (fresh session plus
//    owner or admin of the club); every read is also scoped to the club. It reads only the rollup
//    tables, the sponsor list, the schedule and the logo, never raw page events and never the service role.
//
// The rollup's local_date is already the club's own calendar day, so a month here is a club-local
// month. The current month comes from the club's zone, never the server's. Visitor ids are daily by
// design, so days are summed into "visitor days", never called unique visitors.

export type TotalsRow = {
  local_date: string;
  views: number;
  visitors: number;
  visits: number;
  engaged_ms: number;
  engaged_views: number;
  dropped: number;
};
export type SponsorRow = { local_date: string; sponsor_id: string; logo_views: number; logo_viewers: number; clicks: number };
export type SponsorListing = { id: string; name: string; logo_url: string | null };
export type MatchRow = { date: string; opponent: string; home: boolean | null };

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** A "YYYY-MM" month with a month of 01 to 12, otherwise null. An array (a repeated query parameter) uses its first item. */
export function parseReportMonth(value: unknown): string | null {
  const candidate = firstValue(value);
  return typeof candidate === "string" && MONTH_PATTERN.test(candidate) ? candidate : null;
}

/** A sponsor id as a lowercased uuid, otherwise "all". */
export function parseReportSponsor(value: unknown): string {
  const candidate = firstValue(value);
  return typeof candidate === "string" && UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : "all";
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** "2026-02" -> its first day, its last day and the first day of the next month, as plain "YYYY-MM-DD" dates. */
export function monthRange(month: string): { start: string; last: string; next: string } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new RangeError(`Not a report month: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return {
    start: `${month}-01`,
    last: `${month}-${pad(daysInMonth(year, monthNumber), 2)}`,
    next: `${pad(nextYear, 4)}-${pad(nextMonth, 2)}-01`,
  };
}

/** The club's calendar month right now, as "YYYY-MM". */
export function currentClubMonth(timeZone: string, now: Date = new Date()): string {
  return clubToday(timeZone, now).slice(0, 7);
}

/** The distinct "YYYY-MM" months of some "YYYY-MM-DD" dates, newest first. */
export function availableMonths(dates: string[]): string[] {
  const months = new Set<string>();
  for (const date of dates) {
    const month = parseReportMonth(typeof date === "string" ? date.slice(0, 7) : null);
    if (month) months.add(month);
  }
  return [...months].sort().reverse();
}

/** The month to show: the one asked for if there is data, else this month if there is, else the newest, else none. */
export function chooseReportMonth(requested: string | null, available: string[], current: string): string | null {
  if (requested && available.includes(requested)) return requested;
  if (available.includes(current)) return current;
  return available[0] ?? null;
}

/** The report page's address for a month and sponsor ("all" by default). */
export function reportHref(month: string, sponsor = "all"): string {
  return `/admin/insights/report?month=${encodeURIComponent(month)}&sponsor=${encodeURIComponent(sponsor)}`;
}

export type SiteTraffic = { views: number; visitorDays: number; visits: number; avgTimeOnPageMs: number | null; dropped: number };
export type SponsorTotals = { logoViews: number; viewerDays: number; clicks: number; clickRate: number | null };
export type BusyDay = { date: string; siteViews: number; logoViews: number; matches: string[] };
export type SponsorPage = {
  sponsorId: string;
  name: string;
  logoUrl: string | null;
  removed: boolean;
  totals: SponsorTotals;
  busiestDays: BusyDay[];
};
export type MonthlyReport = {
  month: string;
  monthLabel: string;
  soFar: boolean;
  throughDate: string | null;
  site: SiteTraffic;
  pages: SponsorPage[];
};

const REMOVED_SPONSOR_NAME = "Removed sponsor";
const BUSIEST_DAY_COUNT = 3;

/** PostgREST sends bigint columns as strings. Anything that is not a finite number counts as zero. */
function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function plainDate(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function matchLabel(match: MatchRow): string {
  const opponent = (match.opponent ?? "").trim();
  return match.home === false ? `at ${opponent}` : `vs ${opponent}`;
}

export function buildMonthlyReport(input: {
  month: string;
  sponsor: string;
  timeZone: string;
  now?: Date;
  totals: TotalsRow[];
  sponsorRows: SponsorRow[];
  sponsors: SponsorListing[];
  matches: MatchRow[];
}): MonthlyReport {
  const { month, timeZone, now } = input;
  const range = monthRange(month);
  const sponsor = parseReportSponsor(input.sponsor);
  const inMonth = (date: string) => date >= range.start && date < range.next;

  const totals = input.totals.map((row) => ({ ...row, local_date: plainDate(row.local_date) })).filter((row) => inMonth(row.local_date));
  const sponsorRows = input.sponsorRows
    .map((row) => ({ ...row, local_date: plainDate(row.local_date), sponsor_id: String(row.sponsor_id ?? "").toLowerCase() }))
    .filter((row) => inMonth(row.local_date));
  const matches = input.matches.map((row) => ({ ...row, date: plainDate(row.date) })).filter((row) => inMonth(row.date));

  let views = 0;
  let visitorDays = 0;
  let visits = 0;
  let dropped = 0;
  let engagedMs = 0;
  const siteViewsByDate = new Map<string, number>();
  for (const row of totals) {
    views += count(row.views);
    visitorDays += count(row.visitors);
    visits += count(row.visits);
    dropped += count(row.dropped);
    engagedMs += count(row.engaged_ms);
    siteViewsByDate.set(row.local_date, (siteViewsByDate.get(row.local_date) ?? 0) + count(row.views));
  }

  // The busiest days belong to the site, so they are the same dates on every sponsor's page.
  const busiestDates = [...siteViewsByDate]
    .filter(([, dayViews]) => dayViews > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, BUSIEST_DAY_COUNT);
  const matchesByDate = new Map<string, string[]>();
  for (const match of matches) {
    matchesByDate.set(match.date, [...(matchesByDate.get(match.date) ?? []), matchLabel(match)]);
  }

  const listing = new Map<string, SponsorListing>();
  for (const row of input.sponsors) listing.set(String(row.id).toLowerCase(), row);

  const rowsBySponsor = new Map<string, typeof sponsorRows>();
  for (const row of sponsorRows) rowsBySponsor.set(row.sponsor_id, [...(rowsBySponsor.get(row.sponsor_id) ?? []), row]);

  const pageFor = (sponsorId: string): SponsorPage => {
    const rows = rowsBySponsor.get(sponsorId) ?? [];
    let logoViews = 0;
    let viewerDays = 0;
    let clicks = 0;
    const logoViewsByDate = new Map<string, number>();
    for (const row of rows) {
      logoViews += count(row.logo_views);
      viewerDays += count(row.logo_viewers);
      clicks += count(row.clicks);
      logoViewsByDate.set(row.local_date, (logoViewsByDate.get(row.local_date) ?? 0) + count(row.logo_views));
    }
    const known = listing.get(sponsorId);
    return {
      sponsorId,
      name: known ? known.name : REMOVED_SPONSOR_NAME,
      logoUrl: known ? known.logo_url ?? null : null,
      removed: !known,
      totals: { logoViews, viewerDays, clicks, clickRate: logoViews > 0 ? clicks / logoViews : null },
      busiestDays: busiestDates.map(([date, siteViews]) => ({
        date,
        siteViews,
        logoViews: logoViewsByDate.get(date) ?? 0,
        matches: matchesByDate.get(date) ?? [],
      })),
    };
  };

  let pages: SponsorPage[];
  if (sponsor === "all") {
    pages = [...rowsBySponsor.keys()]
      .map(pageFor)
      .filter((page) => page.totals.logoViews + page.totals.clicks > 0)
      .sort(
        (a, b) =>
          b.totals.logoViews - a.totals.logoViews ||
          a.name.localeCompare(b.name, "en") ||
          (a.sponsorId < b.sponsorId ? -1 : a.sponsorId > b.sponsorId ? 1 : 0),
      );
  } else {
    pages = [pageFor(sponsor)];
  }

  const soFar = month === currentClubMonth(timeZone, now);
  return {
    month,
    monthLabel: formatClubDate(`${month}-01`, "month-year") ?? month,
    soFar,
    throughDate: soFar ? clubToday(timeZone, now) : null,
    site: {
      views,
      visitorDays,
      visits,
      // Time on page is measured by heartbeats; a month with none was not measured, which is not zero seconds.
      avgTimeOnPageMs: views > 0 && engagedMs > 0 ? Math.round(engagedMs / views) : null,
      dropped,
    },
    pages,
  };
}

// The reader. The client is the signed-in person's own, never the service role.
type ReaderClient = SupabaseClient<any, any, any>;

export type ReportRows = { totals: TotalsRow[]; sponsorRows: SponsorRow[]; sponsors: SponsorListing[]; matches: MatchRow[] };

// The month list reads each table newest-first and bounded, so a club's whole history is never pulled
// just to fill a month picker.
const MONTH_LIST_LIMIT = 1000;

/** The months that have any rolled-up data for the club, newest first. */
export async function readReportMonths(
  supabase: ReaderClient,
  clubId: string,
): Promise<{ status: "ready"; months: string[] } | { status: "error" }> {
  try {
    const onzio = supabase.schema("onzio");
    const [totals, rollups] = await Promise.all([
      onzio.from("page_daily_totals").select("local_date").eq("club_id", clubId).order("local_date", { ascending: false }).limit(MONTH_LIST_LIMIT),
      onzio.from("sponsor_daily_rollups").select("local_date").eq("club_id", clubId).order("local_date", { ascending: false }).limit(MONTH_LIST_LIMIT),
    ]);
    if (totals.error || rollups.error) return { status: "error" };
    const dates = [...(totals.data ?? []), ...(rollups.data ?? [])].map((row: { local_date: string }) => row.local_date);
    return { status: "ready", months: availableMonths(dates) };
  } catch {
    return { status: "error" };
  }
}

/** Everything one month's report is built from: the daily rows, the sponsor list and that month's games. */
export async function readMonthlyReportRows(
  supabase: ReaderClient,
  clubId: string,
  month: string,
): Promise<({ status: "ready" } & ReportRows) | { status: "error" }> {
  try {
    const { start, next } = monthRange(month);
    const onzio = supabase.schema("onzio");
    const [totals, sponsorRows, sponsors, matches] = await Promise.all([
      onzio
        .from("page_daily_totals")
        .select("local_date,views,visitors,visits,engaged_ms,engaged_views,dropped")
        .eq("club_id", clubId)
        .gte("local_date", start)
        .lt("local_date", next)
        .order("local_date", { ascending: true }),
      onzio
        .from("sponsor_daily_rollups")
        .select("local_date,sponsor_id,logo_views,logo_viewers,clicks")
        .eq("club_id", clubId)
        .gte("local_date", start)
        .lt("local_date", next)
        .order("local_date", { ascending: true }),
      onzio.from("site_sponsor_logos").select("id,name,logo_url").eq("club_id", clubId),
      onzio
        .from("matches")
        .select("date,opponent,home")
        .eq("club_id", clubId)
        .gte("date", start)
        .lt("date", next)
        .order("date", { ascending: true })
        .order("time", { ascending: true }),
    ]);
    if (totals.error || sponsorRows.error || sponsors.error || matches.error) return { status: "error" };
    return {
      status: "ready",
      totals: (totals.data ?? []) as TotalsRow[],
      sponsorRows: (sponsorRows.data ?? []) as SponsorRow[],
      sponsors: (sponsors.data ?? []) as SponsorListing[],
      matches: (matches.data ?? []) as MatchRow[],
    };
  } catch {
    return { status: "error" };
  }
}

/** The club's logo address for the report's header, or "" when it has none or the read fails. */
export async function readReportClubLogo(supabase: ReaderClient, clubId: string): Promise<string> {
  try {
    const { data, error } = await supabase.schema("onzio").from("site_branding").select("club_logo_path").eq("club_id", clubId).maybeSingle();
    if (error) return "";
    const path = typeof data?.club_logo_path === "string" ? data.club_logo_path.trim() : "";
    return path ? clubLogoUrl(path) : "";
  } catch {
    return "";
  }
}
