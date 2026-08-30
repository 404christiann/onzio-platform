import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";
import { ContractError } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import {
  getStripeRuntimeConfig,
  stripeConfigurationErrorCode,
  verifiedClubOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config: ReturnType<typeof getStripeRuntimeConfig>;
  try {
    config = getStripeRuntimeConfig();
  } catch (error) {
    // Same discipline as the webhook route: a configuration fault is an
    // operator problem, not a caller problem, so surface the specific code
    // with a 500 instead of folding it into the 403 contract mapping below.
    const code = stripeConfigurationErrorCode(error);
    console.error(`stripe portal configuration rejected: ${code}`);
    return NextResponse.json({ error: code }, { status: 500 });
  }

  try {
    const { supabase, club } = await requireBillingRouteAuthorization(request);
    const { data: subscription, error } = await supabase
      .schema("onzio")
      .from("club_subscriptions")
      .select("stripe_customer_id")
      .eq("club_id", club.id)
      .maybeSingle();
    if (error) throw error;
    if (!subscription?.stripe_customer_id) {
      throw new ContractError("STRIPE_CUSTOMER_REQUIRED");
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      configuration: config.portalConfigurationId,
      return_url: `${verifiedClubOrigin(club.primaryDomain)}/admin/payments`,
    });
    // The payments page calls this route with fetch and navigates itself, so
    // failures render as a friendly message instead of raw JSON in the tab.
    return NextResponse.json({ url: session.url });
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
        error: error instanceof ContractError ? error.code : "PORTAL_FAILED",
      },
      { status },
    );
  }
}
