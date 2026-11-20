import { createHmac } from "node:crypto";

// TELEMETRY-01: the route turns IP + user agent into an HMAC with a server
// secret, so the raw IP never leaves this process. The database then applies
// the club's daily random salt (onzio_private.record_page_event).

export const VISITOR_SECRET_ENV = "TELEMETRY_VISITOR_SECRET";

/** Minimum secret length; shorter values are treated as unset. */
const MIN_SECRET_LENGTH = 32;

export function visitorSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env[VISITOR_SECRET_ENV];
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** The client IP as Vercel reports it; only ever used as HMAC input. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = headers.get("x-real-ip")?.trim() || forwarded || "";
  return candidate.length > 0 && candidate.length <= 64 ? candidate : null;
}

export function visitorMaterial(secret: string, ip: string, userAgent: string): string {
  return createHmac("sha256", secret).update(`${ip}\n${userAgent}`).digest("hex");
}
