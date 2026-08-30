import { NextResponse } from "next/server";
import {
  isMonitoredResendEvent,
  sanitizeResendEvent,
  verifyResendWebhook,
} from "@/lib/resend-webhook";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const webhookId = request.headers.get("svix-id") ?? "";
  let event: Record<string, unknown>;
  try {
    event = verifyResendWebhook({
      payload,
      webhookId,
      webhookTimestamp: request.headers.get("svix-timestamp") ?? "",
      webhookSignature: request.headers.get("svix-signature") ?? "",
      secret: process.env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  if (!isMonitoredResendEvent(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  let sanitized: ReturnType<typeof sanitizeResendEvent>;
  try {
    sanitized = sanitizeResendEvent(event, webhookId);
  } catch {
    return NextResponse.json({ error: "INVALID_EVENT" }, { status: 400 });
  }

  const onzio = createServiceRoleClient().schema("onzio");
  const { data: existing, error: readError } = await onzio
    .from("email_delivery_events")
    .select("id")
    .eq("id", sanitized.id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "DELIVERY_LEDGER_FAILED" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { error } = await onzio.from("email_delivery_events").insert({
    id: sanitized.id,
    event_type: sanitized.eventType,
    provider_email_id: sanitized.providerEmailId,
    occurred_at: sanitized.occurredAt,
    payload_digest: sanitized.payloadDigest,
  });
  if (error?.code === "23505") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (error) {
    return NextResponse.json({ error: "DELIVERY_LEDGER_FAILED" }, { status: 500 });
  }

  console.log(JSON.stringify({ event: "email.delivery_event", type: sanitized.eventType }));
  return NextResponse.json({ received: true });
}
