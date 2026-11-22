// PROTOTYPE (UI-POLISH-INSIGHTS), throwaway: three layouts for the per-sponsor
// section on /admin/insights, switched by ?variant=A|B|C. A: dense table.
// B: ranked bars. C: table with an inline bar in the logo views column.
// The winner is folded into SponsorTable.tsx; this file never reaches main.
import { formatCount, formatRate } from "@/lib/telemetry/insights-math";
import { SponsorTable } from "./SponsorTable";
import type { SponsorSummary } from "./sponsor-lines";

export const PROTOTYPE_VARIANTS = {
  A: "Dense table",
  B: "Ranked bars",
  C: "Table + inline bars",
} as const;
export type PrototypeVariant = keyof typeof PROTOTYPE_VARIANTS;

function share(views: number, top: number) {
  return top > 0 ? Math.max(views > 0 ? 2 : 0, Math.round((views / top) * 100)) : 0;
}

function RankedBars({ summary }: { summary: SponsorSummary }) {
  const top = summary.lines[0]?.logoViews ?? 0;
  return (
    <ol className="flex flex-col">
      {summary.lines.map((line, index) => (
        <li key={line.id} className="grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
          <span className="text-[13px] tabular-nums text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{line.name}</span>
          <span className="text-right tabular-nums">{formatCount(line.logoViews)}</span>
          <span />
          <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${share(line.logoViews, top)}%` }} />
          </span>
          <span />
          <span className="col-span-2 text-[13px] tabular-nums text-muted-foreground">
            {formatCount(line.clicks)} {line.clicks === 1 ? "click" : "clicks"} · {formatRate(line.clickRate)} click rate
          </span>
        </li>
      ))}
    </ol>
  );
}

function TableWithBars({ summary, caption }: { summary: SponsorSummary; caption: string }) {
  const top = summary.lines[0]?.logoViews ?? 0;
  return (
    <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <table className="w-full min-w-[34rem] border-collapse text-[15px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-[13px] text-muted-foreground">
            <th scope="col" className="sticky left-0 bg-card px-4 py-2 text-left font-medium">Sponsor</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Logo views</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Clicks</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Click rate</th>
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr key={line.id} className="border-b border-border last:border-b-0">
              <th scope="row" className="sticky left-0 min-w-[9rem] max-w-[16rem] bg-card px-4 py-3 text-left font-medium [overflow-wrap:anywhere]">
                {line.name}
              </th>
              <td className="px-4 py-3">
                <span className="flex items-center justify-end gap-3">
                  <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${share(line.logoViews, top)}%` }} />
                  </span>
                  <span className="w-16 text-right">{formatCount(line.logoViews)}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right">{formatCount(line.clicks)}</td>
              <td className="px-4 py-3 text-right">{formatRate(line.clickRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SponsorSectionPrototype({
  variant,
  summary,
  caption,
}: {
  variant: PrototypeVariant;
  summary: SponsorSummary;
  caption: string;
}) {
  if (variant === "B") return <RankedBars summary={summary} />;
  if (variant === "C") return <TableWithBars summary={summary} caption={caption} />;
  return <SponsorTable summary={summary} caption={caption} />;
}
