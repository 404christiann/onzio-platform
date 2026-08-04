import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { clubs } from "../fixtures/entities";
import { STRIPE_IDS, stripeEvent, stripeEvents } from "../fixtures/stripe";
import { expectContractError, loadContract } from "../helpers/contract";

type BuildCheckoutDecision = (input: Record<string, unknown>) => {
  destination: "checkout" | "portal";
  metadata?: Record<string, string>;
  priceId?: string;
};
type ResolveStripeEvent = (
  event: Record<string, unknown>,
  current: Record<string, unknown> | null,
  config: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
type ResolveSubscriptionAccess = (
  subscription: Record<string, unknown> | null,
  now: Date,
) => Record<string, unknown>;
type VerifyWebhookEvent = (input: {
  payload: string;
  signature: string;
  secret: string;
}) => Record<string, unknown>;

const currentState = {
  clubId: clubs.alpha.id,
  customerId: STRIPE_IDS.alphaCustomer,
  subscriptionId: STRIPE_IDS.currentSubscription,
  lastEventId: "evt_previous",
  lastEventCreated: 1784500000,
  status: "active",
  graceEndsAt: null,
};

describe("Stripe Checkout and Portal routing", () => {
  it("creates first Checkout from server-owned per-club Price intent", async () => {
    const buildCheckoutDecision = await loadContract<BuildCheckoutDecision>(
      "@/lib/stripe-event-routing",
      "buildCheckoutDecision",
    );
    expect(
      buildCheckoutDecision({
        club: {
          ...clubs.alpha,
          kind: "customer",
          stripePriceId: STRIPE_IDS.proPrice,
        },
        currentSubscription: null,
        config: { environment: "production" },
      }),
    ).toEqual({
      destination: "checkout",
      priceId: STRIPE_IDS.proPrice,
      metadata: {
        onzio_club_id: clubs.alpha.id,
        onzio_environment: "production",
      },
    });
  });

  it("routes an existing subscriber to Portal", async () => {
    const buildCheckoutDecision = await loadContract<BuildCheckoutDecision>(
      "@/lib/stripe-event-routing",
      "buildCheckoutDecision",
    );
    expect(
      buildCheckoutDecision({
        club: clubs.alpha,
        currentSubscription: currentState,
        config: { environment: "production" },
      }),
    ).toEqual({ destination: "portal" });
  });
});

describe("Stripe webhook state contract", () => {
  it("applies a canonical event without deriving or writing a tier", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    const result = await resolveStripeEvent(
      stripeEvents.valid,
      currentState,
      { environment: "production" },
    );
    expect(result).toMatchObject({
      action: "apply",
      clubId: clubs.alpha.id,
      customerId: STRIPE_IDS.alphaCustomer,
      subscriptionId: STRIPE_IDS.currentSubscription,
      priceId: STRIPE_IDS.proPrice,
    });
    expect(result).not.toHaveProperty("tier");
  });

  it.each([
    [stripeEvents.duplicate, "DUPLICATE_EVENT"],
    [stripeEvents.stale, "STALE_EVENT"],
    [stripeEvents.reversed, "STALE_EVENT"],
    [stripeEvents.foreignEnvironment, "FOREIGN_ENVIRONMENT"],
    [stripeEvents.mismatchedCustomer, "CUSTOMER_MISMATCH"],
    [stripeEvents.obsoleteSubscriptionDeleted, "OBSOLETE_SUBSCRIPTION"],
  ] as const)("rejects unsafe event %#", async (event, code) => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expectContractError(
      () => resolveStripeEvent(event, currentState, { environment: "production" }),
      code,
    );
  });

  it("does not partially apply a failed transactional update", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expectContractError(
      () =>
        resolveStripeEvent(stripeEvents.valid, currentState, {
          environment: "production",
          simulateRuntimeStateWriteFailure: true,
        }),
      "TRANSACTION_ROLLED_BACK",
    );
  });

  it("keeps the same subscription during reconciliation", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    const result = await resolveStripeEvent(
      stripeEvent(
        { id: "evt_rose_reconcile" },
        { metadata: { onzio_club_id: "33333333-3333-4333-8333-333333333333" } },
      ),
      { ...currentState, clubId: "33333333-3333-4333-8333-333333333333" },
      { environment: "production" },
    );
    expect(result.subscriptionId).toBe(STRIPE_IDS.currentSubscription);
    expect(result).not.toHaveProperty("replacementSubscriptionId");
  });
});

describe("webhook signature and 20-day access contract", () => {
  it("accepts a valid Stripe signature and rejects an invalid one", async () => {
    const verifyWebhookEvent = await loadContract<VerifyWebhookEvent>(
      "@/lib/stripe-event-routing",
      "verifyWebhookEvent",
    );
    const payload = JSON.stringify(stripeEvents.valid);
    const secret = "whsec_contract";
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyWebhookEvent({ payload, signature, secret })).toMatchObject({
      id: "evt_current",
    });
    await expectContractError(
      () => verifyWebhookEvent({ payload, signature: "invalid", secret }),
      "INVALID_SIGNATURE",
    );
  });

  it.each([
    ["active", "live"],
    ["trialing", "preview"],
    ["past_due", "grace"],
    ["canceled-before-grace", "grace"],
    ["canceled-after-grace", "suspended"],
  ])("maps %s subscription to %s", async (fixture, publicAccess) => {
    const resolveSubscriptionAccess =
      await loadContract<ResolveSubscriptionAccess>(
        "@/lib/subscription-state",
        "resolveSubscriptionAccess",
      );
    expect(
      resolveSubscriptionAccess(
        { fixture, currentPeriodEnd: "2026-07-23T00:00:00Z" },
        new Date("2026-07-26T00:00:00Z"),
      ),
    ).toMatchObject({ publicAccess });
  });
});
