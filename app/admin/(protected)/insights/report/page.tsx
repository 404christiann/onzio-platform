import type { Metadata } from "next";
import { ReportMessage, SponsorReport, type ReportOption } from "@/components/admin/insights-report/SponsorReport";
import { sponsorSummary } from "@/components/admin/insights/classic/sponsor-lines";
import { loadSponsorInsightsPage } from "@/lib/admin-tab-page";
import { formatClubDate } from "@/lib/club-time";
import {
  buildMonthlyReport,
  chooseReportMonth,
  currentClubMonth,
  parseReportMonth,
  parseReportSponsor,
  readMonthlyReportRows,
  readReportClubLogo,
  readReportMonths,
  type MonthlyReport,
  type SponsorListing,
} from "@/lib/telemetry/report-data";

// TELEMETRY-05: the monthly sponsor report, one printed page per sponsor
// (?month=YYYY-MM&sponsor=<sponsor id>|all). Same access as the Insights tab:
// loadSponsorInsightsPage() checks a fresh session, owner or admin and the
// Sponsor Insights add-on. Every read goes through the
// signed-in person's own client and lib/telemetry/report-data.ts, which reads the
// daily rollups, the sponsor list, the schedule and the club logo, never raw page
// events. "Download PDF" is the browser's print dialog; see report.module.css.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Monthly sponsor report" };

function monthOptions(months: readonly string[], currentMonth: string): ReportOption[] {
  return months.map((month) => {
    const label = formatClubDate(`${month}-01`, "month-year") ?? month;
    return { value: month, label: month === currentMonth ? `${label} (so far)` : label };
  });
}

/**
 * "All sponsors", the club's listed sponsors, then any sponsor with a page this
 * month who is no longer listed (their page says "Removed sponsor").
 */
function sponsorOptions(listed: readonly SponsorListing[], pages: readonly MonthlyReport["pages"][number][]): ReportOption[] {
  const named = [...listed]
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((sponsor) => ({ value: sponsor.id.toLowerCase(), label: sponsor.name }));
  const listedIds = new Set(named.map((option) => option.value));
  const removedIds = [...new Set(pages.filter((page) => page.removed && !listedIds.has(page.sponsorId)).map((page) => page.sponsorId))];
  const removed = removedIds.map((value, index) => ({
    value,
    label: removedIds.length > 1 ? `Removed sponsor ${index + 1}` : "Removed sponsor",
  }));
  return [{ value: "all", label: "All sponsors" }, ...named, ...removed];
}

export default async function MonthlySponsorReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { supabase, club, portal } = await loadSponsorInsightsPage();
  const timeZone = portal.timeZone;

  const available = await readReportMonths(supabase, club.id);
  if (available.status === "error") {
    return (
      <ReportMessage tone="error">We couldn’t load the numbers. Try again in a minute.</ReportMessage>
    );
  }

  const currentMonth = currentClubMonth(timeZone);
  const month = chooseReportMonth(parseReportMonth(query.month), available.months, currentMonth);
  if (month === null) {
    return (
      <ReportMessage tone="empty">No visits yet. The first report is ready the day after your website&rsquo;s first counted visit.</ReportMessage>
    );
  }

  const sponsor = parseReportSponsor(query.sponsor);
  const [rows, clubLogoUrl] = await Promise.all([
    readMonthlyReportRows(supabase, club.id, month),
    readReportClubLogo(supabase, club.id),
  ]);
  if (rows.status === "error") {
    return (
      <ReportMessage tone="error">We couldn’t load the numbers. Try again in a minute.</ReportMessage>
    );
  }

  const build = (forSponsor: string) =>
    buildMonthlyReport({
      month,
      sponsor: forSponsor,
      timeZone,
      totals: rows.totals,
      sponsorRows: rows.sponsorRows,
      sponsors: rows.sponsors,
      matches: rows.matches,
    });
  const report = build(sponsor);
  // The picker lists every sponsor with activity this month, even when one sponsor's page is showing.
  const overview = sponsor === "all" ? report : build("all");

  return (
    <SponsorReport
      report={report}
      summary={sponsorSummary(overview, rows.sponsors)}
      clubName={club.name}
      clubLogoUrl={clubLogoUrl}
      months={monthOptions(available.months, currentMonth)}
      month={month}
      sponsors={sponsorOptions(rows.sponsors, [...overview.pages, ...report.pages])}
      sponsor={sponsor}
    />
  );
}
