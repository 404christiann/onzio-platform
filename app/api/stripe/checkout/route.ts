import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";
import { ContractError } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import { checkoutIdempotencyKeys } from "@/lib/stripe-checkout-idempotency";
import {
  buildCheckoutDecision,
} from "@/lib/stripe-event-routing";
import {
  getStripeRuntimeConfig,
  stripeConfigurationErrorCode,
  verifiedClubOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config: ReturnType<typeof getStripeRuntimeConfig>;
  try {
    // Validated before anything else so a misdeployed environment fails fast
    // and loud on the first hit, exactly like the webhook and portal routes.
    config = getStripeRuntimeConfig();
  } catch (error) {
    const code = stripeConfigurationErrorCode(error);
    console.error(`stripe checkout configuration rejected: ${code}`);
    return NextResponse.json({ error: code }, { status: 500 });
  }

  try {
    const { supabase, user, club } =
      await requireBillingRouteAuthorization(request);
    const onzio = supabase.schema("onzio");
    const { data: currentSubscription, error } = await onzio
      .from("club_subscriptions")
      .select(
        "club_id,stripe_customer_id,stripe_subscription_id,status,paid_through",
      )
      .eq("club_id", club.id)
      .maybeSingle();
    if (error) throw error;

    const decision = buildCheckoutDecision({
      club,
      currentSubscription,
      config,
    });
    const origin = verifiedClubOrigin(club.primaryDomain);
    const stripe = getStripeClient();

    if (decision.destination === "portal") {
      if (!currentSubscription?.stripe_customer_id) {
        throw new ContractError("STRIPE_CUSTOMER_REQUIRED");
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: currentSubscription.stripe_customer_id,
        configuration: config.portalConfigurationId,
        return_url: `${origin}/admin/payments`,
      });
      return NextResponse.json({ url: portal.url });
    }

    const metadata = decision.metadata!;
    if (!user.email) throw new ContractError("AUTHENTICATION_REQUIRED");
    const idempotencyKeys = checkoutIdempotencyKeys({
      environment: config.environment,
      clubId: club.id,
      sessionId: user.sessionId,
    });
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: club.name,
        metadata,
      },
      {
        idempotencyKey: idempotencyKeys.customer,
      },
    );

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customer.id,
        client_reference_id: club.id,
        line_items: [{ price: decision.priceId!, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${origin}/admin/payments?checkout=success`,
        cancel_url: `${origin}/admin/payments?checkout=cancelled`,
      },
      {
        idempotencyKey: idempotencyKeys.checkout,
      },
    );
    // The payments page calls this route with fetch and navigates itself, so
    // failures render as a friendly message instead of raw JSON in the tab.
    return NextResponse.json({ url: session.url! });
  } catch (error) {
    const status =
      error instanceof ContractError &&
      (error.code === "AUTHENTICATION_REQUIRED" ||
        error.code === "MFA_REQUIRED")
        ? 401
        : error instanceof ContractError
          ? 403
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof ContractError ? error.code : "CHECKOUT_FAILED",
      },
      { status },
    );
  }
}
