import { formatCount, formatRate } from "@/lib/telemetry/insights-math";
import type { SponsorSummary } from "./sponsor-lines";

// UI-POLISH-INSIGHTS: the per-sponsor table, the main object of the Insights tab
// and the report's summary page. Logo views, clicks and click rate, most seen
// first, with a total row. Below 640px the rows reflow into a list. The print
// variant is the bare table. Server rendered; the numbers come from sponsorSummary().

function Rate({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No click rate: the logo was not seen</span>
      </>
    );
  }
  return <>{formatRate(rate)}</>;
}

const CELL = "px-4 py-3 text-right";
const NAME = "sticky left-0 z-[1] min-w-[9rem] max-w-[16rem] bg-card px-4 py-3 text-left [overflow-wrap:anywhere]";

export function SponsorTable({
  summary,
  caption,
  variant = "screen",
}: {
  summary: SponsorSummary;
  caption: string;
  variant?: "screen" | "print";
}) {
  const scroll = variant === "screen";
  const table = (
    <table className="w-full min-w-[30rem] border-collapse text-base tabular-nums" data-sponsor-table="">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border text-[13px] text-muted-foreground">
          <th scope="col" className={`${NAME} py-2 font-medium`}>
            Sponsor
          </th>
          <th scope="col" className={`${CELL} py-2 font-medium`}>
            Logo views
          </th>
          <th scope="col" className={`${CELL} py-2 font-medium`}>
            Clicks
          </th>
          <th scope="col" className={`${CELL} py-2 font-medium`}>
            Click rate
          </th>
        </tr>
      </thead>
      <tbody>
        {summary.lines.map((line) => (
          <tr key={line.id} className="border-b border-border last:border-b-0" data-sponsor-row={line.id.toLowerCase()}>
            <th
              scope="row"
              className={`${NAME} font-medium ${line.removed ? "font-normal italic text-muted-foreground" : ""}`}
            >
              {line.name}
            </th>
            <td className={CELL}>{formatCount(line.logoViews)}</td>
            <td className={CELL}>{formatCount(line.clicks)}</td>
            <td className={CELL}>
              <Rate rate={line.clickRate} />
            </td>
          </tr>
        ))}
      </tbody>
      {summary.lines.length > 1 ? (
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <th scope="row" className={NAME}>
              All sponsors
            </th>
            <td className={CELL}>{formatCount(summary.logoViews)}</td>
            <td className={CELL}>{formatCount(summary.clicks)}</td>
            <td className={CELL}>
              <Rate rate={summary.clickRate} />
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
  if (!scroll) return table;
  return (
    <>
      <div className="hidden sm:block">{table}</div>
      <PhoneList summary={summary} caption={caption} />
    </>
  );
}

/**
 * Below 640px the same rows as a list, so clicks and click rate never hide
 * behind a sideways scroll: name and logo views on one line, the rest under it.
 */
function PhoneList({ summary, caption }: { summary: SponsorSummary; caption: string }) {
  const rows = [
    ...summary.lines.map((line) => ({ ...line, total: false })),
    ...(summary.lines.length > 1
      ? [
          {
            id: "all",
            name: "All sponsors",
            removed: false,
            logoViews: summary.logoViews,
            clicks: summary.clicks,
            clickRate: summary.clickRate,
            total: true,
          },
        ]
      : []),
  ];
  return (
    <div className="sm:hidden">
      <div
        className="flex justify-between border-b border-border px-4 py-2 text-[13px] text-muted-foreground"
        aria-hidden="true"
      >
        <span>Sponsor</span>
        <span>Logo views</span>
      </div>
      <ol className="flex flex-col" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={row.id}
            className={`flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 ${row.total ? "border-t-2 font-semibold" : ""}`}
          >
            <span className="flex items-baseline justify-between gap-4 text-base">
              <span
                className={`min-w-0 [overflow-wrap:anywhere] ${row.total ? "" : "font-medium"} ${row.removed ? "font-normal italic text-muted-foreground" : ""}`}
              >
                {row.name}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatCount(row.logoViews)}
                <span className="sr-only"> logo views</span>
              </span>
            </span>
            <span className="text-[13px] font-normal tabular-nums text-muted-foreground">
              {formatCount(row.clicks)} {row.clicks === 1 ? "click" : "clicks"} ·{" "}
              {row.clickRate === null ? "no click rate" : `${formatRate(row.clickRate)} click rate`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
