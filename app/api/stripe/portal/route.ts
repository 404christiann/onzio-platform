import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";
import { ContractError } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import {
  getStripeRuntimeConfig,
  verifiedClubOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    getStripeRuntimeConfig();
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
      return_url: `${verifiedClubOrigin(club.primaryDomain)}/admin/payments`,
    });
    return NextResponse.redirect(session.url, 303);
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
