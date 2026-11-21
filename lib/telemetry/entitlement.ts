import { createPublicClient } from "@/lib/supabase-server";

// TELEMETRY-01: telemetry is a paid add-on. This per-instance cache lets the
// beacon route and the club layout skip work for clubs without it. It is only
// an optimisation: onzio_private.record_page_event enforces the add-on itself,
// so a stale "true" here costs one dropped database call, never a recorded event.

const TTL_MS = 60_000;
const ERROR_TTL_MS = 10_000;
const MAX_CLUBS = 1_000;

const cache = new Map<string, { value: boolean; expires: number }>();

export async function clubHasTelemetry(clubId: string, now: number = Date.now()): Promise<boolean> {
  const cached = cache.get(clubId);
  if (cached && cached.expires > now) return cached.value;

  let value = false;
  let ttl = ERROR_TTL_MS;
  try {
    const { data, error } = await createPublicClient()
      .schema("onzio")
      .rpc("club_has_addon", { p_club_id: clubId, p_addon: "telemetry" });
    if (!error) {
      value = data === true;
      ttl = TTL_MS;
    }
  } catch {
    // Fail closed: no beacon, no database call.
  }

  if (cache.size >= MAX_CLUBS && !cache.has(clubId)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(clubId, { value, expires: now + ttl });
  return value;
}

export function clearTelemetryEntitlementCache(): void {
  cache.clear();
}
