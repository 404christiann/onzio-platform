import {
  ClassicInsightsEmpty,
  ClassicInsightsError,
  ClassicSponsorInsights,
} from "@/components/admin/insights/classic/ClassicSponsorInsights";
import { monthDays, sponsorSummary } from "@/components/admin/insights/classic/sponsor-lines";
import { loadSponsorInsightsPage } from "@/lib/admin-tab-page";
import { publicSiteState } from "@/lib/club-access";
import { loadInsightsData } from "@/lib/telemetry/insights-data";
import { parseInsightsRange } from "@/lib/telemetry/insights-math";
import { formatClubDate } from "@/lib/club-time";
import {
  buildMonthlyReport,
  chooseReportMonth,
  currentClubMonth,
  parseReportMonth,
  readMonthlyReportRows,
  readReportMonths,
} from "@/lib/telemetry/report-data";

// TELEMETRY-04/06: Sponsor Insights, for a club with the Sponsor Insights
// add-on (admin_flags.sponsor_insights; decisions 2 and 4 of 2026-11-09). While
// the club's website is held it says so instead of showing zeros, and the
// numbers are not read at all. The page is organized around one month
// (components/admin/insights/classic/), reading the same month report the
// printable report reads, plus the visitor breakdown below it. Reads go through
// the signed-in person's own client, never the service role.

export const dynamic = "force-dynamic";

export default async function InsightsTabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, club, portal } = await loadSponsorInsightsPage();
  const held = publicSiteState(club.publicAccess) === "prelaunch";
  const query = await searchParams;

  if (held) return <ClassicInsightsEmpty held />;
  const available = await readReportMonths(supabase, club.id);
  if (available.status === "error") return <ClassicInsightsError />;
  if (available.months.length === 0) return <ClassicInsightsEmpty held={false} />;
  const currentMonth = currentClubMonth(portal.timeZone);
  const month =
    chooseReportMonth(parseReportMonth(query.month), available.months, currentMonth) ?? available.months[0];
  const range = parseInsightsRange(query.range);
  const [rows, visitors] = await Promise.all([
    readMonthlyReportRows(supabase, club.id, month),
    loadInsightsData(supabase, { clubId: club.id, timeZone: portal.timeZone, range }),
  ]);
  if (rows.status === "error") return <ClassicInsightsError />;
  const report = buildMonthlyReport({ month, sponsor: "all", timeZone: portal.timeZone, ...rows });
  const matchDates = new Set(rows.matches.map((match) => String(match.date).slice(0, 10)));
  const counted = rows.totals
    .map((row) => String(row.local_date).slice(0, 10))
    .filter((date) => date.startsWith(month));
  return (
    <ClassicSponsorInsights
      report={report}
      summary={sponsorSummary(report, rows.sponsors)}
      days={monthDays(report, rows.totals, matchDates)}
      latestDay={counted.length ? counted.sort().at(-1)! : null}
      months={available.months.map((value) => ({
        value,
        label: formatClubDate(`${value}-01`, "month-year") ?? value,
      }))}
      currentMonth={currentMonth}
      range={range}
      visitors={visitors}
      host={club.primaryDomain}
    />
  );
}
