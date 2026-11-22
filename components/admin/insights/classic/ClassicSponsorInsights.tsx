import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatClubDate } from "@/lib/club-time";
import type { InsightsResult } from "@/lib/telemetry/insights-data";
import type { InsightsRange } from "@/lib/telemetry/insights-math";
import { reportHref, type MonthlyReport } from "@/lib/telemetry/report-data";
import { SiteTraffic } from "./SiteTraffic";
import { SponsorSectionPrototype, type PrototypeVariant } from "./SponsorSectionPrototype";
import { TrackedLinkBuilder } from "./TrackedLinkBuilder";
import { VisitorBreakdown } from "./VisitorBreakdown";
import { sponsorHeadline, spokenMonth, type DayBar, type SponsorSummary } from "./sponsor-lines";

// UI-POLISH-INSIGHTS: the Insights tab on the classic admin. It answers one
// question, "what did my sponsors get this month?": the answer as the page's
// heading, the per-sponsor table, then the month's site traffic, where visitors
// came from, and the tracked link builder. The printable report is the one
// primary action.

const BASE_PATH = "/admin/insights";

export type MonthOption = { value: string; label: string };

function MonthForm({ months, month, range, latestDay }: { months: MonthOption[]; month: string; range: InsightsRange; latestDay: string | null }) {
  return (
    <form method="get" action={BASE_PATH} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="range" value={range} />
      <label htmlFor="insights-month" className="sr-only">
        Month
      </label>
      <div className="flex items-center gap-2">
        <NativeSelect id="insights-month" name="month" defaultValue={month} className="min-h-11 min-w-[12rem] text-[15px]">
          {months.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <button type="submit" className={`${buttonVariants({ variant: "outline" })} min-h-11 px-4 text-[15px]`}>
          Show
        </button>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Updated daily
        {latestDay ? `, latest day counted: ${formatClubDate(latestDay, "short") ?? latestDay}` : ""}
      </p>
    </form>
  );
}

export function ClassicSponsorInsights({
  report,
  summary,
  days,
  latestDay,
  months,
  currentMonth,
  range,
  visitors,
  host,
  variant,
}: {
  report: MonthlyReport;
  summary: SponsorSummary;
  days: DayBar[];
  latestDay: string | null;
  months: MonthOption[];
  currentMonth: string;
  range: InsightsRange;
  visitors: InsightsResult;
  host: string;
  variant: PrototypeVariant;
}) {
  const month = spokenMonth(report, currentMonth);
  const count = summary.lines.length;
  return (
    <AdminPage className="max-w-4xl gap-8" data-admin-insights-page="classic">
      <AdminPageHeader
        breadcrumb="Sponsor insights"
        title={sponsorHeadline(summary, report, currentMonth)}
        description={
          count === 0
            ? "Add your sponsors on the Sponsors page to count how often their logos are seen."
            : `${count} ${count === 1 ? "sponsor" : "sponsors"} on your website. A logo view is one time a visitor had the logo on screen.`
        }
        actions={
          <Link href={reportHref(report.month)} className={`${buttonVariants()} min-h-11 px-4 text-[15px]`}>
            Printable report
          </Link>
        }
      />

      <MonthForm months={months} month={report.month} range={range} latestDay={latestDay} />

      <section aria-labelledby="insights-sponsors-heading" className="flex flex-col gap-2">
        <h2 id="insights-sponsors-heading" className="sr-only">
          Sponsors in {month}
        </h2>
        {count === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-[15px] shadow-sm sm:p-6">
            No sponsors are listed yet.{" "}
            <Link href="/admin/sponsors" className="font-medium text-primary underline-offset-4 hover:underline">
              Add sponsors
            </Link>
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <SponsorSectionPrototype
              variant={variant}
              summary={summary}
              caption={`Sponsor logo views, clicks and click rate, ${report.monthLabel}`}
            />
          </div>
        )}
      </section>

      <SiteTraffic site={report.site} days={days} month={month} />

      {visitors.status === "ready" ? <VisitorBreakdown data={visitors} basePath={BASE_PATH} month={report.month} /> : null}

      {visitors.status === "ready" ? <TrackedLinkBuilder host={host} paths={visitors.sitePaths} /> : null}
    </AdminPage>
  );
}

/** The tab before there is anything to show. Rose City sees the held version until it relaunches. */
export function ClassicInsightsEmpty({ held }: { held: boolean }) {
  return (
    <AdminPage className="max-w-4xl gap-8" data-admin-insights-page="classic">
      <AdminPageHeader
        breadcrumb="Sponsor insights"
        title="No visits yet"
        description={
          held
            ? "Your website is offline until it relaunches. Numbers show up here the day after it goes live, and the first monthly report is ready at the end of that month."
            : "Numbers show up the day after the first visit is counted. Page views and sponsor logo views are added up once a day."
        }
      />
      <div className="text-[15px] text-muted-foreground" data-testid="insights-waiting" data-held={held || undefined}>
        <p>Once there are visits, this page shows for each month:</p>
        <ul className="mt-2 list-disc pl-5">
          <li>how many times each sponsor&rsquo;s logo was seen and clicked</li>
          <li>page views and visitor-days on your website</li>
          <li>a printable report to send each sponsor</li>
        </ul>
      </div>
    </AdminPage>
  );
}

/** A read failed. Plain, with a way forward. */
export function ClassicInsightsError() {
  return (
    <AdminPage className="max-w-4xl gap-8" data-admin-insights-page="classic">
      <AdminPageHeader breadcrumb="Sponsor insights" title="Sponsor insights" />
      <p role="alert" className="text-[15px] text-destructive">
        Your numbers could not be loaded. Refresh the page to try again.
      </p>
    </AdminPage>
  );
}
