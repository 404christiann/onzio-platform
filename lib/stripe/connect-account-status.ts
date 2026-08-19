import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";
import {
  resolveConnectStripeCredentials,
  type ConnectStripeMode,
} from "@/lib/stripe/connect-config";
import {
  createConnectStripeClient,
  type ConnectStripeClient,
} from "@/lib/stripe/connect-client";

/**
 * Readiness of a club's Stripe Connect Standard account, derived from
 * `charges_enabled` / `details_submitted` on the Stripe Account object.
 *
 * Onzio stores no mirror of Stripe's onboarding state beyond the account id;
 * Stripe is the source of truth for whether the account may charge, exactly as
 * it is for subscription state (AGENTS.md: "Stripe as billing source of
 * truth"). This helper reads it live rather than projecting it into a column
 * that could go stale between webhooks.
 */
export type ConnectAccountState =
  | "not_connected"
  | "onboarding_started"
  | "charges_enabled"
  | "restricted";

/**
 * Shape returned to callers, including the admin surface. Documented here
 * because the admin page is owned by another surface and consumes this
 * verbatim through `GET /api/admin/payments/connect-status`.
 */
export type ConnectAccountStatus = {
  clubId: string;
  accountId: string | null;
  state: ConnectAccountState;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  /** Operator-only switch on `onzio.clubs`. Never club-settable. */
  paymentsLiveEnabled: boolean;
  /** Mode this club would actually transact in right now, or null if it cannot transact. */
  mode: ConnectStripeMode | null;
  /** Why `mode` is null, e.g. `CONNECT_LIVE_MODE_UNAVAILABLE`. */
  modeError: string | null;
  /** Stripe's reason the account cannot charge, when it cannot. */
  disabledReason: string | null;
  requirementsCurrentlyDue: string[];
};

export type ConnectAccountStatusFailure = { error: string };

type OnzioClient = SupabaseClient<any, any, any>;

export type ConnectAccountStatusDependencies = {
  /**
   * Supabase client used to read the club row. Deliberately injected rather
   * than constructed here: the admin route passes its user-scoped RLS client
   * (so a club admin only ever reads their own tenant) while operator tooling
   * passes the service-role client. This module therefore never imports the
   * service role and stays outside the privileged-boundary allowlist.
   */
  client: OnzioClient;
  stripe?: ConnectStripeClient;
};

/**
 * `charges_enabled` is the only fact that decides whether a family's card can
 * be charged, so it wins outright. `details_submitted` then separates "the
 * club never finished the Stripe form" from "the club finished it and Stripe
 * is holding or has restricted the account" — two states that need very
 * different operator follow-up and look identical if collapsed.
 */
export function classifyConnectAccount(account: {
  charges_enabled?: boolean | null;
  details_submitted?: boolean | null;
}): Exclude<ConnectAccountState, "not_connected"> {
  if (account.charges_enabled === true) return "charges_enabled";
  return account.details_submitted === true ? "restricted" : "onboarding_started";
}

export async function getConnectAccountStatus(
  input: { clubId: string },
  dependencies: ConnectAccountStatusDependencies,
): Promise<ConnectAccountStatus | ConnectAccountStatusFailure> {
  const { data: club, error } = await dependencies.client
    .schema("onzio")
    .from("clubs")
    .select("id,lifecycle,stripe_connect_account_id,payments_live_enabled")
    .eq("id", input.clubId)
    .maybeSingle();

  if (error) return { error: "CLUB_READ_FAILED" };
  if (!club) return { error: "CLUB_NOT_FOUND" };

  const paymentsLiveEnabled = club.payments_live_enabled === true;

  let mode: ConnectStripeMode | null = null;
  let modeError: string | null = null;
  let stripe: ConnectStripeClient | null = dependencies.stripe ?? null;
  try {
    const credentials = resolveConnectStripeCredentials({
      paymentsLiveEnabled,
    });
    mode = credentials.mode;
    stripe = stripe ?? createConnectStripeClient(credentials);
  } catch (thrown) {
    modeError =
      thrown instanceof ContractError ? thrown.code : "CONNECT_CONFIGURATION_INVALID";
  }

  const accountId: string | null = club.stripe_connect_account_id ?? null;
  if (!accountId) {
    return {
      clubId: input.clubId,
      accountId: null,
      state: "not_connected",
      chargesEnabled: false,
      detailsSubmitted: false,
      payoutsEnabled: false,
      paymentsLiveEnabled,
      mode,
      modeError,
      disabledReason: null,
      requirementsCurrentlyDue: [],
    };
  }

  if (!stripe) {
    // The account exists but no usable client could be built, so nothing about
    // its readiness can be honestly reported.
    return { error: modeError ?? "CONNECT_CONFIGURATION_INVALID" };
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(accountId);
  } catch {
    return { error: "CONNECT_ACCOUNT_RETRIEVE_FAILED" };
  }

  const requirements = account.requirements ?? null;

  return {
    clubId: input.clubId,
    accountId,
    state: classifyConnectAccount(account),
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled: account.payouts_enabled === true,
    paymentsLiveEnabled,
    mode,
    modeError,
    disabledReason: requirements?.disabled_reason ?? null,
    requirementsCurrentlyDue: requirements?.currently_due ?? [],
  };
}
