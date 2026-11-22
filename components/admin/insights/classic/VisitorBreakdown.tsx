import Link from "next/link";
import type { InsightsData, InsightsTopRow } from "@/lib/telemetry/insights-data";
import { INSIGHTS_RANGES, formatCount, type InsightsRange } from "@/lib/telemetry/insights-math";

// UI-POLISH-INSIGHTS: where visitors came from over the last 7, 30 or 90 days
// (pages, sources, devices, places, campaigns). Lists, not cards: label on the
// left, page views on the right. Server rendered from loadInsightsData().

const DEVICE_NAMES: Record<string, string> = { mobile: "Phone", desktop: "Computer", tablet: "Tablet" };

function label(dimension: string, value: string): string {
  if (dimension === "path") return value === "/" ? "Home page" : value;
  if (dimension === "device") return DEVICE_NAMES[value.toLowerCase()] ?? value;
  return value;
}

function TopList({ title, dimension, rows }: { title: string; dimension: string; rows: InsightsTopRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={title}>
      <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col text-[15px] tabular-nums">
        {rows.slice(0, 5).map((row) => (
          <li key={row.value} className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
            <span className="min-w-0 [overflow-wrap:anywhere]">{label(dimension, row.value)}</span>
            <span className="shrink-0">{formatCount(row.views)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VisitorBreakdown({ data, basePath, month }: { data: InsightsData; basePath: string; month: string }) {
  const lists = [
    { title: "Pages", dimension: "path", rows: data.top.path },
    { title: "Came from", dimension: "source", rows: data.top.source },
    { title: "Devices", dimension: "device", rows: data.top.device },
    { title: "Countries", dimension: "country", rows: data.top.country },
    { title: "Cities", dimension: "city", rows: data.top.city },
    { title: "Campaign links", dimension: "utm_campaign", rows: data.top.utm_campaign },
  ].filter((list) => list.rows.length > 0);

  return (
    <section aria-labelledby="insights-visitors-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="insights-visitors-heading" className="text-[15px] font-semibold">
          Where visitors came from
        </h2>
        <nav aria-label="Time range" className="-my-2 flex text-[13px]">
          {INSIGHTS_RANGES.map((range: InsightsRange) => {
            const current = range === data.range;
            return (
              <Link
                key={range}
                href={`${basePath}?month=${month}&range=${range}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={`admin-press inline-flex min-h-11 items-center rounded-md px-2 ${current ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Last {range} days
              </Link>
            );
          })}
        </nav>
      </div>
      {lists.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">No visits in the last {data.range} days.</p>
      ) : (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {lists.map((list) => (
            <TopList key={list.title} {...list} />
          ))}
        </div>
      )}
    </section>
  );
}
