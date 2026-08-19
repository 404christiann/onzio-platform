import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { ContractError } from "@/lib/contract-error";
import {
  resolveConnectStripeCredentials,
  type ConnectEnv,
  type ConnectStripeCredentials,
} from "@/lib/stripe/connect-config";
import {
  createConnectStripeClient,
  type ConnectStripeClient,
} from "@/lib/stripe/connect-client";
import { resolveClubPrimaryOrigin } from "@/lib/stripe/connect-origin";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

/**
 * Creates a Stripe Checkout Session for a family's academy registration
 * payment, ON THE CLUB'S OWN CONNECTED ACCOUNT.
 *
 * ## Business model (locked)
 *
 * Stripe Connect **Standard** accounts, **direct charges**, 100% of funds to
 * the club. Onzio takes no fee and never touches the money; the club owns its
 * Stripe Dashboard, its disputes, its refunds, and its tax reporting.
 *
 * Concretely, that means this function passes the `stripeAccount` request
 * option — so the charge is created *by* the connected account and the funds
 * settle there directly — and passes **no** `application_fee_amount`, **no**
 * `transfer_data`, and **no** `on_behalf_of`. Those parameters would make
 * Onzio a party to the money movement, which is exactly what this model
 * exists to avoid. A contract test asserts their absence from the parameters
 * actually handed to Stripe, not merely from this file.
 *
 * Card details are never entered inside Onzio: the family is redirected to
 * Stripe-hosted Checkout.
 *
 * ## Result shape
 *
 * Never throws. Returns `{ checkoutUrl }` or `{ error }` with a stable code,
 * so the submission route can render a usable message without unwrapping
 * exceptions. The submitted registration row is already persisted by the
 * caller; a failure here leaves it recorded and unpaid rather than lost.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateConnectedCheckoutSessionInput = {
  clubId: string;
  formId: string;
  responseId: string;
};

export type ConnectedCheckoutSuccess = { checkoutUrl: string };
export type ConnectedCheckoutFailure = { error: string };
export type ConnectedCheckoutResult =
  | ConnectedCheckoutSuccess
  | ConnectedCheckoutFailure;

export type ConnectCheckoutDependencies = {
  client?: SupabaseClient<any, any, any>;
  /**
   * Injected so a test can observe the credentials a client would have been
   * built from. The default is the real factory, which re-checks the key mode.
   */
  createStripeClient?: (
    credentials: ConnectStripeCredentials,
  ) => ConnectStripeClient;
  env?: ConnectEnv;
  origin?: string;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export async function createConnectedCheckoutSession(
  input: CreateConnectedCheckoutSessionInput,
  dependencies: ConnectCheckoutDependencies = {},
): Promise<ConnectedCheckoutResult> {
  const env = dependencies.env ?? process.env;

  try {
    const { clubId, formId, responseId } = input ?? {};
    if (!isUuid(clubId) || !isUuid(formId) || !isUuid(responseId)) {
      return { error: "INVALID_CHECKOUT_INPUT" };
    }

    const client = dependencies.client ?? createServiceRoleClient();
    const onzio = client.schema("onzio");

    const { data: club, error: clubError } = await onzio
      .from("clubs")
      .select("id,name,lifecycle,stripe_connect_account_id,payments_live_enabled")
      .eq("id", clubId)
      .maybeSingle();
    if (clubError) return { error: "CLUB_READ_FAILED" };
    if (!club) return { error: "CLUB_NOT_FOUND" };
    if (club.lifecycle === "archived") return { error: "CLUB_ARCHIVED" };

    const connectedAccountId: string | null =
      club.stripe_connect_account_id ?? null;
    if (!connectedAccountId) {
      return { error: "CONNECT_ACCOUNT_NOT_CONNECTED" };
    }

    // The live-mode gate, resolved before any Stripe client exists and before
    // any Stripe network call is made. A club that cannot legitimately
    // transact never reaches Stripe at all.
    const credentials = resolveConnectStripeCredentials({
      paymentsLiveEnabled: club.payments_live_enabled === true,
      env,
    });

    const { data: form, error: formError } = await onzio
      .from("registration_forms")
      .select("id,club_id,title,status,requires_payment,price_cents,currency")
      .eq("id", formId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (formError) return { error: "FORM_READ_FAILED" };
    if (!form) return { error: "FORM_NOT_FOUND" };
    if (form.status !== "live") return { error: "FORM_NOT_LIVE" };
    if (form.requires_payment !== true) {
      return { error: "FORM_PAYMENT_NOT_REQUIRED" };
    }
    const priceCents = Number(form.price_cents);
    const currency =
      typeof form.currency === "string" ? form.currency.toLowerCase() : "";
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0 || !currency) {
      return { error: "FORM_PRICE_INVALID" };
    }

    const { data: response, error: responseError } = await onzio
      .from("registration_responses")
      .select(
        "id,club_id,form_id,payment_status,parent_guardian_email,player_first_name,player_last_name",
      )
      .eq("id", responseId)
      .eq("club_id", clubId)
      .eq("form_id", formId)
      .maybeSingle();
    if (responseError) return { error: "RESPONSE_READ_FAILED" };
    if (!response) return { error: "RESPONSE_NOT_FOUND" };
    if (response.payment_status === "paid") {
      return { error: "RESPONSE_ALREADY_PAID" };
    }

    const stripe = (
      dependencies.createStripeClient ??
      ((value: ConnectStripeCredentials) => createConnectStripeClient(value, env))
    )(credentials);

    // Readiness is asked of Stripe rather than of a mirrored column: a club
    // that started onboarding but is still restricted must not be handed a
    // Checkout URL that will fail at the payment step.
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(connectedAccountId);
    } catch {
      return { error: "CONNECT_ACCOUNT_RETRIEVE_FAILED" };
    }
    if (account.charges_enabled !== true) {
      return { error: "CONNECT_ACCOUNT_CHARGES_DISABLED" };
    }

    const origin =
      dependencies.origin ??
      (await resolveClubPrimaryOrigin(client, clubId, env));
    if (!origin) return { error: "CHECKOUT_ORIGIN_UNAVAILABLE" };

    const metadata = {
      onzio_club_id: clubId,
      onzio_form_id: formId,
      onzio_response_id: responseId,
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: priceCents,
                product_data: { name: form.title },
              },
            },
          ],
          customer_email: response.parent_guardian_email ?? undefined,
          client_reference_id: responseId,
          metadata,
          // Mirrored onto the PaymentIntent so the club can reconcile a
          // payment from its own Dashboard without Onzio's help.
          payment_intent_data: { metadata },
          success_url: `${origin}/join/academy?registration=paid&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/join/academy?registration=cancelled`,
        },
        {
          // Direct charge on the club's own account: funds settle with the
          // club, and Onzio takes no application fee and initiates no
          // transfer. Do not add application_fee_amount, transfer_data, or
          // on_behalf_of here.
          stripeAccount: connectedAccountId,
          idempotencyKey: `onzio_connect_checkout:${credentials.mode}:${responseId}`,
        },
      );
    } catch {
      return { error: "CHECKOUT_SESSION_FAILED" };
    }

    if (!session.url) return { error: "CHECKOUT_URL_MISSING" };

    // Recorded before the family is redirected so the Connect webhook can
    // cross-check the session it is told about against the session Onzio
    // actually created for this response.
    const { error: persistError } = await onzio
      .from("registration_responses")
      .update({
        payment_status: "pending",
        stripe_checkout_session_id: session.id,
      })
      .eq("id", responseId)
      .eq("club_id", clubId)
      .neq("payment_status", "paid");
    if (persistError) return { error: "CHECKOUT_PERSIST_FAILED" };

    return { checkoutUrl: session.url };
  } catch (thrown) {
    return {
      error:
        thrown instanceof ContractError ? thrown.code : "CHECKOUT_SESSION_FAILED",
    };
  }
}
