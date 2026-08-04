import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clubs } from "../fixtures/entities";
import { STRIPE_IDS, stripeEvent, stripeEvents } from "../fixtures/stripe";
import { expectContractError, loadContract } from "../helpers/contract";

const DIVERSE_CITY_TEST_PRICE = "price_1U0Y0sK6WajTkwHYnnttR9nN";

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

describe("PLAT-102 per-club billing intent", () => {
  it("uses the server-owned club Price and never accepts a client tier or Price", async () => {
    const buildCheckoutDecision = await loadContract<BuildCheckoutDecision>(
      "@/lib/stripe-event-routing",
      "buildCheckoutDecision",
    );
    const club = {
      ...clubs.alpha,
      kind: "customer",
      stripePriceId: DIVERSE_CITY_TEST_PRICE,
    };

    expect(
      buildCheckoutDecision({
        club,
        currentSubscription: null,
        config: { environment: "staging" },
      }),
    ).toEqual({
      destination: "checkout",
      priceId: DIVERSE_CITY_TEST_PRICE,
      metadata: {
        onzio_club_id: clubs.alpha.id,
        onzio_environment: "staging",
      },
    });

    await expectContractError(
      () =>
        buildCheckoutDecision({
          club,
          requestedPriceId: STRIPE_IDS.proPrice,
          currentSubscription: null,
          config: { environment: "staging" },
        }),
      "UNTRUSTED_BILLING_INPUT",
    );
    await expectContractError(
      () =>
        buildCheckoutDecision({
          club,
          requestedTier: "pro",
          currentSubscription: null,
          config: { environment: "staging" },
        }),
      "UNTRUSTED_BILLING_INPUT",
    );
  });

  it("does not create Checkout for demo or test clubs", async () => {
    const buildCheckoutDecision = await loadContract<BuildCheckoutDecision>(
      "@/lib/stripe-event-routing",
      "buildCheckoutDecision",
    );

    for (const kind of ["demo", "test"] as const) {
      await expectContractError(
        () =>
          buildCheckoutDecision({
            club: {
              ...clubs.alpha,
              kind,
              stripePriceId: null,
            },
            currentSubscription: null,
            config: { environment: "staging" },
          }),
        "BILLING_NOT_REQUIRED",
      );
    }
  });

  it("projects any canonical Stripe-reported Price without tier mapping", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    const arbitraryPrice = "price_negotiated_future_customer";
    const result = await resolveStripeEvent(
      stripeEvent(
        { id: "evt_negotiated_price" },
        { items: { data: [{ price: { id: arbitraryPrice } }] } },
      ),
      {
        clubId: clubs.alpha.id,
        customerId: STRIPE_IDS.alphaCustomer,
        subscriptionId: STRIPE_IDS.currentSubscription,
        lastEventId: "evt_previous",
        lastEventCreated: 1784500000,
        status: "active",
        graceEndsAt: null,
      },
      { environment: "production" },
    );

    expect(result).toMatchObject({ action: "apply", priceId: arbitraryPrice });
    expect(result).not.toHaveProperty("tier");
  });

  it("rejects trialing because PLAT-102 has no trial state", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expectContractError(
      () =>
        resolveStripeEvent(
          stripeEvent(
            { id: "evt_trialing" },
            { status: "trialing" },
          ),
          null,
          { environment: "production" },
        ),
      "TRIALING_NOT_SUPPORTED",
    );
  });

  it("keeps Portal self-service limited to cards and invoices", async () => {
    const portalCapabilities = await loadContract<() => Record<string, unknown>>(
      "@/lib/stripe-portal",
      "stripePortalCapabilities",
    );
    expect(portalCapabilities()).toEqual({
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    });
  });

  it("contains no runtime imports of the deleted tier gate", async () => {
    const candidates = [
      "lib/authorization.ts",
      "lib/media-processing.ts",
      "components/AdminShell.tsx",
      "app/admin/(protected)/programs/page.tsx",
      "app/admin/(protected)/tryouts/page.tsx",
      "app/api/stripe/checkout/route.ts",
      "app/api/stripe/webhook/route.ts",
    ];
    for (const candidate of candidates) {
      const source = await readFile(resolve(process.cwd(), candidate), "utf8");
      expect(source, candidate).not.toContain("clubHasFeature");
      expect(source, candidate).not.toContain("stripe-tiers");
    }
  });

  it("does not keep unknown Price rejection in the accepted webhook path", async () => {
    const resolveStripeEvent = await loadContract<ResolveStripeEvent>(
      "@/lib/stripe-event-routing",
      "resolveStripeEvent",
    );
    await expect(
      resolveStripeEvent(stripeEvents.unknownPrice, null, {
        environment: "production",
      }),
    ).resolves.toMatchObject({ priceId: "price_unknown" });
  });
});
