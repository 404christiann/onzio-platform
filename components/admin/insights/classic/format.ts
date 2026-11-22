// UI-POLISH-INSIGHTS: one way to write numbers on the Insights tab and the
// printable report, so a sponsor sees the same figure in both places.
export { formatCount, formatRate } from "@/lib/telemetry/insights-math";

/** Time on a page for people to read: "42s", "1m 05s"; null when it was not measured. */
export function formatSeconds(ms: number | null): string | null {
  if (ms === null) return null;
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
