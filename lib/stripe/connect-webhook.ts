import Stripe from "stripe";
import { failContract } from "@/lib/contract-error";

/**
 * Signature verification and metadata extraction for the Stripe **Connect**
 * webhook endpoint.
 *
 * Kept entirely separate from `lib/stripe-event-routing.ts`, which verifies
 * Onzio's own subscription-billing deliveries. Connect events arrive at a
 * different endpoint and are signed with a different signing secret; a shared
 * verifier would make it possible to accept a subscription-signed payload as a
 * club payment, or vice versa.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Verifies a Connect delivery against every configured Connect signing secret
 * and returns the parsed event. Throws `INVALID_SIGNATURE` if none matches.
 *
 * Several secrets are accepted because an endpoint may be rotated, or may
 * carry a separate secret per mode. In the current phase only the test-mode
 * secret is configured, so a live-mode delivery has nothing that can verify it
 * and is rejected here before any club state is read.
 */
export function verifyConnectWebhookEvent(input: {
  payload: string;
  signature: string;
  secrets: readonly string[];
}): Stripe.Event {
  if (input.secrets.length === 0) failContract("INVALID_SIGNATURE");
  for (const secret of input.secrets) {
    try {
      return Stripe.webhooks.constructEvent(
        input.payload,
        input.signature,
        secret,
      );
    } catch {
      // Try the next configured secret; a genuine mismatch falls through.
    }
  }
  failContract("INVALID_SIGNATURE");
}

export type ConnectCheckoutMetadata = {
  clubId: string | null;
  formId: string | null;
  responseId: string | null;
};

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

/**
 * Pulls the Onzio identifiers off a Checkout Session's metadata. Metadata is
 * attacker-influenceable in principle (it round-trips through Stripe), so the
 * ids are shape-validated here and the webhook additionally re-checks that the
 * session id matches the one Onzio itself recorded for that response.
 */
export function connectCheckoutMetadata(
  session: Pick<Stripe.Checkout.Session, "metadata">,
): ConnectCheckoutMetadata {
  const metadata = session.metadata ?? {};
  return {
    clubId: uuidOrNull(metadata.onzio_club_id),
    formId: uuidOrNull(metadata.onzio_form_id),
    responseId: uuidOrNull(metadata.onzio_response_id),
  };
}

export function checkoutPaymentIntentId(
  session: Pick<Stripe.Checkout.Session, "payment_intent">,
): string | null {
  const value = session.payment_intent;
  if (typeof value === "string") return value;
  return value?.id ?? null;
}
