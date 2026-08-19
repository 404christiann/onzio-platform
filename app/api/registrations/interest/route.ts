import { NextResponse } from "next/server";
import { parseRegistrationInterestInbound } from "@/lib/registration-interest-inbound";
import {
  clientIpFromHeaders,
  isRegistrationInterestRateLimited,
} from "@/lib/registration-interest-rate-limit";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same verified-UUID gate as lib/queries.ts's requireVerifiedClubId and
// app/api/contact/route.ts's CLUB_ID_PATTERN: the header value must already
// be a well-formed club UUID or the request is treated as tenantless and
// fails closed.
const CLUB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(code: string, status: number, message?: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Public general-interest registration submission for `/join/interest`.
 *
 * Tenant identity comes exclusively from the `x-onzio-club-id` /
 * `x-onzio-club-slug` headers, which middleware.ts deletes from every
 * inbound request and re-sets from the verified tenant resolution before the
 * request reaches this handler -- identical to app/api/contact/route.ts. A
 * club identifier in the request body is never trusted.
 *
 * onzio.registration_responses grants anon nothing at all -- no select, no
 * insert -- and authenticated club members get read-only access scoped to
 * their own club (20260818120100_registration_forms_responses.sql). This
 * route is therefore the table's only writer, using the service-role client
 * to bypass RLS for that one privileged insert. It independently re-confirms
 * the form is `general_interest` and `status = 'live'` before writing:
 * whether the /join chooser showed a "sign up" link is a UI convenience, not
 * something this route may trust.
 */
export async function POST(request: Request) {
  const clubId = request.headers.get("x-onzio-club-id") ?? "";
  const clubSlug = request.headers.get("x-onzio-club-slug") ?? "";
  if (!CLUB_ID_PATTERN.test(clubId) || !clubSlug) {
    return errorResponse("UNKNOWN_TENANT", 404);
  }

  const ip = clientIpFromHeaders(request.headers);
  if (isRegistrationInterestRateLimited(`${clubId}:${ip}`)) {
    return errorResponse("RATE_LIMITED", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REGISTRATION_PAYLOAD", 400);
  }

  const parsed = parseRegistrationInterestInbound(body);
  if (parsed.outcome === "invalid") {
    return errorResponse(
      "INVALID_REGISTRATION_PAYLOAD",
      400,
      parsed.message,
    );
  }
  if (parsed.outcome === "dropped") {
    // Honeypot tripped (field name: INTEREST_HONEYPOT_FIELD): respond
    // exactly like a success, checked before any other lookup, and write
    // nothing.
    return NextResponse.json({ received: true });
  }

  const onzio = createServiceRoleClient().schema("onzio");

  const { data: form, error: formError } = await onzio
    .from("registration_forms")
    .select("id, status")
    .eq("club_id", clubId)
    .eq("form_type", "general_interest")
    .maybeSingle();
  if (formError) {
    return errorResponse("REGISTRATION_FORM_LOOKUP_FAILED", 500);
  }
  if (!form) {
    return errorResponse("REGISTRATION_FORM_NOT_FOUND", 404);
  }
  if (form.status !== "live") {
    return errorResponse("REGISTRATION_FORM_NOT_LIVE", 409);
  }

  const { error: insertError } = await onzio
    .from("registration_responses")
    .insert({
      club_id: clubId,
      form_id: form.id,
      payment_status: "not_required",
      ...parsed.submission,
    });
  if (insertError) {
    return errorResponse("REGISTRATION_SUBMISSION_FAILED", 500);
  }

  return NextResponse.json({ received: true });
}
