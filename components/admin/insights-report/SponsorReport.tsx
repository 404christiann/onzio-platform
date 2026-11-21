import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "@/components/admin/icons";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { formatClubDate } from "@/lib/club-time";
import type { BusyDay, MonthlyReport, SponsorPage } from "@/lib/telemetry/report-data";
import { PrintButton } from "./PrintButton";
import styles from "./report.module.css";

// TELEMETRY-05: the monthly sponsor report, one printed page per sponsor. Server
// rendered. On screen the sheets are paper cards under the month and sponsor
// pickers; "Download PDF" opens the browser's print dialog and report.module.css
// hides the admin frame and puts each sheet on its own page. The numbers come
// from lib/telemetry/report-data.ts; this file only lays them out.

export type ReportOption = Readonly<{ value: string; label: string }>;

export const REPORT_FOOTER = "Measured first-party site traffic. No cookies; visitors counted per day.";
const REPORT_PATH = "/admin/insights/report";
const INSIGHTS_PATH = "/admin/insights";
const NEUTRAL_ACCENT = "#334155";
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** clickRate is a share (clicks over logo views): 0.032 reads "3.2%". */
function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/** "1m 05s" from a minute up, "42s" below it, a dash when time on page was not measured. */
function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function accentFor(color: string | null): string {
  return color && HEX_COLOR.test(color.trim()) ? color.trim() : NEUTRAL_ACCENT;
}

function Intro() {
  return (
    <div>
      <h1 className={styles.title}>Monthly sponsor report</h1>
      <p className={styles.sub}>One page for each sponsor. Choose a month, then save it as a PDF to send.</p>
    </div>
  );
}

function BackToInsights() {
  return (
    <Link href={INSIGHTS_PATH} className={styles.back}>
      <ChevronLeft aria-hidden="true" />
      Back to Insights
    </Link>
  );
}

/** A calm screen-only message in the page's frame: the numbers could not load, or there are none yet. */
export function ReportMessage({ tone, children }: { tone: "error" | "empty"; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.controls} data-report-controls>
        <Intro />
        <div className={styles.actions}>
          <BackToInsights />
        </div>
      </div>
      <p className={styles.message} role={tone === "error" ? "alert" : "status"} data-report-message={tone}>
        {children}
      </p>
    </div>
  );
}

function Stat({ id, label, value, note, star }: { id: string; label: string; value: string; note?: string; star?: boolean }) {
  return (
    <div className={styles.stat} data-stat={id}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>
        {value}
        {star ? (
          <span className={styles.star} aria-hidden="true">
            *
          </span>
        ) : null}
      </dd>
      {note ? <dd className={styles.statNote}>{note}</dd> : null}
    </div>
  );
}

function BusyDays({ days, monthLabel }: { days: readonly BusyDay[]; monthLabel: string }) {
  if (days.length === 0) return <p className={styles.quiet}>No visits recorded yet this month.</p>;
  return (
    <table className={styles.days}>
      <caption className={styles.srOnly}>Busiest days in {monthLabel}</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col" className={styles.num}>
            Page views
          </th>
          <th scope="col" className={styles.num}>
            Logo views
          </th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date} data-busy-day={day.date}>
            <th scope="row">
              <span className={styles.dayName}>{formatClubDate(day.date, "weekday-short") ?? day.date}</span>
              {day.matches.length > 0 ? (
                <span className={styles.matchLine}>
                  <span className={styles.tag}>Match day</span>
                  {day.matches.map((label) => (
                    <span key={label} className={styles.opponent}>
                      {label}
                    </span>
                  ))}
                </span>
              ) : null}
            </th>
            <td className={styles.num}>{formatCount(day.siteViews)}</td>
            <td className={styles.num}>{formatCount(day.logoViews)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sheet({
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
  const { site } = report;
  const timeNote =
    site.avgTimeOnPageMs !== null && site.timeMeasuredDays < site.trafficDays
      ? `measured on ${site.timeMeasuredDays} of ${site.trafficDays} days`
      : undefined;
  const through = report.soFar && report.throughDate ? (formatClubDate(report.throughDate, "short") ?? report.throughDate) : null;
  return (
    <section className={styles.sheet} data-report-page aria-label={`${page.name} report`}>
      <header className={styles.sheetHead}>
        <div className={styles.topline}>
          <div className={styles.club}>
            {clubLogoUrl ? <ResilientNativeImage className={styles.clubLogo} src={clubLogoUrl} alt={clubName} hideOnError /> : null}
            <span className={styles.clubName}>{clubName}</span>
          </div>
          <span className={styles.eyebrow}>Monthly sponsor report</span>
        </div>
        <div className={styles.sponsorRow}>
          {page.logoUrl ? (
            <span className={styles.sponsorLogoTile}>
              <ResilientNativeImage className={styles.sponsorLogo} src={page.logoUrl} alt={`${page.name} logo`} hideOnError />
            </span>
          ) : null}
          <div className={styles.sponsorText}>
            <h2 className={styles.sponsorName}>{page.name}</h2>
            <p className={styles.period}>
              {report.monthLabel}
              {through ? <span className={styles.soFar}> · so far (through {through})</span> : null}
            </p>
          </div>
        </div>
      </header>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Site traffic</h3>
        <dl className={styles.stats}>
          <Stat id="views" label="Page views" value={formatCount(site.views)} star={site.dropped > 0} />
          <Stat id="visitor-days" label="Visitor-days" value={formatCount(site.visitorDays)} />
          <Stat id="visits" label="Visits" value={formatCount(site.visits)} />
          <Stat id="avg-time" label="Avg. time on page" note={timeNote} value={formatDuration(site.avgTimeOnPageMs)} />
        </dl>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>{page.name} on your site</h3>
        <dl className={styles.stats}>
          <Stat id="logo-views" label="Logo views" value={formatCount(page.totals.logoViews)} />
          <Stat id="people-seen" label="People who saw it" note="visitor-days" value={formatCount(page.totals.viewerDays)} />
          <Stat id="clicks" label="Clicks" value={formatCount(page.totals.clicks)} />
          <Stat id="click-rate" label="Click rate" value={formatRate(page.totals.clickRate)} />
        </dl>
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>Busiest days</h3>
        <BusyDays days={page.busiestDays} monthLabel={report.monthLabel} />
      </div>

      {site.dropped > 0 ? (
        <p className={styles.footnote} data-report-dropped>
          * {formatCount(site.dropped)} page {site.dropped === 1 ? "view was" : "views were"} left out by our abuse limits (likely automated traffic).
        </p>
      ) : null}

      <footer className={styles.sheetFoot}>{REPORT_FOOTER}</footer>
    </section>
  );
}

export function SponsorReport({
  report,
  clubName,
  clubLogoUrl,
  accentColor,
  months,
  month,
  sponsors,
  sponsor,
}: {
  report: MonthlyReport;
  clubName: string;
  /** The club's logo address, or "" for none. */
  clubLogoUrl: string;
  accentColor: string | null;
  /** Only months that have rollup rows. */
  months: readonly ReportOption[];
  month: string;
  /** "All sponsors" first, then the sponsors a page can be shown for. */
  sponsors: readonly ReportOption[];
  /** "all" or a sponsor id. */
  sponsor: string;
}) {
  return (
    <div className={styles.page} style={{ "--report-accent": accentFor(accentColor) } as CSSProperties}>
      <div className={styles.controls} data-report-controls>
        <Intro />
        <form className={styles.form} method="get" action={REPORT_PATH}>
          <label className={styles.field}>
            <span>Month</span>
            <select className={styles.select} name="month" defaultValue={month}>
              {months.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Sponsor</span>
            <select className={styles.select} name="sponsor" defaultValue={sponsor}>
              {sponsors.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${styles.button} ${styles.secondary}`}>
            Show
          </button>
        </form>
        <div className={styles.actions}>
          <PrintButton />
          <BackToInsights />
        </div>
      </div>

      <div className={styles.report} data-sponsor-report>
        {report.pages.length === 0 ? (
          <p className={styles.empty} data-report-empty>
            No sponsor activity in {report.monthLabel}.
          </p>
        ) : (
          <div className={styles.sheets}>
            {report.pages.map((page) => (
              <Sheet key={page.sponsorId} page={page} report={report} clubName={clubName} clubLogoUrl={clubLogoUrl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
