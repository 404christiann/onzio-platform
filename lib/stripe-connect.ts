import type Stripe from "stripe";
import { failContract } from "@/lib/contract-error";
import type { OnzioEnvironment } from "@/lib/stripe-config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTED_ACCOUNT = /^acct_[A-Za-z0-9]+$/;

export type StripeConnectRuntimeConfig = {
  environment: OnzioEnvironment;
  ledgerEnvironment: "test" | "production";
};

export type StripeConnectClient = Pick<Stripe, "accounts" | "accountLinks">;

export type ConnectAccountStatus = {
  stripeAccountId: string;
  environment: "test" | "production";
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
};

function clubId(value: string): string {
  if (!UUID.test(value)) {
    failContract("INVALID_CLUB_ID", "clubId must be a UUID.");
  }
  return value;
}

function accountId(value: string): string {
  if (!CONNECTED_ACCOUNT.test(value)) {
    failContract("INVALID_STRIPE_CONNECT_ACCOUNT", "Invalid connected account ID.");
  }
  return value;
}

function verifiedUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    failContract("INVALID_STRIPE_CONNECT_URL", `${field} must be an absolute URL.`);
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    failContract("INVALID_STRIPE_CONNECT_URL", `${field} must be a safe http(s) URL.`);
  }
  return url.toString();
}

/** Maps a canonical Stripe Account response to the service-role DB projection. */
export function mapConnectAccountStatus(
  account: Pick<
    Stripe.Account,
    "id" | "type" | "charges_enabled" | "details_submitted" | "payouts_enabled"
  >,
  config: StripeConnectRuntimeConfig,
): ConnectAccountStatus {
  if (account.type !== "standard") {
    failContract("STRIPE_CONNECT_ACCOUNT_TYPE_INVALID");
  }
  if (
    typeof account.charges_enabled !== "boolean" ||
    typeof account.details_submitted !== "boolean" ||
    typeof account.payouts_enabled !== "boolean"
  ) {
    failContract("INVALID_STRIPE_CONNECT_ACCOUNT");
  }
  return {
    stripeAccountId: accountId(account.id),
    environment: config.ledgerEnvironment,
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    payoutsEnabled: account.payouts_enabled,
  };
}

/** Creates only a Stripe Connect Standard account; Express and Custom are unsupported. */
export async function createStandardConnectAccount(input: {
  stripe: StripeConnectClient;
  clubId: string;
  config: StripeConnectRuntimeConfig;
}): Promise<ConnectAccountStatus> {
  const id = clubId(input.clubId);
  const account = await input.stripe.accounts.create({
    type: "standard",
    metadata: {
      onzio_club_id: id,
      onzio_deploy_environment: input.config.environment,
    },
  });
  return mapConnectAccountStatus(account, input.config);
}

/** Builds a one-time Account Link for a Standard account's hosted onboarding. */
export async function createConnectOnboardingLink(input: {
  stripe: StripeConnectClient;
  stripeAccountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string; expiresAt: number }> {
  const link = await input.stripe.accountLinks.create({
    account: accountId(input.stripeAccountId),
    refresh_url: verifiedUrl(input.refreshUrl, "refreshUrl"),
    return_url: verifiedUrl(input.returnUrl, "returnUrl"),
    type: "account_onboarding",
  });
  if (typeof link.url !== "string" || !Number.isSafeInteger(link.expires_at)) {
    failContract("INVALID_STRIPE_CONNECT_ACCOUNT_LINK");
  }
  return { url: link.url, expiresAt: link.expires_at };
}
