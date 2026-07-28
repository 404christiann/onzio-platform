import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_CONFIRMATION = `phase-7-stripe:${EXPECTED_PROJECT_REF}`;
const ALPHA_SLUG = "alpha";
const BRAVO_SLUG = "bravo";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingTarget() {
  if (required("ONZIO_PHASE7_CONFIRM") !== EXPECTED_CONFIRMATION) {
    throw new Error(`ONZIO_PHASE7_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  if (!required("STRIPE_SECRET_KEY").startsWith("sk_test_")) {
    throw new Error("A Stripe test secret key is required");
  }
  if (!required("STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) {
    throw new Error("A Stripe webhook secret is required");
  }
  required("VERCEL_AUTOMATION_BYPASS_SECRET");
}

function eventId(label: string): string {
  return `evt_phase7_${label}_${randomUUID().replaceAll("-", "")}`;
}

async function signedWebhook(
  event: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: required("STRIPE_WEBHOOK_SECRET"),
  });
  const response = await fetch(
    "https://onzio-platform-staging-git-staging-404christianns-projects.vercel.app/api/stripe/webhook",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
        "x-vercel-protection-bypass": required(
          "VERCEL_AUTOMATION_BYPASS_SECRET",
        ),
      },
      body: payload,
    },
  );
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `Webhook returned HTTP ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

function expectRejection(
  result: Record<string, unknown>,
  code: string,
): void {
  if (result.rejected !== code) {
    throw new Error(
      `Expected ${code}, received ${String(result.rejected ?? "no rejection")}`,
    );
  }
}

async function waitForStarterProjection(
  clubId: string,
  subscriptionId: string,
): Promise<void> {
  const onzio = createServiceRoleClient().schema("onzio");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await onzio
      .from("club_subscriptions")
      .select("stripe_subscription_id,price_id,tier,status")
      .eq("club_id", clubId)
      .maybeSingle();
    if (error) throw error;
    if (
      data?.stripe_subscription_id === subscriptionId &&
      data.price_id === required("STRIPE_PRICE_ID_STARTER") &&
      data.tier === "starter" &&
      data.status === "active"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Starter projection was not restored");
}

async function main() {
  assertStagingTarget();
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: clubs, error: clubsError } = await onzio
    .from("clubs")
    .select("id,slug")
    .in("slug", [ALPHA_SLUG, BRAVO_SLUG]);
  if (clubsError || clubs?.length !== 2) {
    throw clubsError ?? new Error("Expected Alpha and Bravo staging clubs");
  }
  const alphaId = clubs.find((club) => club.slug === ALPHA_SLUG)?.id;
  const bravoId = clubs.find((club) => club.slug === BRAVO_SLUG)?.id;
  if (!alphaId || !bravoId) throw new Error("Synthetic club IDs are missing");

  const { data: projected, error: projectionError } = await onzio
    .from("club_subscriptions")
    .select(
      "stripe_customer_id,stripe_subscription_id,last_applied_stripe_event_id,last_applied_stripe_event_created_at",
    )
    .eq("club_id", alphaId)
    .single();
  if (projectionError) throw projectionError;
  if (
    !projected.stripe_customer_id ||
    !projected.stripe_subscription_id ||
    !projected.last_applied_stripe_event_id ||
    !projected.last_applied_stripe_event_created_at
  ) {
    throw new Error("Alpha must have a projected Stripe subscription");
  }

  const stripe = new Stripe(required("STRIPE_SECRET_KEY"));
  const subscription = await stripe.subscriptions.retrieve(
    projected.stripe_subscription_id,
  );
  const customer = await stripe.customers.retrieve(
    projected.stripe_customer_id,
  );
  if (customer.deleted) throw new Error("Synthetic Stripe customer was deleted");
  const item = subscription.items.data[0];
  if (!item || subscription.items.data.length !== 1) {
    throw new Error("Expected exactly one subscription item");
  }
  const configuredStarter = required("STRIPE_PRICE_ID_STARTER");
  if (item.price.id !== configuredStarter) {
    throw new Error("Alpha subscription must begin on Starter");
  }

  const originalCustomerMetadata = {
    onzio_club_id: customer.metadata.onzio_club_id,
    onzio_environment: customer.metadata.onzio_environment,
  };
  const originalSubscriptionMetadata = {
    onzio_club_id: subscription.metadata.onzio_club_id,
    onzio_environment: subscription.metadata.onzio_environment,
  };
  let foreignPrice: Stripe.Price | null = null;

  try {
    const priorEvent = await stripe.events.retrieve(
      projected.last_applied_stripe_event_id,
    );
    const duplicate = await signedWebhook(
      JSON.parse(JSON.stringify(priorEvent)) as Record<string, unknown>,
    );
    expectRejection(duplicate, "DUPLICATE_EVENT");

    const stale = await signedWebhook({
      id: eventId("stale"),
      object: "event",
      api_version: "2026-06-24.dahlia",
      created:
        Math.floor(
          Date.parse(projected.last_applied_stripe_event_created_at) / 1000,
        ) - 1,
      data: { object: { id: subscription.id } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.updated",
    });
    expectRejection(stale, "STALE_EVENT");

    await stripe.customers.update(customer.id, {
      metadata: {
        onzio_club_id: alphaId,
        onzio_environment: "production",
      },
    });
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        onzio_club_id: alphaId,
        onzio_environment: "production",
      },
      proration_behavior: "none",
    });
    const foreignEnvironment = await signedWebhook({
      id: eventId("foreign_environment"),
      object: "event",
      api_version: "2026-06-24.dahlia",
      created: Math.floor(Date.now() / 1000) + 5,
      data: { object: { id: subscription.id } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.updated",
    });
    expectRejection(foreignEnvironment, "FOREIGN_ENVIRONMENT");

    await stripe.customers.update(customer.id, {
      metadata: {
        onzio_club_id: bravoId,
        onzio_environment: "staging",
      },
    });
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        onzio_club_id: alphaId,
        onzio_environment: "staging",
      },
      proration_behavior: "none",
    });
    const customerMismatch = await signedWebhook({
      id: eventId("customer_mismatch"),
      object: "event",
      api_version: "2026-06-24.dahlia",
      created: Math.floor(Date.now() / 1000) + 10,
      data: { object: { id: subscription.id } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.updated",
    });
    expectRejection(customerMismatch, "CUSTOMER_METADATA_MISMATCH");

    await stripe.customers.update(customer.id, {
      metadata: {
        onzio_club_id: alphaId,
        onzio_environment: "staging",
      },
    });
    const starterPrice = await stripe.prices.retrieve(configuredStarter);
    const productId =
      typeof starterPrice.product === "string"
        ? starterPrice.product
        : starterPrice.product.id;
    foreignPrice = await stripe.prices.create({
      active: true,
      currency: "usd",
      product: productId,
      recurring: { interval: "month" },
      unit_amount: 1,
      metadata: { onzio_phase7_boundary: "unknown_price" },
    });
    await stripe.subscriptionItems.update(item.id, {
      price: foreignPrice.id,
      proration_behavior: "none",
    });
    const unknownPrice = await signedWebhook({
      id: eventId("unknown_price"),
      object: "event",
      api_version: "2026-06-24.dahlia",
      created: Math.floor(Date.now() / 1000) + 15,
      data: { object: { id: subscription.id } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "customer.subscription.updated",
    });
    expectRejection(unknownPrice, "UNKNOWN_PRICE");

    console.log(
      JSON.stringify({
        event: "phase7.stripe_webhook_verified",
        projectRef: EXPECTED_PROJECT_REF,
        subscriptionId: subscription.id,
        duplicateRejected: true,
        staleRejected: true,
        foreignEnvironmentRejected: true,
        customerMismatchRejected: true,
        unknownPriceRejected: true,
      }),
    );
  } finally {
    await stripe.customers.update(customer.id, {
      metadata: originalCustomerMetadata,
    });
    await stripe.subscriptions.update(subscription.id, {
      metadata: originalSubscriptionMetadata,
      proration_behavior: "none",
    });
    await stripe.subscriptionItems.update(item.id, {
      price: configuredStarter,
      proration_behavior: "none",
    });
    if (foreignPrice) {
      await stripe.prices.update(foreignPrice.id, { active: false });
    }
    await waitForStarterProjection(alphaId, subscription.id);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
