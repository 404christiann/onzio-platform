// TELEMETRY-01/03: the one send path for every cookieless beacon the public
// site emits. The server derives the visitor, device, geography and staff flag
// itself; the client adds no cookie, storage or id of any kind.

import type { BeaconBody } from "@/lib/telemetry/beacon-contract";

export const BEACON_URL = "/api/t";

/** The body POST /api/t accepts (main's zod contract): view, logo_seen (1-10 distinct sponsor uuids) or heartbeat (1000-60000 ms). */
export type TelemetryBody = BeaconBody;

export function sendTelemetry(body: TelemetryBody): void {
  try {
    const text = JSON.stringify(body);
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(BEACON_URL, text)) {
      return;
    }
    void fetch(BEACON_URL, {
      method: "POST",
      body: text,
      keepalive: true,
      credentials: "same-origin",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    }).catch(() => undefined);
  } catch {
    // Telemetry never breaks a page.
  }
}
