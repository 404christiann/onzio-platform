import { createServiceRoleClient } from "@/lib/supabase-service-role";

// TELEMETRY-01: the daily retention sweep. A cron (/api/cron/telemetry-retention) calls
// runTelemetryRetention, which calls onzio.sweep_page_telemetry as the service role. The sweep
// inside onzio.record_page_event only runs when some club has accepted traffic; this one does not
// depend on traffic, so a club that drops the add-on (or every club going quiet) still loses raw
// events after 90 days.
//
// The service-role client lives here, in the cron's import graph, and never in the public beacon's
// (tests/contracts/page-telemetry-service-role-boundary.test.ts walks the beacon's graph).

/** Raw events one run may delete. The database deletes them 5,000 at a time and reports what is left. */
export const RETENTION_MAX_EVENTS_PER_RUN = 100_000;

export type TelemetryRetentionResult = {
  /** The bound this run was given. */
  maxEvents: number;
  eventsDeleted: number;
  saltsDeleted: number;
  rateWindowsDeleted: number;
  dropCountsDeleted: number;
  /** True when events older than 90 days are left for the next run. */
  moreEventsRemain: boolean;
};

type Service = ReturnType<typeof createServiceRoleClient>;

export type TelemetryRetentionDeps = {
  service?: Service;
  maxEvents?: number;
};

function count(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The telemetry retention sweep returned an invalid ${field}.`);
  }
  return value;
}

export async function runTelemetryRetention(deps: TelemetryRetentionDeps = {}): Promise<TelemetryRetentionResult> {
  const service = deps.service ?? createServiceRoleClient();
  const maxEvents = deps.maxEvents ?? RETENTION_MAX_EVENTS_PER_RUN;

  const { data, error } = await service.schema("onzio").rpc("sweep_page_telemetry", { p_max_events: maxEvents });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Unable to sweep page telemetry: ${error?.message ?? "empty result"}`);
  }
  const row = data as Record<string, unknown>;
  if (typeof row.moreEventsRemain !== "boolean") {
    throw new Error("The telemetry retention sweep returned an invalid moreEventsRemain.");
  }
  return {
    maxEvents: count(row.maxEvents, "maxEvents"),
    eventsDeleted: count(row.eventsDeleted, "eventsDeleted"),
    saltsDeleted: count(row.saltsDeleted, "saltsDeleted"),
    rateWindowsDeleted: count(row.rateWindowsDeleted, "rateWindowsDeleted"),
    dropCountsDeleted: count(row.dropCountsDeleted, "dropCountsDeleted"),
    moreEventsRemain: row.moreEventsRemain,
  };
}
