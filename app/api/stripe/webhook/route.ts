import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import { getStripeRuntimeConfig } from "@/lib/stripe-config";
import {
  resolveStripeEvent,
  verifyWebhookEvent,
} from "@/lib/stripe-event-routing";
import { resolveSubscriptionAccess } from "@/lib/subscription-state";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export const runtime = "nodejs";

const REQUIRED_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  if (current) return typeof current === "string" ? current : current.id;

  const legacy = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  return typeof legacy.subscription === "string"
    ? legacy.subscription
    : legacy.subscription?.id ?? null;
}

function eventSubscriptionId(event: Stripe.Event): string | null {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    return (event.data.object as Stripe.Subscription).id;
  }
  if (event.type === "checkout.session.completed") {
    const value = (event.data.object as Stripe.Checkout.Session).subscription;
    return typeof value === "string" ? value : value?.id ?? null;
  }
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_failed"
  ) {
    return invoiceSubscriptionId(event.data.object as Stripe.Invoice);
  }
  return null;
}

async function canonicalSubscription(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<Stripe.Subscription> {
  if (event.type === "customer.subscription.deleted") {
    return event.data.object as Stripe.Subscription;
  }
  const subscriptionId = eventSubscriptionId(event);
  if (!subscriptionId) throw new ContractError("SUBSCRIPTION_REQUIRED");
  return stripe.subscriptions.retrieve(subscriptionId);
}

function metadataClubId(subscription: Stripe.Subscription): string | null {
  const value = subscription.metadata?.onzio_club_id;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

function subscriptionCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
}

function currentState(row: {
  club_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  last_applied_stripe_event_id: string | null;
  last_applied_stripe_event_created_at: string | null;
  status: string | null;
  grace_ends_at: string | null;
} | null) {
  if (!row) return null;
  return {
    clubId: row.club_id,
    customerId: row.stripe_customer_id,
    subscriptionId: row.stripe_subscription_id,
    lastEventId: row.last_applied_stripe_event_id,
    lastEventCreated: row.last_applied_stripe_event_created_at
      ? Math.floor(Date.parse(row.last_applied_stripe_event_created_at) / 1000)
      : null,
    status: row.status,
    graceEndsAt: row.grace_ends_at,
  };
}

export async function POST(request: Request) {
  let config: ReturnType<typeof getStripeRuntimeConfig>;
  try {
    config = getStripeRuntimeConfig();
  } catch {
    return NextResponse.json(
      { error: "WEBHOOK_CONFIGURATION_INVALID" },
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

  if (!REQUIRED_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const service = createServiceRoleClient().schema("onzio");
  const { data: priorEvent, error: priorEventError } = await service
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (priorEventError) {
    return NextResponse.json({ error: "LEDGER_READ_FAILED" }, { status: 500 });
  }
  if (priorEvent) {
    return NextResponse.json({
      received: true,
      rejected: "DUPLICATE_EVENT",
    });
  }

  const digest = createHash("sha256").update(payload).digest("hex");
  const stripe = getStripeClient();
  let subscription: Stripe.Subscription;
  let canonicalCustomer: Stripe.Customer | Stripe.DeletedCustomer;
  try {
    subscription = await canonicalSubscription(stripe, event);
    canonicalCustomer = await stripe.customers.retrieve(
      subscriptionCustomerId(subscription),
    );
  } catch {
    return NextResponse.json(
      { error: "CANONICAL_SUBSCRIPTION_FAILED" },
      { status: 500 },
    );
  }

  const clubId = metadataClubId(subscription);
  const { data: row, error: subscriptionReadError } = clubId
    ? await service
        .from("club_subscriptions")
        .select(
          "club_id,stripe_customer_id,stripe_subscription_id,last_applied_stripe_event_id,last_applied_stripe_event_created_at,status,grace_ends_at",
        )
        .eq("club_id", clubId)
        .maybeSingle()
    : { data: null, error: null };
  if (subscriptionReadError) {
    return NextResponse.json(
      { error: "SUBSCRIPTION_READ_FAILED" },
      { status: 500 },
    );
  }

  let projection: Record<string, unknown>;
  try {
    if (
      canonicalCustomer.deleted ||
      canonicalCustomer.metadata?.onzio_club_id !== clubId ||
      canonicalCustomer.metadata?.onzio_environment !==
        subscription.metadata?.onzio_environment
    ) {
      throw new ContractError("CUSTOMER_METADATA_MISMATCH");
    }
    projection = await resolveStripeEvent(
      {
        ...event,
        data: { object: subscription },
      } as unknown as Record<string, unknown>,
      currentState(row),
      config,
    );
  } catch (error) {
    const code =
      error instanceof ContractError ? error.code : "INVALID_STRIPE_EVENT";
    const { error: ledgerError } = await service.rpc(
      "record_stripe_rejection",
      {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: new Date(event.created * 1000).toISOString(),
        p_environment: config.ledgerEnvironment,
        p_club_id: clubId,
        p_payload_digest: digest,
        p_rejection_code: code,
      },
    );
    if (ledgerError) {
      return NextResponse.json(
        { error: "REJECTION_LEDGER_FAILED" },
        { status: 500 },
      );
    }
    return NextResponse.json({ received: true, rejected: code });
  }

  const runtimeAccess = resolveSubscriptionAccess(
    {
      status: projection.status,
      paidThrough: projection.paidThrough,
      graceEndsAt: projection.graceEndsAt,
    },
    new Date(),
  );
  const graceEndsAt =
    runtimeAccess.graceEndsAt ??
    (typeof projection.graceEndsAt === "string"
      ? projection.graceEndsAt
      : null);

  const { data: applied, error: applyError } = await service.rpc(
    "apply_stripe_projection",
    {
      p_event_id: projection.eventId as string,
      p_event_type: projection.eventType as string,
      p_stripe_created_at: new Date(
        (projection.eventCreated as number) * 1000,
      ).toISOString(),
      p_environment: config.ledgerEnvironment,
      p_club_id: projection.clubId as string,
      p_customer_id: projection.customerId as string,
      p_subscription_id: projection.subscriptionId as string,
      p_price_id: projection.priceId as string,
      p_status: projection.status as string,
      p_cancel_at_period_end: projection.cancelAtPeriodEnd as boolean,
      p_paid_through: (projection.paidThrough as string | null) ?? null,
      p_grace_ends_at: graceEndsAt,
      p_public_access: runtimeAccess.publicAccess,
      p_payload_digest: digest,
    },
  );
  if (applyError) {
    return NextResponse.json(
      { error: "TRANSACTION_ROLLED_BACK" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true, result: applied });
}
