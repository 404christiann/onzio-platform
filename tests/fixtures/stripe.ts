export const STRIPE_IDS = {
  alphaCustomer: "cus_alpha",
  bravoCustomer: "cus_bravo",
  currentSubscription: "sub_alpha_current",
  obsoleteSubscription: "sub_alpha_obsolete",
  starterPrice: "price_test_starter",
  proPrice: "price_test_pro",
} as const;

const baseSubscription = {
  object: "subscription",
  id: STRIPE_IDS.currentSubscription,
  customer: STRIPE_IDS.alphaCustomer,
  status: "active",
  metadata: {
    onzio_club_id: "11111111-1111-4111-8111-111111111111",
    onzio_environment: "production",
  },
  items: {
    data: [
      {
        price: { id: STRIPE_IDS.proPrice },
        current_period_end: 1788134400,
      },
    ],
  },
};

export function stripeEvent(
  overrides: Record<string, unknown> = {},
  subscriptionOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const overriddenMetadata =
    typeof subscriptionOverrides.metadata === "object" &&
    subscriptionOverrides.metadata !== null
      ? (subscriptionOverrides.metadata as Record<string, unknown>)
      : {};
  return {
    id: "evt_current",
    object: "event",
    type: "customer.subscription.updated",
    created: 1785000000,
    livemode: true,
    data: {
      object: {
        ...structuredClone(baseSubscription),
        ...subscriptionOverrides,
        metadata: {
          ...baseSubscription.metadata,
          ...overriddenMetadata,
        },
      },
    },
    ...overrides,
  };
}

export const stripeEvents = {
  valid: stripeEvent(),
  duplicate: stripeEvent({ id: "evt_previous" }),
  stale: stripeEvent({ id: "evt_stale", created: 1784000000 }),
  reversed: stripeEvent({ id: "evt_reversed", created: 1783000000 }),
  foreignEnvironment: stripeEvent({
    id: "evt_foreign",
    data: {
      object: {
        ...structuredClone(baseSubscription),
        metadata: {
          ...baseSubscription.metadata,
          onzio_environment: "staging",
        },
      },
    },
  }),
  unknownPrice: stripeEvent({
    id: "evt_unknown_price",
    data: {
      object: {
        ...structuredClone(baseSubscription),
        items: { data: [{ price: { id: "price_unknown" } }] },
      },
    },
  }),
  mismatchedCustomer: stripeEvent({
    id: "evt_wrong_customer",
    data: {
      object: {
        ...structuredClone(baseSubscription),
        customer: STRIPE_IDS.bravoCustomer,
      },
    },
  }),
  obsoleteSubscriptionDeleted: stripeEvent({
    id: "evt_obsolete_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        ...structuredClone(baseSubscription),
        id: STRIPE_IDS.obsoleteSubscription,
        status: "canceled",
      },
    },
  }),
} as const;
