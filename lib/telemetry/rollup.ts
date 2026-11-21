import { createServiceRoleClient } from "@/lib/supabase-service-role";

// TELEMETRY-02: the daily rollup. A cron (/api/cron/telemetry-rollup) calls runTelemetryRollup, which
// calls onzio.rollup_page_telemetry as the service role. Each run recomputes the last few days of
// per-club daily rollups from raw events, so a missed run heals on the next one.
//
// Like retention, the service-role client lives here, in the cron's import graph, and never in a
// public entry point's (tests/contracts/page-telemetry-service-role-boundary.test.ts walks them).

/** Days recomputed per run (today and the two before it). */
export const ROLLUP_DAYS_PER_RUN = 3;

export type TelemetryRollupResult = {
  clubs: number;
  days: number;
  rowsWritten: number;
};

type Service = ReturnType<typeof createServiceRoleClient>;

export type TelemetryRollupDeps = {
  service?: Service;
  days?: number;
};

function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The telemetry rollup returned an invalid ${field}.`);
  }
  return value;
}

export async function runTelemetryRollup(deps: TelemetryRollupDeps = {}): Promise<TelemetryRollupResult> {
  const service = deps.service ?? createServiceRoleClient();
  const days = deps.days ?? ROLLUP_DAYS_PER_RUN;

  const { data, error } = await service.schema("onzio").rpc("rollup_page_telemetry", { p_days: days });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Unable to roll up page telemetry: ${error?.message ?? "empty result"}`);
  }
  const row = data as Record<string, unknown>;
  return {
    clubs: count(row.clubs, "clubs"),
    days: count(row.days, "days"),
    rowsWritten: count(row.rowsWritten, "rowsWritten"),
  };
}
