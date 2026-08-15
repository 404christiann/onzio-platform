import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  buildContactOutboundMessage,
  parseContactInbound,
} from "@/lib/contact-inbound";
import { fetchContactProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same verified-UUID gate as lib/queries.ts's requireVerifiedClubId: the
// header value must already be a well-formed club UUID or the request is
// treated as tenantless and fails closed.
const CLUB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function errorResponse(code: string, status: number, message = code) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Public contact-form send. Template-agnostic platform capability: any
 * club's public site may POST here; nothing in this route is specific to a
 * presentation template.
 *
 * Tenant identity comes exclusively from the `x-onzio-club-id` /
 * `x-onzio-club-slug` headers, which middleware.ts deletes from every
 * inbound request and re-sets from the verified tenant resolution before
 * the request reaches this handler (only `/api/stripe/webhook` bypasses
 * middleware). A club identifier in the request body is never trusted.
 */
export async function POST(request: Request) {
  const clubId = request.headers.get("x-onzio-club-id") ?? "";
  const clubSlug = request.headers.get("x-onzio-club-slug") ?? "";
  if (!CLUB_ID_PATTERN.test(clubId) || !clubSlug) {
    return errorResponse("UNKNOWN_TENANT", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_CONTACT_PAYLOAD", 400);
  }

  const parsed = parseContactInbound(body);
  if (parsed.outcome === "invalid") {
    return errorResponse("INVALID_CONTACT_PAYLOAD", 400, parsed.message);
  }
  if (parsed.outcome === "dropped") {
    // Honeypot tripped: respond exactly like a success (checked before the
    // configuration gate so bots never learn anything from this endpoint)
    // and send nothing.
    return NextResponse.json({ received: true });
  }

  // Explicit fail-closed configuration gate: a missing API key or sender
  // must surface as an error, never as a fake success that quietly drops a
  // real inquiry. ONZIO_CONTACT_FROM must be a Resend-verified sender.
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ONZIO_CONTACT_FROM?.trim();
  if (!apiKey || !from) {
    return errorResponse(
      "CONTACT_SEND_NOT_CONFIGURED",
      503,
      "Outbound contact email is not configured (RESEND_API_KEY / ONZIO_CONTACT_FROM).",
    );
  }

  const onzio = (await createClient()).schema("onzio");

  const { data: club, error: clubError } = await onzio
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .maybeSingle();
  if (clubError || !club) {
    return errorResponse("UNKNOWN_TENANT", 404);
  }

  // Recipient: the club's own contact_profile email when set, otherwise the
  // platform-level fallback inbox.
  let profileEmail = "";
  try {
    const profile = await fetchContactProfile(clubId, onzio);
    profileEmail = profile?.publicEmail.trim() ?? "";
  } catch {
    return errorResponse("CONTACT_RECIPIENT_LOOKUP_FAILED", 500);
  }
  const fallbackTo = process.env.ONZIO_CONTACT_FALLBACK_TO?.trim() ?? "";
  const to = PUBLIC_EMAIL_PATTERN.test(profileEmail) ? profileEmail : fallbackTo;
  if (!PUBLIC_EMAIL_PATTERN.test(to)) {
    return errorResponse(
      "CONTACT_SEND_NOT_CONFIGURED",
      503,
      "No contact recipient configured (contact_profile email / ONZIO_CONTACT_FALLBACK_TO).",
    );
  }

  const message = buildContactOutboundMessage({
    clubName: club.name,
    from,
    to,
    submission: parsed.submission,
  });

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from: message.from,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
  });
  if (sendError) {
    return errorResponse("CONTACT_SEND_FAILED", 502, sendError.message);
  }

  return NextResponse.json({ received: true });
}
