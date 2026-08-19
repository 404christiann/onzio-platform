import { z } from "zod";

/**
 * Pure validation core for the public general-interest registration form
 * (`/join/interest`, submitted through `/api/registrations/interest`).
 * Mirrors lib/contact-inbound.ts: nothing here touches the network or the
 * database, so it is directly unit-testable, and the route owns tenant
 * resolution, the live-form lookup, and the actual insert.
 *
 * Field names intentionally match onzio.registration_responses' columns
 * (snake_case) rather than being translated at this boundary -- the wire
 * payload, this module's output, and the insert the route builds all use the
 * same shape, so there is nowhere for a field to silently drift between them.
 */

/**
 * Honeypot field name. Rendered by the form as a visually hidden input real
 * users never fill; a non-empty value is silently accepted-and-dropped
 * upstream, so a bot receives the same success response as a real submitter
 * and nothing is written. Distinct from CONTACT_HONEYPOT_FIELD so the two
 * public forms don't share a single bait name.
 */
export const INTEREST_HONEYPOT_FIELD = "company";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Plausibility bounds tighter than the database's own `player_dob <= current
// _date` check (20260818120100_registration_forms_responses.sql): no real
// registrant was born before 1900, and the database alone would happily
// accept that. This is a UX guard, not the authority -- the database
// constraint still fires if this module is ever bypassed.
const MIN_DOB = "1900-01-01";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isPlausibleDob(value: string): boolean {
  if (!DOB_PATTERN.test(value)) return false;
  return value >= MIN_DOB && value <= todayIsoDate();
}

const registrationInterestSchema = z.object({
  player_first_name: z.string().trim().min(1).max(80),
  player_last_name: z.string().trim().min(1).max(80),
  player_dob: z
    .string()
    .trim()
    .refine(isPlausibleDob, {
      message: "player_dob must be a real YYYY-MM-DD date not in the future",
    }),
  parent_guardian_name: z.string().trim().min(1).max(160),
  parent_guardian_email: z.string().trim().max(254).regex(EMAIL_PATTERN),
  parent_guardian_phone: z.string().trim().min(1).max(40),
  interest_area: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type RegistrationInterestInbound = Omit<
  z.infer<typeof registrationInterestSchema>,
  "interest_area" | "notes"
> & { interest_area?: string; notes?: string };

export type RegistrationInterestInboundResult =
  | { outcome: "accepted"; submission: RegistrationInterestInbound }
  /**
   * Honeypot tripped. The caller must respond exactly as it would for a real
   * success (never an error) and must not write anything.
   */
  | { outcome: "dropped" }
  | { outcome: "invalid"; message: string };

export function parseRegistrationInterestInbound(
  value: unknown,
): RegistrationInterestInboundResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      outcome: "invalid",
      message: "Registration submission must be an object",
    };
  }
  const record = value as Record<string, unknown>;

  // Checked before schema validation so a bot-filled payload is dropped even
  // when its other fields would also have failed validation -- a validation
  // error would tell the bot its submission was inspected.
  const honeypot = record[INTEREST_HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { outcome: "dropped" };
  }

  const parsed = registrationInterestSchema.safeParse(record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: "invalid",
      message: issue
        ? `${issue.path.join(".")}: ${issue.message}`
        : "Invalid registration submission",
    };
  }

  const { interest_area, notes, ...rest } = parsed.data;
  return {
    outcome: "accepted",
    submission: {
      ...rest,
      ...(interest_area ? { interest_area } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}
