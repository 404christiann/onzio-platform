import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { requireRegistrationRouteAuthorization } from "@/lib/registration-route-auth";
import {
  getClubConnectRecord,
  saveClubConnectRecord,
} from "@/lib/registration-service";
import { getStripeClient } from "@/lib/stripe-client";
import {
  createConnectOnboardingLink,
  createStandardConnectAccount,
  mapConnectAccountStatus,
} from "@/lib/stripe-connect";
import {
  getStripeRegistrationRuntimeConfig,
  verifiedClubRequestOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const code = error instanceof ContractError
    ? error.code
    : "STRIPE_CONNECT_REQUEST_FAILED";
  const status = code === "AUTHENTICATION_REQUIRED"
    ? 401
    : error instanceof ContractError
      ? 403
      : 500;
  return NextResponse.json({ error: code }, { status });
}

async function canonicalConnectAccount(
  clubId: string,
  config: ReturnType<typeof getStripeRegistrationRuntimeConfig>,
) {
  const stripe = getStripeClient();
  const current = await getClubConnectRecord(clubId);
  if (!current) {
    const created = await createStandardConnectAccount({ stripe, clubId, config });
    await saveClubConnectRecord({
      club_id: clubId,
      stripe_account_id: created.stripeAccountId,
      environment: created.environment,
      charges_enabled: created.chargesEnabled,
      details_submitted: created.detailsSubmitted,
      payouts_enabled: created.payoutsEnabled,
    });
    return created;
  }
  if (current.environment !== config.ledgerEnvironment) {
    throw new ContractError("STRIPE_CONNECT_MODE_MISMATCH");
  }

  const retrieved = await stripe.accounts.retrieve(current.stripe_account_id);
  const canonical = mapConnectAccountStatus(retrieved, config);
  await saveClubConnectRecord({
    club_id: clubId,
    stripe_account_id: canonical.stripeAccountId,
    environment: canonical.environment,
    charges_enabled: canonical.chargesEnabled,
    details_submitted: canonical.detailsSubmitted,
    payouts_enabled: canonical.payoutsEnabled,
  });
  return canonical;
}

/** Read-only status refresh: never provisions a Stripe account. */
async function readExistingConnectAccount(
  clubId: string,
  config: ReturnType<typeof getStripeRegistrationRuntimeConfig>,
) {
  const current = await getClubConnectRecord(clubId);
  if (!current) return null;
  if (current.environment !== config.ledgerEnvironment) {
    throw new ContractError("STRIPE_CONNECT_MODE_MISMATCH");
  }
  const canonical = mapConnectAccountStatus(
    await getStripeClient().accounts.retrieve(current.stripe_account_id),
    config,
  );
  await saveClubConnectRecord({
    club_id: clubId,
    stripe_account_id: canonical.stripeAccountId,
    environment: canonical.environment,
    charges_enabled: canonical.chargesEnabled,
    details_submitted: canonical.detailsSubmitted,
    payouts_enabled: canonical.payoutsEnabled,
  });
  return canonical;
}

async function onboardingResponse(request: Request) {
  const { club } = await requireRegistrationRouteAuthorization(request);
  const config = getStripeRegistrationRuntimeConfig();
  const account = await canonicalConnectAccount(club.id, config);
  const origin = verifiedClubRequestOrigin({
    primaryDomain: club.primaryDomain,
    clubSlug: club.slug,
    requestHost: request.headers.get("host"),
  });
  const link = await createConnectOnboardingLink({
    stripe: getStripeClient(),
    stripeAccountId: account.stripeAccountId,
    refreshUrl: `${origin}/api/stripe/connect?action=refresh`,
    returnUrl: `${origin}/api/stripe/connect?action=return`,
  });
  return NextResponse.redirect(link.url, 303);
}

export async function POST(request: Request) {
  try {
    return await onboardingResponse(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get("action") ?? "status";
    if (action === "refresh") return onboardingResponse(request);

    const { club } = await requireRegistrationRouteAuthorization(request);
    const account = await readExistingConnectAccount(
      club.id,
      getStripeRegistrationRuntimeConfig(),
    );
    if (action === "return") {
      const origin = verifiedClubRequestOrigin({
        primaryDomain: club.primaryDomain,
        clubSlug: club.slug,
        requestHost: request.headers.get("host"),
      });
      return NextResponse.redirect(
        `${origin}/admin/registrations?connect=returned`,
        303,
      );
    }
    if (action !== "status") throw new ContractError("INVALID_CONNECT_ACTION");

    return NextResponse.json({
      connected: account?.detailsSubmitted ?? false,
      chargesEnabled: account?.chargesEnabled ?? false,
      payoutsEnabled: account?.payoutsEnabled ?? false,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
