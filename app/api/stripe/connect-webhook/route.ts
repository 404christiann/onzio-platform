import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";
import {
  recordRegistrationNotificationFailure,
  sendRegistrationNotifications,
} from "@/lib/email/send-registration-notifications";
import { RegistrationInfrastructureError } from "@/lib/registration-infrastructure-error";
import {
  applyRegistrationCheckoutEvent,
  applyRegistrationConnectEvent,
  applyRegistrationRefundEvent,
  getClubConnectRecordByAccount,
  getRegistrationPaymentProjection,
  recordRegistrationStripeRejection,
  stripeEventExists,
} from "@/lib/registration-service";
import { getStripeClient } from "@/lib/stripe-client";
import { mapConnectAccountStatus } from "@/lib/stripe-connect";
import { getStripeRegistrationRuntimeConfig } from "@/lib/stripe-config";
import { verifyWebhookEvent } from "@/lib/stripe-event-routing";

export const runtime = "nodejs";

const REQUIRED_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "charge.refunded",
  "account.updated",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function id(value: unknown, code: string): string {
  if (typeof value !== "string" || !value) throw new ContractError(code);
  return value;
}

function uuid(value: unknown, code: string): string {
  const result = id(value, code);
  if (!UUID.test(result)) throw new ContractError(code);
  return result;
}

function paymentIntentId(
  value: string | Stripe.PaymentIntent | null,
): string {
  return id(typeof value === "string" ? value : value?.id, "PAYMENT_INTENT_REQUIRED");
}

async function notifyWithoutAffectingPayment(registrationId: string) {
  try {
    await sendRegistrationNotifications(registrationId);
  } catch (error) {
    // The Stripe projection is already committed; email cannot invalidate it.
    await recordRegistrationNotificationFailure(registrationId, error);
  }
}

function infrastructureFailure(error: unknown) {
  console.error("Stripe Connect webhook infrastructure failure", error);
  return NextResponse.json(
    { error: "CONNECT_EVENT_PROCESSING_FAILED" },
    { status: 500 },
  );
}

function isInfrastructureFailure(error: unknown): boolean {
  return error instanceof RegistrationInfrastructureError ||
    !(error instanceof ContractError);
}

export async function POST(request: Request) {
  let config: ReturnType<typeof getStripeRegistrationRuntimeConfig>;
  try {
    config = getStripeRegistrationRuntimeConfig();
  } catch {
    return NextResponse.json(
      { error: "CONNECT_WEBHOOK_CONFIGURATION_INVALID" },
      { status: 500 },
    );
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = verifyWebhookEvent({
      payload,
      signature,
      secret: config.webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }
  const expectedLivemode = config.ledgerEnvironment === "production";
  if (event.livemode !== expectedLivemode) {
    return NextResponse.json(
      { error: "STRIPE_EVENT_MODE_MISMATCH" },
      { status: 400 },
    );
  }
  if (!REQUIRED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }
  const stripe = getStripeClient();
  const digest = createHash("sha256").update(payload).digest("hex");
  const stripeCreatedAt = new Date(event.created * 1000).toISOString();
  let stripeAccountId: string;
  let connect: NonNullable<Awaited<ReturnType<typeof getClubConnectRecordByAccount>>>;
  try {
    if (await stripeEventExists(event.id)) {
      return NextResponse.json({ received: true, rejected: "DUPLICATE_EVENT" });
    }

    const eventAccount = typeof event.account === "string" ? event.account : null;
    if (!eventAccount) {
      return NextResponse.json({ error: "CONNECTED_ACCOUNT_REQUIRED" }, { status: 400 });
    }
    stripeAccountId = eventAccount;
    const connectedRecord = await getClubConnectRecordByAccount(stripeAccountId);
    if (!connectedRecord || connectedRecord.environment !== config.ledgerEnvironment) {
      return NextResponse.json({ error: "UNKNOWN_CONNECTED_ACCOUNT" }, { status: 400 });
    }
    connect = connectedRecord;
  } catch (error) {
    return infrastructureFailure(error);
  }

  try {
    let result: unknown;
    if (event.type === "checkout.session.completed") {
      const eventSession = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(
        eventSession.id,
        {},
        { stripeAccount: stripeAccountId },
      );
      const registrationId = uuid(
        session.metadata?.registration_id,
        "REGISTRATION_METADATA_REQUIRED",
      );
      const clubId = uuid(session.metadata?.onzio_club_id, "CLUB_METADATA_REQUIRED");
      const formId = uuid(
        session.metadata?.registration_form_id,
        "FORM_METADATA_REQUIRED",
      );
      const registration = await getRegistrationPaymentProjection({
        clubId: connect.club_id,
        registrationId,
      });
      if (
        clubId !== connect.club_id ||
        session.metadata?.onzio_ledger_environment !== config.ledgerEnvironment ||
        session.client_reference_id !== registrationId ||
        session.mode !== "payment" ||
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        session.currency !== "usd" ||
        typeof session.amount_total !== "number" ||
        !registration ||
        registration.form_id !== formId ||
        registration.amount_cents !== session.amount_total ||
        registration.stripe_checkout_session_id !== session.id
      ) {
        throw new ContractError("REGISTRATION_CHECKOUT_MISMATCH");
      }
      result = await applyRegistrationCheckoutEvent({
        eventId: event.id,
        stripeCreatedAt,
        clubId,
        registrationId,
        checkoutSessionId: session.id,
        paymentIntentId: paymentIntentId(session.payment_intent),
        amountTotal: session.amount_total,
        payloadDigest: digest,
      });
      if (
        result && typeof result === "object" &&
        (result as { action?: unknown }).action === "applied"
      ) {
        await notifyWithoutAffectingPayment(registrationId);
      }
    } else if (event.type === "charge.refunded") {
      const eventCharge = event.data.object as Stripe.Charge;
      const charge = await stripe.charges.retrieve(
        eventCharge.id,
        {},
        { stripeAccount: stripeAccountId },
      );
      const intentId = paymentIntentId(charge.payment_intent);
      const registration = await getRegistrationPaymentProjection({
        clubId: connect.club_id,
        paymentIntentId: intentId,
      });
      if (
        !registration ||
        charge.currency !== "usd" ||
        charge.amount_refunded <= 0 ||
        charge.amount_refunded > registration.amount_cents
      ) {
        throw new ContractError("REGISTRATION_REFUND_MISMATCH");
      }
      result = await applyRegistrationRefundEvent({
        eventId: event.id,
        stripeCreatedAt,
        clubId: connect.club_id,
        registrationId: registration.id,
        paymentIntentId: intentId,
        amountRefunded: charge.amount_refunded,
        payloadDigest: digest,
      });
    } else {
      const account = await stripe.accounts.retrieve(stripeAccountId);
      const status = mapConnectAccountStatus(account, config);
      if (
        status.stripeAccountId !== stripeAccountId ||
        account.metadata?.onzio_club_id !== connect.club_id ||
        account.metadata?.onzio_deploy_environment !== config.environment
      ) {
        throw new ContractError("CONNECT_ACCOUNT_MISMATCH");
      }
      result = await applyRegistrationConnectEvent({
        eventId: event.id,
        stripeCreatedAt,
        clubId: connect.club_id,
        stripeAccountId,
        chargesEnabled: status.chargesEnabled,
        detailsSubmitted: status.detailsSubmitted,
        payoutsEnabled: status.payoutsEnabled,
        payloadDigest: digest,
      });
    }

    return NextResponse.json({ received: true, result });
  } catch (error) {
    if (isInfrastructureFailure(error)) return infrastructureFailure(error);
    const code = error instanceof ContractError
      ? error.code
      : "CONNECT_EVENT_CANONICAL_READ_FAILED";
    try {
      await recordRegistrationStripeRejection({
        eventId: event.id,
        eventType: event.type,
        stripeCreatedAt,
        clubId: connect.club_id,
        payloadDigest: digest,
        rejectionCode: code,
      });
    } catch {
      return NextResponse.json(
        { error: "CONNECT_REJECTION_LEDGER_FAILED" },
        { status: 500 },
      );
    }
    return NextResponse.json({ received: true, rejected: code });
  }
}
