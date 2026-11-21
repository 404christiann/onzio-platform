import Link from "next/link";
import { DailyViewsChart } from "@/components/admin/insights/DailyViewsChart";
import type { InsightsData, InsightsTopRow } from "@/lib/telemetry/insights-data";
import {
  INSIGHTS_RANGES,
  formatCount as count,
  formatDuration,
  formatInsightsDate as dayWords,
  formatRate,
} from "@/lib/telemetry/insights-math";
import frame from "./frame.module.css";
import styles from "./insights.module.css";

// TELEMETRY-04: the Sponsor Insights dashboard. Server rendered; the page reads
// the numbers (lib/telemetry/insights-data.ts, user-scoped) and hands them in.
// CSS only here; the views-per-day chart is the SVG in
// components/admin/insights/DailyViewsChart.tsx. Visitors are counted once per
// day, so every visitor figure here is "visitor-days".

function updatedWords(iso: string, timeZone: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    })
      .format(parsed)
      .replace(/[  ]/g, " ");
  } catch {
    return null;
  }
}

export function InsightsDashboard({ data, timeZone }: { data: InsightsData; timeZone: string }) {
  const updated = data.computedAt ? updatedWords(data.computedAt, timeZone) : null;
  const first = dayWords(data.start);
  const last = dayWords(data.end);
  return (
    <>
      <div className={`${frame.wide} ${styles.toolbar}`}>
        <nav aria-label="Date range" className={styles.range} data-testid="insights-range">
          {INSIGHTS_RANGES.map((range) => (
            <Link
              key={range}
              href={`?range=${range}`}
              className={`${styles.rangeLink} ${frame.press}`}
              aria-current={range === data.range ? "page" : undefined}
              scroll={false}
            >
              {range} days
            </Link>
          ))}
        </nav>
        <p className={styles.meta}>
          <span data-testid="insights-span">
            {first} – {last}
          </span>
          {/* The rollup cron runs once a day (plan: say "updated daily", never "live"). */}
          <span data-testid="insights-updated">
            Updated daily{updated ? ` · last ${updated}` : ""}
          </span>
        </p>
      </div>

      <Totals data={data} />
      <DailyViewsChart data={data} />

      <section aria-labelledby="insights-top-heading" className={`${frame.wide} ${styles.grid}`}>
        <h2 id="insights-top-heading" className={frame.label}>
          Where visits come from
        </h2>
        <TopCard
          id="insights-top-pages"
          testId="insights-top-pages"
          title="Top pages"
          rows={data.top.path}
          empty="No page views in this range"
          showTime
        />
        <TopCard
          id="insights-sources"
          testId="insights-sources"
          title="Sources"
          rows={data.top.source}
          empty="No visits in this range"
        />
        <TopCard
          id="insights-devices"
          testId="insights-devices"
          title="Devices"
          rows={data.top.device}
          empty="No visits in this range"
        />
        <article className={`${frame.card} ${styles.topCard}`} data-testid="insights-places" aria-labelledby="insights-places-title">
          <h3 id="insights-places-title" className={styles.cardTitle}>
            Countries and cities
          </h3>
          <TopList label="Countries" rows={data.top.country} empty="No country data in this range" />
          <TopList label="Cities" rows={data.top.city} empty="No city data in this range" />
        </article>
        <article className={`${frame.card} ${styles.topCard} ${styles.span2}`} data-testid="insights-campaigns" aria-labelledby="insights-campaigns-title">
          <h3 id="insights-campaigns-title" className={styles.cardTitle}>
            Campaigns
          </h3>
          <div className={styles.twoUp}>
            <TopList label="Campaign" rows={data.top.utm_campaign} empty="No campaign visits in this range" />
            <TopList label="Campaign source" rows={data.top.utm_source} empty="No campaign sources in this range" />
          </div>
        </article>
      </section>

      <Sponsors data={data} />

      {data.dropped > 0 ? (
        <p className={`${frame.wide} ${styles.note}`} data-testid="insights-dropped">
          {data.dropped === 1
            ? "1 view wasn't counted because of unusual traffic spikes."
            : `${count(data.dropped)} views weren't counted because of unusual traffic spikes.`}
        </p>
      ) : null}
    </>
  );
}

function Totals({ data }: { data: InsightsData }) {
  const { totals } = data;
  return (
    <section aria-labelledby="insights-totals-heading" className={frame.wide} data-testid="insights-totals">
      <h2 id="insights-totals-heading" className={frame.label}>
        Totals
      </h2>
      <div className={styles.stats}>
        <div className={`${frame.card} ${styles.stat}`} data-testid="insights-total-views">
          <span className={styles.statLabel}>Views</span>
          <b className={styles.statValue}>{count(totals.views)}</b>
          <small className={styles.statNote}>Pages opened on your website</small>
        </div>
        <div className={`${frame.card} ${styles.stat}`} data-testid="insights-total-visitor-days">
          <span className={styles.statLabel}>Visitor-days</span>
          <b className={styles.statValue}>{count(totals.visitorDays)}</b>
          <small className={styles.statNote}>
            Each visitor is counted once per day, so one person on 3 days counts 3.
          </small>
        </div>
        <div className={`${frame.card} ${styles.stat}`} data-testid="insights-total-visits">
          <span className={styles.statLabel}>Visits</span>
          <b className={styles.statValue}>{count(totals.visits)}</b>
          <small className={styles.statNote}>Times someone came to your website</small>
        </div>
        <div className={`${frame.card} ${styles.stat}`} data-testid="insights-total-avg-time">
          <span className={styles.statLabel}>Avg time on page</span>
          {totals.avgTimeMs === null ? (
            <b className={styles.statEmpty}>Not measured yet</b>
          ) : (
            <b className={styles.statValue}>{formatDuration(totals.avgTimeMs)}</b>
          )}
          <small className={styles.statNote}>Minutes and seconds a page is on screen</small>
        </div>
      </div>
    </section>
  );
}

function TopCard({
  id,
  testId,
  title,
  rows,
  empty,
  showTime = false,
}: {
  id: string;
  testId: string;
  title: string;
  rows: readonly InsightsTopRow[];
  empty: string;
  showTime?: boolean;
}) {
  return (
    <article className={`${frame.card} ${styles.topCard}`} data-testid={testId} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.cardTitle}>
        {title}
      </h3>
      <TopList rows={rows} empty={empty} showTime={showTime} />
    </article>
  );
}

function TopList({
  label,
  rows,
  empty,
  showTime = false,
}: {
  label?: string;
  rows: readonly InsightsTopRow[];
  empty: string;
  showTime?: boolean;
}) {
  return (
    <div className={styles.listBlock}>
      {label ? <h4 className={styles.subTitle}>{label}</h4> : null}
      {rows.length === 0 ? (
        <p className={frame.empty}>{empty}</p>
      ) : (
        <ol className={styles.rows}>
          {rows.map((row) => (
            <li key={row.value} className={styles.row}>
              <span className={styles.rowName} title={row.value}>
                {row.value}
              </span>
              <span className={styles.rowCount}>
                {count(row.views)}
                <span className={frame.srOnly}> views</span>
              </span>
              {showTime ? (
                <span className={styles.rowTime}>
                  {row.avgTimeMs === null ? "—" : formatDuration(row.avgTimeMs)}
                  <span className={frame.srOnly}> average time on page</span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Sponsors({ data }: { data: InsightsData }) {
  return (
    <section aria-labelledby="insights-sponsors-heading" className={frame.wide} data-testid="insights-sponsors">
      <h2 id="insights-sponsors-heading" className={frame.label}>
        Sponsors
      </h2>
      {data.sponsors.length === 0 ? (
        <p className={`${frame.card} ${frame.empty}`}>No sponsor logos were seen in this range.</p>
      ) : (
        <div className={`${frame.card} ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Sponsor</th>
                <th scope="col">Logo views</th>
                <th scope="col">People who saw it (visitor-days)</th>
                <th scope="col">Clicks</th>
                <th scope="col">Click rate</th>
              </tr>
            </thead>
            <tbody>
              {data.sponsors.map((sponsor) => (
                <tr key={sponsor.sponsorId} data-removed={sponsor.removed || undefined}>
                  <th scope="row" className={styles.sponsorName} title={sponsor.name}>
                    {sponsor.name}
                  </th>
                  <td>{count(sponsor.logoViews)}</td>
                  <td>{count(sponsor.logoViewerDays)}</td>
                  <td>{count(sponsor.clicks)}</td>
                  <td>{formatRate(sponsor.clickRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
