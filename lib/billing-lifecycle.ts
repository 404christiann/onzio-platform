import { failContract } from "@/lib/contract-error";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export type BillingLifecycleRecord = {
  clubId: string;
  kind: "customer" | "demo" | "test";
  publicAccess: "preview" | "live" | "grace" | "suspended";
  intendedPriceId: string | null;
  actualPriceId: string | null;
  status: string | null;
  paidThrough: string | null;
  graceEndsAt: string | null;
  recordedOperations?: readonly string[];
};

type LifecycleOptions = {
  now: Date;
  suspensionEnabled: boolean;
  reconciliationEnabled: boolean;
};

type Warning = { clubId: string; day: 7 | 17; operation: string };
type Suspension = { clubId: string; operation: "billing_suspended" };
type Divergence = {
  clubId: string;
  reason: "PRICE_MISMATCH" | "BILLING_INTENT_MISSING" | "SUBSCRIPTION_MISSING";
  operation: "billing_reconciliation_divergence";
};

function time(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function planBillingLifecycle(
  records: readonly BillingLifecycleRecord[],
  options: LifecycleOptions,
): {
  warnings: Warning[];
  suspensions: Suspension[];
  divergences: Divergence[];
} {
  if (!(options.now instanceof Date) || !Number.isFinite(options.now.getTime())) {
    failContract("INVALID_LIFECYCLE_TIME");
  }

  const warnings: Warning[] = [];
  const suspensions: Suspension[] = [];
  const divergences: Divergence[] = [];
  const now = options.now.getTime();

  for (const record of records) {
    if (record.kind !== "customer") continue;
    const recorded = new Set(record.recordedOperations ?? []);
    const paidThrough = time(record.paidThrough);
    const graceEndsAt = time(record.graceEndsAt);

    if (record.status === "past_due" && paidThrough !== null) {
      for (const threshold of [
        { day: 7 as const, operation: "billing_grace_warning_day_7" },
        { day: 17 as const, operation: "billing_grace_warning_day_17" },
      ]) {
        const thresholdAt = paidThrough + threshold.day * 86_400_000;
        if (now >= thresholdAt && !recorded.has(threshold.operation)) {
          warnings.push({
            clubId: record.clubId,
            day: threshold.day,
            operation: threshold.operation,
          });
        }
      }
    }

    if (
      options.suspensionEnabled &&
      graceEndsAt !== null &&
      now > graceEndsAt &&
      record.publicAccess !== "suspended"
    ) {
      suspensions.push({
        clubId: record.clubId,
        operation: "billing_suspended",
      });
    }

    if (options.reconciliationEnabled) {
      let reason: Divergence["reason"] | null = null;
      if (!record.intendedPriceId) reason = "BILLING_INTENT_MISSING";
      else if (!record.actualPriceId) reason = "SUBSCRIPTION_MISSING";
      else if (record.intendedPriceId !== record.actualPriceId) {
        reason = "PRICE_MISMATCH";
      }
      if (reason) {
        divergences.push({
          clubId: record.clubId,
          reason,
          operation: "billing_reconciliation_divergence",
        });
      }
    }
  }

  return { warnings, suspensions, divergences };
}

function requiredFlag(name: string): boolean {
  const value = process.env[name];
  if (value === "true") return true;
  if (value === "false") return false;
  failContract("LIFECYCLE_CONFIGURATION_INVALID", `${name} must be true or false.`);
}

export async function runBillingLifecycle(now = new Date()): Promise<{
  warnings: number;
  suspensions: number;
  divergences: number;
}> {
  if (!Number.isFinite(now.getTime())) failContract("INVALID_LIFECYCLE_TIME");
  const { data, error } = await createServiceRoleClient()
    .schema("onzio")
    .rpc("run_billing_lifecycle", {
      p_now: now.toISOString(),
      p_suspension_enabled: requiredFlag("LIFECYCLE_SUSPENSION_ENABLED"),
      p_reconciliation_enabled: requiredFlag("LIFECYCLE_RECONCILIATION_ENABLED"),
    });
  if (error || !data || typeof data !== "object") {
    throw new Error("BILLING_LIFECYCLE_FAILED");
  }
  const result = data as Record<string, unknown>;
  const warnings = Number(result.warnings);
  const suspensions = Number(result.suspensions);
  const divergences = Number(result.divergences);
  if (![warnings, suspensions, divergences].every(Number.isSafeInteger)) {
    throw new Error("BILLING_LIFECYCLE_RESULT_INVALID");
  }
  return { warnings, suspensions, divergences };
}

export async function signalLifecycleHeartbeat(
  status: "success" | "failure",
  detail: string,
): Promise<void> {
  const url = process.env.LIFECYCLE_CRON_HEARTBEAT_URL;
  if (!url) failContract("LIFECYCLE_HEARTBEAT_CONFIGURATION_INVALID");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    failContract("LIFECYCLE_HEARTBEAT_CONFIGURATION_INVALID");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1") {
    failContract("LIFECYCLE_HEARTBEAT_CONFIGURATION_INVALID");
  }
  const response = await fetch(parsed, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, detail }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("LIFECYCLE_HEARTBEAT_FAILED");
}
