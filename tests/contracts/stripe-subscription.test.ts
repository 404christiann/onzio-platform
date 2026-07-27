import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { clubs } from "../fixtures/entities";
import {
  STRIPE_IDS,
  stripeEvent,
  stripeEvents,
} from "../fixtures/stripe";
import { expectContractError, loadContract } from "../helpers/contract";

type PriceIdForTier = (tier: "starter" | "pro") => string;
type TierForPriceId = (priceId: string) => "starter" | "pro";
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

const stripeConfig = {
  environment: "production",
  starterPriceId: STRIPE_IDS.starterPrice,
  proPriceId: STRIPE_IDS.proPrice,
};

const currentState = {
  clubId: clubs.alpha.id,
  customerId: STRIPE_IDS.alphaCustomer,
  subscriptionId: STRIPE_IDS.currentSubscription,
  lastEventId: "evt_previous",
  lastEventCreated: 1784500000,
  tier: "pro",
  status: "active",
};

describe("Stripe tier and checkout contract", () => {
  it.each([
    ["starter", STRIPE_IDS.starterPrice],
    ["pro", STRIPE_IDS.proPrice],
  ] as const)("maps %s to its allowlisted price", async (tier, priceId) => {
    const priceIdForTier = await loadContract<PriceIdForTier>(
      "@/lib/stripe-tiers",
      "priceIdForTier",
    );
    expect(priceIdForTier(tier)).toBe(priceId);
  });

  it.each([
    [STRIPE_IDS.starterPrice, "starter"],
    [STRIPE_IDS.proPrice, "pro"],
  ] as const)("maps %s to %s", async (priceId, tier) => {
    const tierForPriceId = await loadContract<TierForPriceId>(
      "@/lib/stripe-tiers",
      "tierForPriceId",
    );
    expect(tierForPriceId(priceId)).toBe(tier);
  });

  it("rejects an unknown price", async () => {
    const tierForPriceId = await loadContract<TierForPriceId>(
      "@/lib/stripe-tiers",
      "tierForPriceId",
    );
    await expectContractError(
      () => tierForPriceId("price_attacker_controlled"),
      "UNKNOWN_PRICE",
    );
  });

  it("creates first Checkout with club and environment metadata", async () => {
    const buildCheckoutDecision = await loadContract<BuildCheckoutDecision>(
      "@/lib/stripe-event-routing",
      "buildCheckoutDecision",
    );
    expect(
      buildCheckoutDecision({
        club: clubs.alpha,
        requestedTier: "pro",
        currentSubscription: null,
        config: stripeConfig,
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
        requestedTier: "starter",
        currentSubscription: currentState,
        config: stripeConfig,
      }),
    ).toMatchObject({ destination: "portal" });
  });
});

describe("Stripe webhook state contract", () => {
  it("applies the current valid event", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expect(
      resolveStripeEvent(stripeEvents.valid, currentState, stripeConfig),
    ).resolves.toMatchObject({
      action: "apply",
      clubId: clubs.alpha.id,
      customerId: STRIPE_IDS.alphaCustomer,
      subscriptionId: STRIPE_IDS.currentSubscription,
      tier: "pro",
    });
  });

  it.each([
    [stripeEvents.duplicate, "DUPLICATE_EVENT"],
    [stripeEvents.stale, "STALE_EVENT"],
    [stripeEvents.reversed, "STALE_EVENT"],
    [stripeEvents.foreignEnvironment, "FOREIGN_ENVIRONMENT"],
    [stripeEvents.unknownPrice, "UNKNOWN_PRICE"],
    [stripeEvents.mismatchedCustomer, "CUSTOMER_MISMATCH"],
    [stripeEvents.obsoleteSubscriptionDeleted, "OBSOLETE_SUBSCRIPTION"],
  ] as const)("rejects unsafe event %#", async (event, code) => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expectContractError(
      () => resolveStripeEvent(event, currentState, stripeConfig),
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
          ...stripeConfig,
          simulateRuntimeStateWriteFailure: true,
        }),
      "TRANSACTION_ROLLED_BACK",
    );
  });

  it("keeps the same Rose City subscription during reconciliation", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    const result = await resolveStripeEvent(
      stripeEvent(
        { id: "evt_rose_reconcile" },
        {
          metadata: {
            onzio_club_id: "33333333-3333-4333-8333-333333333333",
          },
        },
      ),
      {
        ...currentState,
        clubId: "33333333-3333-4333-8333-333333333333",
      },
      stripeConfig,
    );
    expect(result.subscriptionId).toBe(STRIPE_IDS.currentSubscription);
    expect(result).not.toHaveProperty("replacementSubscriptionId");
  });
});

describe("webhook signature and subscription-access contract", () => {
  it("accepts a valid Stripe test signature", async () => {
    const verifyWebhookEvent = await loadContract<VerifyWebhookEvent>(
      "@/lib/stripe-event-routing",
      "verifyWebhookEvent",
    );
    const payload = JSON.stringify(stripeEvents.valid);
    const secret = "whsec_contract";
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    expect(
      verifyWebhookEvent({ payload, signature, secret }),
    ).toMatchObject({ id: "evt_current" });
  });

  it("rejects an invalid Stripe signature", async () => {
    const verifyWebhookEvent = await loadContract<VerifyWebhookEvent>(
      "@/lib/stripe-event-routing",
      "verifyWebhookEvent",
    );
    await expectContractError(
      () =>
        verifyWebhookEvent({
          payload: JSON.stringify(stripeEvents.valid),
          signature: "invalid",
          secret: "whsec_contract",
        }),
      "INVALID_SIGNATURE",
    );
  });

  it.each([
    ["active", "live"],
    ["trialing", "live"],
    ["past_due", "live"],
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
        {
          fixture,
          currentPeriodEnd: "2026-07-23T00:00:00Z",
        },
        new Date("2026-07-26T00:00:00Z"),
      ),
    ).toMatchObject({ publicAccess });
  });
});
