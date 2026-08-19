import { NextResponse } from "next/server";
import { createConnectedCheckoutSession } from "@/lib/stripe/connect-checkout";
import { parseAcademyRegistrationInbound } from "@/lib/academy-registration-inbound";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same verified-UUID gate app/api/contact/route.ts uses: the header value
// must already be a well-formed club UUID or the request is treated as
// tenantless and fails closed.
const CLUB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(code: string, status: number, message = code) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Public academy-registration submit (CV United C1 crest@1's `/join/academy`
 * form). Tenant identity comes exclusively from the `x-onzio-club-id`
 * header, which middleware.ts deletes from every inbound request and
 * re-sets from the verified tenant resolution before the request reaches
 * this handler — a club id, form id, or price in the request body is never
 * trusted, mirroring app/api/contact/route.ts.
 *
 * The client-rendered `/join/academy` page already hides the real form
 * behind the platform's existing authenticated-preview mechanism (RLS:
 * registration_forms_member_read lets a signed-in club owner/admin see a
 * draft/closed form; registration_forms_public_read hides it from everyone
 * else — see app/_clubs/[slug]/join/academy/page.tsx). That client-side gate
 * is a courtesy only. This route is the real gate: it re-resolves the
 * club's *live* academy_registration form itself, independent of anything
 * the client rendered or sent, and hard-rejects with 404 if no such form
 * exists — including for a request replayed against a draft form an
 * operator was just previewing.
 */
export async function POST(request: Request) {
  const clubId = request.headers.get("x-onzio-club-id") ?? "";
  if (!CLUB_ID_PATTERN.test(clubId)) {
    return errorResponse("UNKNOWN_TENANT", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_ACADEMY_REGISTRATION_PAYLOAD", 400);
  }

  const parsed = parseAcademyRegistrationInbound(body);
  if (parsed.outcome === "invalid") {
    return errorResponse(
      "INVALID_ACADEMY_REGISTRATION_PAYLOAD",
      400,
      parsed.message,
    );
  }
  const { submission } = parsed;

  const supabase = createServiceRoleClient();
  const onzio = supabase.schema("onzio");

  // The real draft-gate. Deliberately re-queried here rather than trusting
  // any form id or status the client might send: a live-only lookup means a
  // form that is draft, closed, or belongs to a different club simply does
  // not match, and this 404s exactly the same way a nonexistent form would.
  const { data: form, error: formError } = await onzio
    .from("registration_forms")
    .select("id, waiver_version, requires_payment")
    .eq("club_id", clubId)
    .eq("form_type", "academy_registration")
    .eq("status", "live")
    .maybeSingle();
  if (formError) {
    return errorResponse("ACADEMY_REGISTRATION_LOOKUP_FAILED", 500);
  }
  if (!form) {
    return errorResponse(
      "ACADEMY_REGISTRATION_NOT_LIVE",
      404,
      "This club is not currently accepting academy registrations.",
    );
  }
  // Belt-and-suspenders alongside registration_forms_live_academy_waiver_present:
  // a live academy_registration form is guaranteed a waiver_version by that
  // DB constraint, but this route never assumes a database invariant it can
  // check for free.
  if (form.waiver_version === null) {
    return errorResponse(
      "ACADEMY_REGISTRATION_NOT_LIVE",
      409,
      "This club's academy registration is missing required waiver information.",
    );
  }

  const { data: response, error: insertError } = await onzio
    .from("registration_responses")
    .insert({
      club_id: clubId,
      form_id: form.id,
      player_first_name: submission.playerFirstName,
      player_last_name: submission.playerLastName,
      player_dob: submission.playerDob,
      parent_guardian_name: submission.parentGuardianName,
      parent_guardian_email: submission.parentGuardianEmail,
      parent_guardian_phone: submission.parentGuardianPhone,
      notes: submission.notes ?? null,
      payment_status: "pending",
      waiver_accepted_at: new Date().toISOString(),
      waiver_version_accepted: form.waiver_version,
    })
    .select("id")
    .single();
  if (insertError || !response) {
    // Covers both the ordinary insert-failure path and the
    // onzio_private.enforce_registration_response_waiver trigger's hard
    // reject (Postgres 23514) -- which this route's own waiverAccepted
    // check above should already have prevented, but the trigger is the
    // documented real backstop, not this route.
    return errorResponse("ACADEMY_REGISTRATION_SUBMISSION_FAILED", 500);
  }

  // createConnectedCheckoutSession (lib/stripe/connect-checkout.ts) itself
  // returns `{ error: "FORM_PAYMENT_NOT_REQUIRED" }` for a form whose
  // requires_payment is false -- it is written for the paid path only.
  // A free academy registration is a legitimate, fully-submitted outcome
  // with nothing to check out for, not a failure, so it is never routed
  // into that helper: doing so would surface a spurious "checkout failed"
  // error to a family whose registration actually succeeded.
  if (!form.requires_payment) {
    return NextResponse.json({ registrationId: response.id, checkoutUrl: null });
  }

  let checkout: Awaited<ReturnType<typeof createConnectedCheckoutSession>>;
  try {
    checkout = await createConnectedCheckoutSession({
      clubId,
      formId: form.id,
      responseId: response.id,
    });
  } catch {
    return errorResponse(
      "ACADEMY_REGISTRATION_CHECKOUT_FAILED",
      502,
      "Your registration was saved, but we could not start checkout. Please contact the club.",
    );
  }
  if ("error" in checkout) {
    return errorResponse(
      "ACADEMY_REGISTRATION_CHECKOUT_FAILED",
      502,
      checkout.error,
    );
  }

  return NextResponse.json({
    registrationId: response.id,
    checkoutUrl: checkout.checkoutUrl,
  });
}
