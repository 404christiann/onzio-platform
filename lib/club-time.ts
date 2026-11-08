// The club's own time zone (decision 0014). ADMIN-RE-02 adds the validator the
// automatic browser set and the operator script share; ADMIN-RE-03 adds "today"
// and the date and time formatters here.

export const DEFAULT_CLUB_TIME_ZONE = "America/Los_Angeles";

// The same shape onzio.clubs.time_zone's check constraint enforces
// (20261108120000_admin_reimagined_foundation.sql), so a zone that passes here
// never fails the database write.
const TIME_ZONE_SHAPE = /^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2})$/;

/**
 * True for a real IANA time zone the runtime can format with. The shape check
 * alone lets "Mars/Phobos" through; Intl rejects it with a RangeError.
 */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64 || !TIME_ZONE_SHAPE.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The stored zone when it is valid, otherwise the default. */
export function clubTimeZoneOrDefault(value: unknown): string {
  return isValidTimeZone(value) ? value : DEFAULT_CLUB_TIME_ZONE;
}
