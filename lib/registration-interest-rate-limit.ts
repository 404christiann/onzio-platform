/**
 * Lightweight in-memory rate limiting for the public
 * /api/registrations/interest route. Deliberately not the security-critical
 * boundary -- that is onzio.registration_responses' RLS (no anon grant at
 * all) and the service-role-only write path, per
 * 20260818120100_registration_forms_responses.sql. This exists only to blunt
 * naive scripted spam, matching AGENTS.md's guidance that public write
 * surfaces stay simple rather than gold-plated.
 *
 * A module-level Map is process-local: a serverless deployment with multiple
 * warm instances gets one independent bucket per instance, not one global
 * limit. That is an accepted tradeoff here, not a bug to fix with a shared
 * store -- see the route's honeypot and the database's own constraints for
 * the layers that actually have to hold.
 */

type Bucket = { count: number; windowStart: number };

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

const buckets = new Map<string, Bucket>();

export function isRegistrationInterestRateLimited(
  key: string,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

/** Test-only: clears all buckets so cases don't leak state between runs. */
export function _resetRegistrationInterestRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Best-effort caller IP from the headers a platform load balancer sets.
 * Vercel sets x-forwarded-for; x-real-ip is a fallback for other
 * environments. Never trust this for authorization -- only for bucketing.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
