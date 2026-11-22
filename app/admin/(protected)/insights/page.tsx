import {
  ClassicInsightsEmpty,
  ClassicInsightsError,
  ClassicSponsorInsights,
} from "@/components/admin/insights/classic/ClassicSponsorInsights";
import { monthDays, sponsorSummary } from "@/components/admin/insights/classic/sponsor-lines";
import { CampaignLinkBuilder } from "@/components/admin/reimagined/CampaignLinkBuilder";
import { InsightsDashboard } from "@/components/admin/reimagined/InsightsDashboard";
import { InsightsWaiting } from "@/components/admin/reimagined/InsightsWaiting";
import { TabPage } from "@/components/admin/reimagined/TabPage";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import { getAdminTab } from "@/lib/admin-tabs";
import { PUBLIC_SITE_HOLD_SLUGS } from "@/lib/public-site-hold";
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
import frame from "@/components/admin/reimagined/frame.module.css";
import styles from "@/components/admin/reimagined/insights.module.css";

// ADMIN-RE-24 + TELEMETRY-04: the Insights tab, for a club with the Sponsor
// Insights add-on (admin_flags.sponsor_insights; decisions 2 and 4 of
// 2026-11-09). While the club's website is held it says so instead of showing
// zeros, and the numbers are not read at all. Otherwise the dashboard shows the
// club's page rollups (user-scoped read, never the service role), or the same
// "no numbers yet" list until the first rollup exists. The campaign link
// builder sits under the numbers; the monthly sponsor report fills its slot in
// TELEMETRY-05. TELEMETRY-06: a classic club with the add-on opens the same
// page under the classic shell, with the classic page header in place of the
// reimagined tab heading. UI-POLISH-INSIGHTS: the classic page is organized
// around one month (components/admin/insights/classic/), reading the same month
// report the printable report reads, plus the visitor breakdown below it.

export const dynamic = "force-dynamic";

export default async function InsightsTabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, club, portal } = await loadAdminTabPage("insights");
  const held = PUBLIC_SITE_HOLD_SLUGS.has(club.slug);
  const query = await searchParams;

  if (portal.portal !== "reimagined") {
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

  const result = held
    ? null
    : await loadInsightsData(supabase, {
        clubId: club.id,
        timeZone: portal.timeZone,
        range: parseInsightsRange(query.range),
      });

  const title = getAdminTab("insights").title;
  const subtitle = "Who visits your website, and which sponsors they see.";
  const body =
    result === null ? (
      <InsightsWaiting held />
    ) : result.status === "no-rollups" ? (
      <InsightsWaiting held={false} />
    ) : result.status === "error" ? (
      <p role="alert" className={`${frame.card} ${frame.empty} ${frame.wide}`}>
        Your numbers could not be loaded. Refresh the page to try again.
      </p>
    ) : (
      <div className={`${frame.wide} ${styles.dashboard}`}>
        <InsightsDashboard data={result} timeZone={portal.timeZone} />
        <CampaignLinkBuilder host={club.primaryDomain} paths={result.sitePaths} />
        <section
          aria-labelledby="insights-monthly-report-heading"
          className={frame.wide}
          data-testid="insights-monthly-report-slot"
        >
          {/* TELEMETRY-05: the monthly sponsor report fills this slot. */}
          <div className={`${frame.card} ${styles.slot}`}>
            <b id="insights-monthly-report-heading">Monthly sponsor report</b>
            <small>Coming soon: a one-page report per sponsor to send each month.</small>
          </div>
        </section>
      </div>
    );

  return (
    <TabPage tab="insights" title={title} subtitle={subtitle}>
      {body}
    </TabPage>
  );
}
