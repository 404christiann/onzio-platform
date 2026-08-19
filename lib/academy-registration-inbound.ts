import { z } from "zod";

/**
 * Pure validation core for the public academy-registration form
 * (`app/(public)/join/academy` -> `app/api/registrations/academy/route.ts`,
 * CV United C1). Mirrors `lib/contact-inbound.ts`: nothing here touches the
 * network or the database, so it is directly unit-testable, and the route
 * owns tenant identity, the `status === 'live'` gate, the service-role
 * insert, and the Stripe Connect checkout handoff.
 *
 * Deliberately does NOT accept a club id or a form id from the client. The
 * route resolves the club exclusively from the middleware-set
 * `x-onzio-club-id` header and resolves the *live* academy_registration form
 * itself from that club id — a form id in the body would only invite someone
 * to submit against a different club's or a different status's form.
 *
 * `waiverAccepted` mirrors the checkbox described in the work order: the
 * parent/guardian must affirmatively check "I have read and agree to the
 * above on behalf of [player]" before the browser will even submit. The
 * server treats anything other than literal `true` as unaccepted -- the
 * same "accepted or nothing" shape onzio.registration_responses enforces at
 * the database layer (registration_responses_waiver_pair, and the
 * academy-only hard-reject trigger
 * onzio_private.enforce_registration_response_waiver).
 */

const NAME_MAX = 80;
const GUARDIAN_NAME_MAX = 160;
const PHONE_MAX = 40;
const NOTES_MAX = 2000;

const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isNotInFuture(value: string): boolean {
  // Same rule as the registration_responses `player_dob <= current_date`
  // check constraint, evaluated here so a bad date fails with a readable
  // message instead of surfacing as a raw Postgres error.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const todayUtc = new Date();
  const todayIso = new Date(
    Date.UTC(
      todayUtc.getUTCFullYear(),
      todayUtc.getUTCMonth(),
      todayUtc.getUTCDate(),
    ),
  );
  return parsed.getTime() <= todayIso.getTime();
}

const academyRegistrationInboundSchema = z.object({
  playerFirstName: z.string().trim().min(1).max(NAME_MAX),
  playerLastName: z.string().trim().min(1).max(NAME_MAX),
  playerDob: z
    .string()
    .trim()
    .regex(DOB_PATTERN, "playerDob must be an ISO date (YYYY-MM-DD)")
    .refine(isNotInFuture, "playerDob must not be in the future"),
  parentGuardianName: z.string().trim().min(1).max(GUARDIAN_NAME_MAX),
  parentGuardianEmail: z.string().trim().email().max(254),
  parentGuardianPhone: z.string().trim().min(1).max(PHONE_MAX),
  notes: z.string().trim().max(NOTES_MAX).optional(),
  // `literal(true)` rather than `boolean()`: an unchecked box (false) or a
  // missing field must fail validation the same way, not just fail the
  // waiver-specific check later.
  waiverAccepted: z.literal(true, "The waiver/consent checkbox must be accepted"),
});

export type AcademyRegistrationInbound = Omit<
  z.infer<typeof academyRegistrationInboundSchema>,
  "notes"
> & { notes?: string };

export type AcademyRegistrationInboundResult =
  | { outcome: "accepted"; submission: AcademyRegistrationInbound }
  | { outcome: "invalid"; message: string };

export function parseAcademyRegistrationInbound(
  value: unknown,
): AcademyRegistrationInboundResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      outcome: "invalid",
      message: "Academy registration submission must be an object",
    };
  }

  const parsed = academyRegistrationInboundSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: "invalid",
      message: issue
        ? `${issue.path.join(".")}: ${issue.message}`
        : "Invalid academy registration submission",
    };
  }

  const { notes, ...submission } = parsed.data;
  return {
    outcome: "accepted",
    submission: notes ? { ...submission, notes } : submission,
  };
}
