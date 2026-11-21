import { IconMatchStats } from "@/components/admin/icons";
import type { InsightsData, InsightsDay, InsightsMatch } from "@/lib/telemetry/insights-data";
import { formatCount as count, formatInsightsDate as dayWords } from "@/lib/telemetry/insights-math";
import frame from "../reimagined/frame.module.css";
import styles from "../reimagined/insights.module.css";

// TELEMETRY-04: the Insights tab's views-per-day chart, plain SVG like the team
// analytics player chart (components/admin/analytics/PlayerChart.tsx); the
// reimagined folder itself draws no SVG of its own, only admin icons. Nothing is
// told by color alone: match days carry a diamond and a legend line, days
// without data a dash, and the whole series is also a table.

const CHART_WIDTH = 600;
const CHART_HEIGHT = 180;
const CHART_TOP = 22;
const CHART_BASE = CHART_HEIGHT - 4;

function matchLabel(match: InsightsMatch | undefined, date: string): string {
  const when = dayWords(date);
  if (!match) return `Match day: ${when}`;
  return `Match day: ${match.home ? "vs" : "at"} ${match.opponent}, ${when}`;
}

export function DailyViewsChart({ data }: { data: InsightsData }) {
  const { daily } = data;
  const matches = new Map(data.matches.map((match) => [match.date, match]));
  const max = Math.max(1, ...daily.map((day) => day.views ?? 0));
  const slot = CHART_WIDTH / Math.max(1, daily.length);
  const barWidth = Math.max(2, slot * 0.7);
  const plotHeight = CHART_BASE - CHART_TOP;
  const peak = Math.max(0, ...daily.map((day) => day.views ?? 0));
  const summary = `Views per day from ${dayWords(data.start)} to ${dayWords(data.end)}. Busiest day: ${count(peak)} views.`;

  return (
    <section aria-labelledby="insights-daily-heading" className={frame.wide}>
      <h2 id="insights-daily-heading" className={frame.label}>
        Views by day
      </h2>
      <div className={`${frame.card} ${styles.chartCard}`}>
        <svg
          className={styles.chart}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="group"
          aria-label={summary}
          data-testid="insights-daily-chart"
        >
          <line x1="0" x2={CHART_WIDTH} y1={CHART_BASE} y2={CHART_BASE} className={styles.axis} />
          {daily.map((day, index) => (
            <DayMark
              key={day.date}
              day={day}
              x={index * slot + (slot - barWidth) / 2}
              width={barWidth}
              height={day.views === null ? 0 : (day.views / max) * plotHeight}
              match={matches.get(day.date)}
            />
          ))}
        </svg>
        <ul className={styles.legend} aria-label="Chart key">
          <li>
            <span className={styles.keyBar} aria-hidden="true" />
            Views in a day
          </li>
          <li>
            <svg viewBox="0 0 10 10" className={styles.keyIcon} aria-hidden="true">
              <path d="M5 0 10 5 5 10 0 5Z" className={styles.diamond} />
            </svg>
            Match day
          </li>
          <li>
            <svg viewBox="0 0 10 10" className={styles.keyIcon} aria-hidden="true">
              <path d="M1 5h8" className={styles.gapMark} />
            </svg>
            No numbers for the day
          </li>
        </ul>
        <details className={styles.tableToggle}>
          <summary className={frame.press}>
            <IconMatchStats aria-hidden="true" />
            View as a table
          </summary>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={frame.srOnly}>Views, visitor-days and visits for each day</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Views</th>
                  <th scope="col">Visitor-days</th>
                  <th scope="col">Visits</th>
                  <th scope="col">Match</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{dayWords(day.date)}</th>
                    <td>{day.views === null ? "No numbers" : count(day.views)}</td>
                    <td>{day.visitorDays === null ? "—" : count(day.visitorDays)}</td>
                    <td>{day.visits === null ? "—" : count(day.visits)}</td>
                    <td>{day.matchDay ? matchLabel(matches.get(day.date), day.date).replace("Match day: ", "") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

function DayMark({
  day,
  x,
  width,
  height,
  match,
}: {
  day: InsightsDay;
  x: number;
  width: number;
  height: number;
  match: InsightsMatch | undefined;
}) {
  const centre = x + width / 2;
  const label =
    day.views === null
      ? `${dayWords(day.date)}: no numbers`
      : `${dayWords(day.date)}: ${count(day.views)} ${day.views === 1 ? "view" : "views"}`;
  return (
    <g>
      {day.views === null ? (
        <path d={`M${x} ${CHART_BASE - 6}h${width}`} className={styles.gapMark} data-testid="insights-gap-marker">
          <title>{label}</title>
        </path>
      ) : (
        <rect x={x} y={CHART_BASE - height} width={width} height={Math.max(height, day.views > 0 ? 1 : 0)} rx="1.5" className={styles.bar}>
          <title>{label}</title>
        </rect>
      )}
      {day.matchDay ? (
        <path
          d={`M${centre} 1 l5 5 -5 5 -5 -5Z`}
          className={styles.diamond}
          data-testid="insights-match-marker"
          role="img"
          aria-label={matchLabel(match, day.date)}
        >
          <title>{matchLabel(match, day.date)}</title>
        </path>
      ) : null}
    </g>
  );
}
