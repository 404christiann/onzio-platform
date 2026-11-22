import { formatClubDate } from "@/lib/club-time";
import { formatCount, formatDuration } from "@/lib/telemetry/insights-math";
import type { SiteTraffic as SiteTrafficNumbers } from "@/lib/telemetry/report-data";
import type { DayBar } from "./sponsor-lines";

// UI-POLISH-INSIGHTS: the month's site traffic, as context under the sponsor
// table: three numbers in one row and page views per day as plain CSS bars
// (match days marked). No chart library; screen readers get a list.

function DailyBars({ days }: { days: DayBar[] }) {
  const top = Math.max(0, ...days.map((day) => day.views ?? 0));
  const counted = days.filter((day) => day.views !== null);
  const busiest = counted.reduce<DayBar | null>((best, day) => (best === null || (day.views ?? 0) > (best.views ?? 0) ? day : best), null);
  if (top === 0) return null;
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex h-24 items-end gap-[2px]" aria-hidden="true">
        {days.map((day) => (
          <span key={day.date} className="flex h-full flex-1 flex-col justify-end gap-1">
            {day.views === null ? (
              <span className="h-px bg-border" />
            ) : (
              <span
                className={`min-h-[2px] rounded-t-[2px] ${day.matchDay ? "bg-foreground" : "bg-primary"}`}
                style={{ height: `${Math.round((day.views / top) * 100)}%` }}
              />
            )}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span>
          Page views per day
          {busiest?.views ? `, most on ${formatClubDate(busiest.date, "short") ?? busiest.date} (${formatCount(busiest.views)})` : ""}
        </span>
        {days.some((day) => day.matchDay) ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-[2px] bg-foreground" aria-hidden="true" />
            Match day
          </span>
        ) : null}
      </figcaption>
      <ul className="sr-only">
        {counted.map((day) => (
          <li key={day.date}>
            {formatClubDate(day.date, "short") ?? day.date}: {formatCount(day.views ?? 0)} page views{day.matchDay ? ", match day" : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function SiteTraffic({ site, days, month }: { site: SiteTrafficNumbers; days: DayBar[]; month: string }) {
  const numbers = [
    { label: "Page views", value: formatCount(site.views) },
    { label: "Visitor-days", value: formatCount(site.visitorDays) },
    { label: "Avg. time on a page", value: site.avgTimeOnPageMs === null ? "Not measured" : formatDuration(site.avgTimeOnPageMs) },
  ];
  return (
    <section aria-labelledby="insights-site-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 id="insights-site-heading" className="text-[15px] font-semibold">
        Your website in {month}
      </h2>
      <dl className="grid grid-cols-3 gap-4">
        {numbers.map((number) => (
          <div key={number.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-[13px] text-muted-foreground">{number.label}</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{number.value}</dd>
          </div>
        ))}
      </dl>
      <DailyBars days={days} />
      <p className="text-[13px] text-muted-foreground">
        A visitor-day is one person on one day, so someone who visits on three days counts three times.
      </p>
    </section>
  );
}
