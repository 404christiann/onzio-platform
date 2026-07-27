import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";
import { ContractError } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import {
  buildCheckoutDecision,
} from "@/lib/stripe-event-routing";
import {
  getStripeRuntimeConfig,
  verifiedClubOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";

async function requestedTier(
  request: Request,
  fallback: "starter" | "pro",
): Promise<"starter" | "pro"> {
  const contentType = request.headers.get("content-type") ?? "";
  let value: unknown;
  if (contentType.includes("application/json")) {
    value = (await request.json().catch(() => null) as { tier?: unknown } | null)
      ?.tier;
  } else {
    value = (await request.formData().catch(() => null))?.get("tier");
  }
  if (value === null || value === undefined || value === "") return fallback;
  if (value !== "starter" && value !== "pro") {
    throw new ContractError("UNKNOWN_TIER");
  }
  return value;
}

export async function POST(request: Request) {
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

    const config = getStripeRuntimeConfig();
    const tier = await requestedTier(request, club.tier);
    const decision = buildCheckoutDecision({
      club,
      requestedTier: tier,
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
        return_url: `${origin}/admin/payments`,
      });
      return NextResponse.redirect(portal.url, 303);
    }

    const metadata = decision.metadata!;
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: club.name,
        metadata,
      },
      {
        idempotencyKey: `onzio:${config.environment}:${club.id}:first-customer`,
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
        idempotencyKey: `onzio:${config.environment}:${club.id}:first-checkout`,
      },
    );
    return NextResponse.redirect(session.url!, 303);
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
