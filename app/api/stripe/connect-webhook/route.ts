import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";
import {
  connectWebhookSecrets,
  resolveConnectStripeCredentials,
} from "@/lib/stripe/connect-config";
import {
  checkoutPaymentIntentId,
  connectCheckoutMetadata,
  verifyConnectWebhookEvent,
} from "@/lib/stripe/connect-webhook";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

/**
 * Stripe **Connect** webhook endpoint for club registration payments.
 *
 * Separate endpoint, separate signing secret, separate replay ledger from
 * `app/api/stripe/webhook/route.ts`, which handles Onzio's own subscription
 * billing. Connect deliveries come from a different Stripe webhook endpoint
 * and are signed with that endpoint's secret; nothing is shared between the
 * two beyond the Stripe SDK itself.
 *
 * ## Status codes
 *
 * 400 only for a delivery that never verified — Stripe should retry a
 * transport problem but there is nothing to retry about a bad signature.
 * 200 with `rejected`/`ignored` for a verified event this endpoint will never
 * be able to apply (bad metadata, wrong account, already paid): retrying would
 * fail identically forever. 500 only for a fault that is plausibly transient,
 * and in that case the ledger row is removed first so Stripe's retry is
 * processed rather than dismissed as a duplicate.
 */

export const runtime = "nodejs";

const LEDGER = "stripe_connect_events";

export async function POST(request: Request) {
  const secrets = connectWebhookSecrets();
  if (secrets.length === 0) {
    // Stripe retains the response body per delivery attempt, so naming the
    // fault here is the only durable diagnostic (the DCFC-701 discipline).
    console.error("stripe connect webhook rejected: CONNECT_WEBHOOK_SECRET_MISSING");
    return NextResponse.json(
      { error: "CONNECT_WEBHOOK_SECRET_MISSING" },
      { status: 500 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = verifyConnectWebhookEvent({ payload, signature, secrets });
  } catch {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  const connectedAccountId =
    typeof event.account === "string" && event.account.startsWith("acct_")
      ? event.account
      : null;
  if (!connectedAccountId) {
    // A platform-scoped event reached the Connect endpoint. It cannot describe
    // a club payment, so acknowledge it rather than making Stripe retry.
    return NextResponse.json({
      received: true,
      ignored: "NOT_A_CONNECT_EVENT",
    });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({
      received: true,
      ignored: "UNHANDLED_EVENT_TYPE",
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const { clubId, formId, responseId } = connectCheckoutMetadata(session);

  const service = createServiceRoleClient().schema("onzio");
  const digest = createHash("sha256").update(payload).digest("hex");

  // Insert before any work is done. The event id is the primary key, so a
  // redelivery loses this race and is answered as a duplicate instead of
  // applying the payment twice.
  const { error: ledgerError } = await service.from(LEDGER).insert({
    id: event.id,
    club_id: clubId,
    connected_account_id: connectedAccountId,
    livemode: event.livemode === true,
    event_type: event.type,
    stripe_created_at: new Date(event.created * 1000).toISOString(),
    outcome: "received",
    payload_digest: digest,
  });
  if (ledgerError) {
    if (ledgerError.code === "23505") {
      return NextResponse.json({ received: true, rejected: "DUPLICATE_EVENT" });
    }
    return NextResponse.json({ error: "LEDGER_WRITE_FAILED" }, { status: 500 });
  }

  const close = async (
    outcome: "rejected" | "ignored",
    code: string,
  ): Promise<Response> => {
    await service
      .from(LEDGER)
      .update({ outcome, rejection_code: code })
      .eq("id", event.id);
    return NextResponse.json(
      outcome === "rejected"
        ? { received: true, rejected: code }
        : { received: true, ignored: code },
    );
  };

  // Releases the ledger row so Stripe's retry of a transient fault is
  // processed instead of being dismissed as a replay.
  const retryable = async (code: string): Promise<Response> => {
    await service.from(LEDGER).delete().eq("id", event.id);
    return NextResponse.json({ error: code }, { status: 500 });
  };

  if (!clubId || !responseId) {
    return close("rejected", "EVENT_METADATA_INVALID");
  }

  const { data: club, error: clubError } = await service
    .from("clubs")
    .select("id,stripe_connect_account_id,payments_live_enabled")
    .eq("id", clubId)
    .maybeSingle();
  if (clubError) return retryable("CLUB_READ_FAILED");
  if (!club) return close("rejected", "CLUB_NOT_FOUND");

  // The event's account must be the account Onzio recorded for this club.
  // Without this, an event carrying another club's metadata would be applied.
  if (club.stripe_connect_account_id !== connectedAccountId) {
    return close("rejected", "CONNECT_ACCOUNT_MISMATCH");
  }

  // The same live-mode gate the checkout path runs. A live delivery for a club
  // that may only transact in test mode is refused even if some future
  // endpoint configuration let it verify.
  let expectedLivemode: boolean;
  try {
    expectedLivemode =
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: club.payments_live_enabled === true,
      }).mode === "live";
  } catch (thrown) {
    return close(
      "rejected",
      thrown instanceof ContractError
        ? thrown.code
        : "CONNECT_CONFIGURATION_INVALID",
    );
  }
  if ((event.livemode === true) !== expectedLivemode) {
    return close("rejected", "LIVE_MODE_MISMATCH");
  }

  const { data: response, error: responseError } = await service
    .from("registration_responses")
    .select("id,club_id,form_id,payment_status,stripe_checkout_session_id")
    .eq("id", responseId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (responseError) return retryable("RESPONSE_READ_FAILED");
  if (!response) return close("rejected", "RESPONSE_NOT_FOUND");

  // Metadata round-trips through Stripe, so it is corroborated against the
  // session id Onzio itself stored when it created the Checkout Session.
  if (response.stripe_checkout_session_id !== session.id) {
    return close("rejected", "CHECKOUT_SESSION_MISMATCH");
  }
  if (formId && response.form_id !== formId) {
    return close("rejected", "FORM_MISMATCH");
  }
  if (response.payment_status === "paid") {
    return close("ignored", "ALREADY_PAID");
  }

  if (session.payment_status !== "paid") {
    return close("ignored", "SESSION_NOT_PAID");
  }

  const amountPaidCents = session.amount_total;
  if (!Number.isSafeInteger(amountPaidCents) || (amountPaidCents ?? 0) <= 0) {
    return close("rejected", "AMOUNT_INVALID");
  }

  const paidAt = new Date(event.created * 1000).toISOString();
  const { error: updateError } = await service
    .from("registration_responses")
    .update({
      payment_status: "paid",
      stripe_payment_intent_id: checkoutPaymentIntentId(session),
      amount_paid_cents: amountPaidCents,
      paid_at: paidAt,
    })
    .eq("id", responseId)
    .eq("club_id", clubId)
    // Second, database-level idempotency guard: a row already marked paid is
    // never rewritten, even if the ledger were somehow bypassed.
    .neq("payment_status", "paid");
  if (updateError) return retryable("RESPONSE_UPDATE_FAILED");

  const { error: applyError } = await service
    .from(LEDGER)
    .update({ outcome: "applied", applied_at: new Date().toISOString() })
    .eq("id", event.id);
  if (applyError) {
    // The payment is recorded; only the ledger outcome is stale. Retrying
    // would be dismissed as a duplicate and the response update is idempotent,
    // so acknowledge and surface the fault in logs.
    console.error(
      `stripe connect webhook ledger outcome not recorded for ${event.id}`,
    );
  }

  return NextResponse.json({ received: true, result: "PAID" });
}
