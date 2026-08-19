import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";
import { ContractError } from "@/lib/contract-error";
import { getConnectAccountStatus } from "@/lib/stripe/connect-account-status";

/**
 * Connect readiness for the signed-in club, for the admin payments surface.
 *
 * Authorization mirrors the other billing routes exactly: the tenant is
 * resolved from the verified host and the session, never from a body or query
 * parameter, and the Supabase client handed to the status helper is the
 * user-scoped RLS client — so even a bug in the helper cannot read another
 * club's row.
 *
 * Response shape (`ConnectAccountStatus` in
 * `lib/stripe/connect-account-status.ts`), for the admin UI to consume:
 *
 * ```json
 * {
 *   "clubId": "uuid",
 *   "accountId": "acct_... | null",
 *   "state": "not_connected | onboarding_started | charges_enabled | restricted",
 *   "chargesEnabled": false,
 *   "detailsSubmitted": false,
 *   "payoutsEnabled": false,
 *   "paymentsLiveEnabled": false,
 *   "mode": "test | live | null",
 *   "modeError": "CONNECT_LIVE_MODE_UNAVAILABLE | null",
 *   "disabledReason": "string | null",
 *   "requirementsCurrentlyDue": []
 * }
 * ```
 *
 * Connecting an account is deliberately NOT exposed here: onboarding is
 * operator work (`lib/operator/stripe-connect-onboarding.ts`), which requires
 * an AAL2 operator session and refuses invocation from an application route.
 */
export async function GET(request: Request) {
  try {
    const { supabase, club } = await requireBillingRouteAuthorization(request);
    const status = await getConnectAccountStatus(
      { clubId: club.id },
      { client: supabase },
    );
    if ("error" in status) {
      return NextResponse.json({ error: status.error }, { status: 502 });
    }
    return NextResponse.json(status);
  } catch (error) {
    const status =
      error instanceof ContractError &&
      (error.code === "AUTHENTICATION_REQUIRED" || error.code === "MFA_REQUIRED")
        ? 401
        : error instanceof ContractError
          ? 403
          : 500;
    return NextResponse.json(
      {
        error:
          error instanceof ContractError ? error.code : "CONNECT_STATUS_FAILED",
      },
      { status },
    );
  }
}
