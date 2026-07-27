import Stripe from "stripe";
import { failContract } from "@/lib/contract-error";
import {
  resolveSubscriptionAccess,
  STRIPE_GRACE_PERIOD_MS,
} from "@/lib/subscription-state";
import {
  priceIdForTier,
  tierForPriceId,
  type StripeTier,
  type StripeTierConfig,
} from "@/lib/stripe-tiers";

type UnknownRecord = Record<string, unknown>;

type StripeRoutingConfig = StripeTierConfig & {
  environment?: unknown;
  simulateRuntimeStateWriteFailure?: unknown;
};

function record(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failContract("INVALID_STRIPE_EVENT");
  }
  return value as UnknownRecord;
}

function requiredString(value: unknown, code = "INVALID_STRIPE_EVENT"): string {
  if (typeof value !== "string" || !value) failContract(code);
  return value;
}

function objectId(value: unknown): string {
  if (typeof value === "string") return value;
  return requiredString(record(value).id);
}

function eventEnvironment(config: StripeRoutingConfig): "test" | "production" {
  if (config.environment === "production") return "production";
  if (config.environment === "test" || config.environment === "staging") {
    return "test";
  }
  failContract("STRIPE_ENVIRONMENT_INVALID");
}

export function buildCheckoutDecision(input: {
  club?: unknown;
  requestedTier?: unknown;
  currentSubscription?: unknown;
  config?: unknown;
}): {
  destination: "checkout" | "portal";
  metadata?: Record<string, string>;
  priceId?: string;
} {
  const club = record(input.club);
  const config = record(input.config) as StripeRoutingConfig;
  const clubId = requiredString(club.id, "INVALID_CLUB");

  if (input.currentSubscription) return { destination: "portal" };
  if (input.requestedTier !== "starter" && input.requestedTier !== "pro") {
    failContract("UNKNOWN_TIER");
  }

  return {
    destination: "checkout",
    priceId: priceIdForTier(input.requestedTier, config),
    metadata: {
      onzio_club_id: clubId,
      onzio_environment: requiredString(
        config.environment,
        "STRIPE_ENVIRONMENT_INVALID",
      ),
    },
  };
}

export function verifyWebhookEvent(input: {
  payload: string;
  signature: string;
  secret: string;
}): Stripe.Event {
  try {
    return Stripe.webhooks.constructEvent(
      input.payload,
      input.signature,
      input.secret,
    );
  } catch {
    failContract("INVALID_SIGNATURE");
  }
}

export async function resolveStripeEvent(
  eventValue: UnknownRecord,
  currentValue: UnknownRecord | null,
  configValue: UnknownRecord,
): Promise<UnknownRecord> {
  const event = record(eventValue);
  const current = currentValue ? record(currentValue) : null;
  const config = record(configValue) as StripeRoutingConfig;
  const eventId = requiredString(event.id);
  const eventType = requiredString(event.type);
  const eventCreated = event.created;
  if (typeof eventCreated !== "number" || !Number.isSafeInteger(eventCreated)) {
    failContract("INVALID_STRIPE_EVENT");
  }

  if (current?.lastEventId === eventId) failContract("DUPLICATE_EVENT");
  if (
    typeof current?.lastEventCreated === "number" &&
    eventCreated <= current.lastEventCreated
  ) {
    failContract("STALE_EVENT");
  }

  const subscription = record(record(event.data).object);
  const metadata = record(subscription.metadata);
  const configuredEnvironment = eventEnvironment(config);
  const metadataEnvironment = requiredString(metadata.onzio_environment);
  const expectedMetadataEnvironment =
    config.environment === "staging" ? "staging" : configuredEnvironment;
  const expectsLiveMode = configuredEnvironment === "production";
  if (
    metadataEnvironment !== expectedMetadataEnvironment ||
    (typeof event.livemode === "boolean" && event.livemode !== expectsLiveMode)
  ) {
    failContract("FOREIGN_ENVIRONMENT");
  }

  const clubId = requiredString(metadata.onzio_club_id);
  if (current && current.clubId !== clubId) failContract("CLUB_MISMATCH");

  const customerId = objectId(subscription.customer);
  if (current?.customerId && current.customerId !== customerId) {
    failContract("CUSTOMER_MISMATCH");
  }

  const subscriptionId = requiredString(subscription.id);
  if (
    current?.subscriptionId &&
    current.subscriptionId !== subscriptionId
  ) {
    if (eventType === "customer.subscription.deleted") {
      failContract("OBSOLETE_SUBSCRIPTION");
    }
    failContract("SUBSCRIPTION_MISMATCH");
  }

  const items = record(subscription.items).data;
  if (!Array.isArray(items) || items.length !== 1) {
    failContract("INVALID_SUBSCRIPTION_ITEMS");
  }
  const subscriptionItem = record(items[0]);
  const priceId = requiredString(record(subscriptionItem.price).id);
  const tier = tierForPriceId(priceId, config);
  const status = requiredString(subscription.status);
  const periodEnd =
    typeof subscriptionItem.current_period_end === "number"
      ? subscriptionItem.current_period_end
      : typeof subscription.current_period_end === "number"
        ? subscription.current_period_end
        : null;
  const paidThrough =
    periodEnd === null ? null : new Date(periodEnd * 1000).toISOString();
  const terminalStatus =
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete_expired";
  const access = resolveSubscriptionAccess(
    { status, paidThrough },
    new Date(eventCreated * 1000),
  );

  if (config.simulateRuntimeStateWriteFailure) {
    failContract("TRANSACTION_ROLLED_BACK");
  }

  return {
    action: "apply",
    eventId,
    eventType,
    eventCreated,
    clubId,
    customerId,
    subscriptionId,
    priceId,
    tier: tier as StripeTier,
    status,
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end === true ||
      typeof subscription.cancel_at === "number",
    paidThrough,
    graceEndsAt:
      terminalStatus && periodEnd !== null
        ? new Date(periodEnd * 1000 + STRIPE_GRACE_PERIOD_MS).toISOString()
        : null,
    publicAccess: access.publicAccess,
  };
}
