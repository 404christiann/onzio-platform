import { formatCount, formatRate } from "@/lib/telemetry/insights-math";
import type { SponsorSummary } from "./sponsor-lines";

// UI-POLISH-INSIGHTS: the per-sponsor table, the main object of the Insights tab
// and the report's summary page. Logo views, clicks and click rate, most seen
// first, with a total row. On a phone it scrolls sideways and the sponsor column
// stays put. Server rendered; the numbers come from sponsorSummary().

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
    <table className="w-full min-w-[30rem] border-collapse text-[15px] tabular-nums" data-sponsor-table="">
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
            <th scope="row" className={`${NAME} font-medium ${line.removed ? "font-normal italic text-muted-foreground" : ""}`}>
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
    // Focusable so a keyboard can scroll it when it overflows on a phone.
    <div className="overflow-x-auto overscroll-x-contain" role="region" aria-label={caption} tabIndex={0}>
      {table}
    </div>
  );
}
