import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { failContract } from "@/lib/contract-error";

export type RegistrationCheckoutInput = {
  clubId: string;
  clubName: string;
  formId: string;
  formTitle: string;
  formSlug: string;
  registrationId: string;
  priceLabel: string;
  amountCents: number;
  connectedAccountId: string;
  ledgerEnvironment: "test" | "production";
  registrationExpiresAt: string;
  successUrl: string;
  cancelUrl: string;
};

type RegistrationCheckoutMetadata = {
  onzio_club_id: string;
  registration_form_id: string;
  registration_id: string;
  onzio_ledger_environment: "test" | "production";
};

export type RegistrationCheckoutBuild = {
  integrationIdentifier: string;
  params: Stripe.Checkout.SessionCreateParams;
  requestOptions: {
    stripeAccount: string;
    idempotencyKey: string;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTED_ACCOUNT = /^acct_[A-Za-z0-9]+$/;
const FORM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requiredText(value: string, field: string) {
  if (!value.trim()) failContract("REGISTRATION_CHECKOUT_INVALID_INPUT", `${field} is required.`);
  return value.trim();
}

function uuid(value: string, field: string) {
  if (!UUID.test(value)) failContract("REGISTRATION_CHECKOUT_INVALID_ID", `${field} must be a UUID.`);
  return value;
}

function checkoutUrl(value: string, field: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    failContract("REGISTRATION_CHECKOUT_INVALID_URL", `${field} must be an absolute URL.`);
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    failContract("REGISTRATION_CHECKOUT_INVALID_URL", `${field} must use http or https without credentials.`);
  }
  return url.toString();
}

function checkoutExpiresAt(value: string): number {
  const registrationExpiry = Date.parse(value);
  const now = Date.now();
  // Stripe requires a Checkout expiry at least 30 minutes ahead. Keep it five
  // minutes before the durable registration boundary so a Session can never
  // outlive the registration it represents.
  const checkoutExpiry = registrationExpiry - 5 * 60 * 1000;
  if (!Number.isFinite(registrationExpiry) || checkoutExpiry < now + 30 * 60 * 1000) {
    failContract("REGISTRATION_CHECKOUT_CUTOFF", "Registration expiry is too close for Checkout.");
  }
  return Math.floor(checkoutExpiry / 1000);
}

function integrationIdentifier(input: RegistrationCheckoutInput) {
  const digest = createHash("sha256")
    .update([
      input.clubId,
      input.formId,
      input.formSlug,
      input.registrationId,
      input.amountCents,
      input.connectedAccountId,
      input.ledgerEnvironment,
    ].join("\u0000"))
    .digest();
  const suffix = Array.from(digest.subarray(0, 8), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");
  return `onzio_registration_${suffix}`;
}

/**
 * Builds parameters for a connected-account direct charge. The platform never
 * supplies a transfer or application fee for a club-owned registration charge.
 */
export function buildRegistrationCheckout(
  input: RegistrationCheckoutInput,
): RegistrationCheckoutBuild {
  const clubId = uuid(input.clubId, "clubId");
  const formId = uuid(input.formId, "formId");
  const registrationId = uuid(input.registrationId, "registrationId");
  const clubName = requiredText(input.clubName, "clubName");
  const formTitle = requiredText(input.formTitle, "formTitle");
  const priceLabel = requiredText(input.priceLabel, "priceLabel");
  if (!FORM_SLUG.test(input.formSlug)) failContract("REGISTRATION_CHECKOUT_INVALID_ID", "formSlug is invalid.");
  if (!CONNECTED_ACCOUNT.test(input.connectedAccountId)) {
    failContract("REGISTRATION_CHECKOUT_INVALID_ID", "connectedAccountId must be a connected Stripe account ID.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1) {
    failContract("REGISTRATION_CHECKOUT_INVALID_AMOUNT", "amountCents must be a positive integer.");
  }

  const metadata: RegistrationCheckoutMetadata = {
    onzio_club_id: clubId,
    registration_form_id: formId,
    registration_id: registrationId,
    onzio_ledger_environment: input.ledgerEnvironment,
  };
  const identifier = integrationIdentifier(input);

  return {
    integrationIdentifier: identifier,
    params: {
      mode: "payment",
      client_reference_id: registrationId,
      expires_at: checkoutExpiresAt(input.registrationExpiresAt),
      success_url: checkoutUrl(input.successUrl, "successUrl"),
      cancel_url: checkoutUrl(input.cancelUrl, "cancelUrl"),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: input.amountCents,
            product_data: { name: `${clubName} — ${formTitle} (${priceLabel})` },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata: { ...metadata } },
    },
    requestOptions: {
      stripeAccount: input.connectedAccountId,
      idempotencyKey: `registration_checkout_${registrationId}_${identifier}`,
    },
  };
}

export const buildRegistrationCheckoutSession = buildRegistrationCheckout;
