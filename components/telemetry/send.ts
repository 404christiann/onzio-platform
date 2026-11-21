// TELEMETRY-01/03: the one send path for every cookieless beacon the public
// site emits. The server derives the visitor, device, geography and staff flag
// itself; the client adds no cookie, storage or id of any kind.

export const BEACON_URL = "/api/t";

export type TelemetryBody =
  | { t: "view"; p: string; r?: string; q?: string }
  /** `s` holds 1 to 10 distinct sponsor logo ids (site_sponsor_logos.id). */
  | { t: "logo_seen"; p: string; s: string[] }
  /** `e` is an integer count of visible milliseconds, 1000 to 60000. */
  | { t: "heartbeat"; p: string; e: number };

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
