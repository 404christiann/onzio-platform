import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { SponsorTable } from "@/components/admin/insights/classic/SponsorTable";
import { formatCount, formatRate, formatSeconds } from "@/components/admin/insights/classic/format";
import type { SponsorSummary } from "@/components/admin/insights/classic/sponsor-lines";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatClubDate } from "@/lib/club-time";
import type { BusyDay, MonthlyReport, SponsorPage } from "@/lib/telemetry/report-data";
import { PrintButton } from "./PrintButton";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import styles from "./report.module.css";

// TELEMETRY-05 + UI-POLISH-INSIGHTS: the monthly sponsor report, made to print.
// "All sponsors" prints a summary page (the same per-sponsor table as the
// Insights tab, for the club's own use) and then one page per sponsor; picking
// one sponsor prints only that sponsor's page, the one to send them. On screen
// the pages sit under the classic page header and pickers; when printing,
// report.module.css hides everything but the pages, black on white. The numbers
// come from lib/telemetry/report-data.ts; this file only lays them out.

export type ReportOption = Readonly<{ value: string; label: string }>;

export const REPORT_FOOTER = "Counted by the club's own website, without cookies. Each visitor is counted once per day.";
const REPORT_PATH = "/admin/insights/report";
const INSIGHTS_PATH = "/admin/insights";

function Header({ actions }: { actions?: ReactNode }) {
  return (
    <AdminPageHeader
      breadcrumb={
        <Link
          href={INSIGHTS_PATH}
          className="-my-3 inline-flex min-h-11 items-center text-primary underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
        >
          Sponsor insights
        </Link>
      }
      title="Monthly report"
      description="Pick one sponsor to get the page you send them. All sponsors adds a summary page for you."
      actions={actions}
    />
  );
}

/** The numbers could not load, or there are none yet. Screen only. */
export function ReportMessage({ tone, children }: { tone: "error" | "empty"; children: ReactNode }) {
  return (
    <AdminPage className={`${styles.page} max-w-4xl gap-8 [-webkit-tap-highlight-color:transparent]`}>
      <div data-report-controls>
        <Header />
      </div>
      <p
        className={`text-base ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        role={tone === "error" ? "alert" : "status"}
        data-report-message={tone}
      >
        {children}
      </p>
    </AdminPage>
  );
}

function Masthead({ clubName, clubLogoUrl, title }: { clubName: string; clubLogoUrl: string; title: string }) {
  return (
    <header className={styles.masthead}>
      <span className={styles.club}>
        {clubLogoUrl ? <ResilientNativeImage className={styles.clubLogo} src={clubLogoUrl} alt="" hideOnError /> : null}
        {clubName}
      </span>
      <span>{title}</span>
    </header>
  );
}

function Figure({ id, label, value, note }: { id: string; label: string; value: string; note?: string }) {
  return (
    <div className={styles.figure} data-stat={id}>
      <dt>{label}</dt>
      <dd className={styles.figureValue}>{value}</dd>
      {note ? <dd className={styles.figureNote}>{note}</dd> : null}
    </div>
  );
}

function SiteLine({ report }: { report: MonthlyReport }) {
  const { site } = report;
  const time = formatSeconds(site.avgTimeOnPageMs);
  const timeNote =
    time !== null && site.timeMeasuredDays < site.trafficDays
      ? `measured on ${site.timeMeasuredDays} of ${site.trafficDays} days`
      : undefined;
  return (
    <section className={styles.block} aria-label="The whole website">
      <h3 className={styles.blockTitle}>The whole website</h3>
      <dl className={styles.figures}>
        <Figure id="views" label="Page views" value={`${formatCount(site.views)}${site.dropped > 0 ? "*" : ""}`} />
        <Figure id="visitor-days" label="Visitor-days" value={formatCount(site.visitorDays)} />
        <Figure id="avg-time" label="Avg. time on a page" value={time ?? "—"} note={timeNote} />
      </dl>
      {site.dropped > 0 ? (
        <p className={styles.note} data-report-dropped>
          * Leaves out {formatCount(site.dropped)} page {site.dropped === 1 ? "view" : "views"} our limits flagged as
          likely automated.
        </p>
      ) : null}
    </section>
  );
}

function BusyDays({ days, monthLabel }: { days: readonly BusyDay[]; monthLabel: string }) {
  if (days.length === 0) return <p className={styles.note}>No visits counted yet this month.</p>;
  return (
    <table className={styles.table}>
      <caption className="sr-only">Busiest days in {monthLabel}</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Page views</th>
          <th scope="col">Logo views</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date} data-busy-day={day.date}>
            <th scope="row">
              {formatClubDate(day.date, "weekday-short") ?? day.date}
              {day.matches.length > 0 ? (
                <span className={styles.match}> · match day, {day.matches.join(", ")}</span>
              ) : null}
            </th>
            <td>{formatCount(day.siteViews)}</td>
            <td>{formatCount(day.logoViews)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function period(report: MonthlyReport): string {
  const through =
    report.soFar && report.throughDate ? (formatClubDate(report.throughDate, "short") ?? report.throughDate) : null;
  return through ? `${report.monthLabel}, through ${through}` : report.monthLabel;
}

function SponsorSheet({
  page,
  report,
  clubName,
  clubLogoUrl,
}: {
  page: SponsorPage;
  report: MonthlyReport;
  clubName: string;
  clubLogoUrl: string;
}) {
  const { totals } = page;
  const seen =
    totals.logoViews === 0
      ? `Your logo was not seen on the ${clubName} website in ${report.monthLabel}.`
      : `Your logo was seen ${formatCount(totals.logoViews)} ${totals.logoViews === 1 ? "time" : "times"} on the ${clubName} website and clicked ${formatCount(totals.clicks)} ${totals.clicks === 1 ? "time" : "times"}.`;
  return (
    <section className={styles.sheet} data-report-page aria-label={`${page.name}, ${report.monthLabel}`}>
      <Masthead clubName={clubName} clubLogoUrl={clubLogoUrl} title={`Sponsor report · ${period(report)}`} />
      <div className={styles.lede}>
        {page.logoUrl ? (
          <ResilientNativeImage className={styles.sponsorLogo} src={page.logoUrl} alt={`${page.name} logo`} hideOnError />
        ) : null}
        <div>
          <h2 className={styles.title}>{page.name}</h2>
          <p className={styles.text}>{seen}</p>
        </div>
      </div>
      <dl className={`${styles.figures} ${styles.figuresFour}`}>
        <Figure id="logo-views" label="Logo views" value={formatCount(totals.logoViews)} />
        <Figure id="people-seen" label="People who saw it" value={formatCount(totals.viewerDays)} note="visitor-days" />
        <Figure id="clicks" label="Clicks" value={formatCount(totals.clicks)} />
        <Figure id="click-rate" label="Click rate" value={formatRate(totals.clickRate)} />
      </dl>
      <section className={styles.block} aria-label="Busiest days">
        <h3 className={styles.blockTitle}>Busiest days</h3>
        <BusyDays days={page.busiestDays} monthLabel={report.monthLabel} />
      </section>
      <SiteLine report={report} />
      <footer className={styles.footer}>{REPORT_FOOTER}</footer>
    </section>
  );
}

function SummarySheet({
  summary,
  report,
  clubName,
  clubLogoUrl,
}: {
  summary: SponsorSummary;
  report: MonthlyReport;
  clubName: string;
  clubLogoUrl: string;
}) {
  return (
    <section
      className={`${styles.sheet} ${styles.summary}`}
      data-report-page
      data-report-summary
      aria-label={`Sponsor summary, ${report.monthLabel}`}
    >
      <Masthead clubName={clubName} clubLogoUrl={clubLogoUrl} title={`Sponsor summary · ${period(report)}`} />
      <div>
        <h2 className={styles.title}>
          {formatCount(summary.logoViews)} logo {summary.logoViews === 1 ? "view" : "views"},{" "}
          {formatCount(summary.clicks)} {summary.clicks === 1 ? "click" : "clicks"}
        </h2>
        <p className={styles.text}>For your own records. Send each sponsor their own page.</p>
      </div>
      <div className={styles.summaryTable}>
        <SponsorTable
          summary={summary}
          caption={`Sponsor logo views, clicks and click rate, ${report.monthLabel}`}
          variant="print"
        />
      </div>
      <SiteLine report={report} />
      <footer className={styles.footer}>{REPORT_FOOTER}</footer>
    </section>
  );
}

export function SponsorReport({
  report,
  summary,
  clubName,
  clubLogoUrl,
  months,
  month,
  sponsors,
  sponsor,
}: {
  report: MonthlyReport;
  /** Every sponsor for the month; printed as the summary page when sponsor is "all". */
  summary: SponsorSummary;
  clubName: string;
  /** The club's logo address, or "" for none. */
  clubLogoUrl: string;
  /** Only months that have rollup rows. */
  months: readonly ReportOption[];
  month: string;
  /** "All sponsors" first, then the sponsors a page can be shown for. */
  sponsors: readonly ReportOption[];
  /** "all" or a sponsor id. */
  sponsor: string;
}) {
  const showSummary = sponsor === "all" && summary.lines.length > 0;
  const hasPages = showSummary || report.pages.length > 0;
  return (
    <AdminPage className={`${styles.page} max-w-4xl gap-8 [-webkit-tap-highlight-color:transparent]`}>
      <div className="flex flex-col gap-6" data-report-controls>
        <Header actions={hasPages ? <PrintButton /> : null} />
        <form method="get" action={REPORT_PATH} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-2 text-[13px] font-medium">
            Month
            <NativeSelect name="month" defaultValue={month} className="min-h-11 text-base font-normal">
              {months.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-medium">
            Sponsor
            <NativeSelect name="sponsor" defaultValue={sponsor} className="min-h-11 text-base font-normal">
              {sponsors.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <button type="submit" className={`${buttonVariants({ variant: "outline" })} min-h-11 px-4 text-base`}>
            Show
          </button>
        </form>
      </div>

      <div className={styles.report} data-sponsor-report>
        {!hasPages ? (
          <p className="text-base text-muted-foreground" data-report-empty>
            {summary.lines.length === 0
              ? "No sponsors are listed yet. Add them on the Sponsors page and they show up here."
              : `No sponsor logos were seen in ${report.monthLabel}.`}
          </p>
        ) : (
          <div className={styles.sheets}>
            {showSummary ? (
              <SummarySheet summary={summary} report={report} clubName={clubName} clubLogoUrl={clubLogoUrl} />
            ) : null}
            {report.pages.map((page) => (
              <SponsorSheet
                key={page.sponsorId}
                page={page}
                report={report}
                clubName={clubName}
                clubLogoUrl={clubLogoUrl}
              />
            ))}
          </div>
        )}
      </div>
    </AdminPage>
  );
}
