import { describe, expect, it } from "vitest";
import { ContractError } from "@/lib/contract-error";
import { buildRegistrationCheckout } from "@/lib/registration-checkout";

const input = {
  clubId: "11111111-1111-4111-8111-111111111111",
  clubName: "Diverse City FC",
  formId: "22222222-2222-4222-8222-222222222222",
  formTitle: "2026 Academy Registration",
  formSlug: "2026-academy-registration",
  registrationId: "33333333-3333-4333-8333-333333333333",
  priceLabel: "U12 Player Fee",
  amountCents: 17500,
  connectedAccountId: "acct_1ExampleDirectCharge",
  ledgerEnvironment: "test" as const,
  registrationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  successUrl: "https://dcfc.example/registration/success",
  cancelUrl: "https://dcfc.example/registration/cancel",
};

describe("buildRegistrationCheckout", () => {
  it("builds a direct connected-account one-time Checkout Session", () => {
    const checkout = buildRegistrationCheckout(input);

    expect(checkout.params).toMatchObject({
      mode: "payment",
      client_reference_id: input.registrationId,
      expires_at: expect.any(Number),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.amountCents,
          product_data: { name: "Diverse City FC — 2026 Academy Registration (U12 Player Fee)" },
        },
      }],
      metadata: {
        onzio_club_id: input.clubId,
        registration_form_id: input.formId,
        registration_id: input.registrationId,
        onzio_ledger_environment: "test",
      },
      payment_intent_data: {
        metadata: {
          onzio_club_id: input.clubId,
          registration_form_id: input.formId,
          registration_id: input.registrationId,
          onzio_ledger_environment: "test",
        },
      },
    });
    expect(checkout.params).not.toHaveProperty("payment_method_types");
    expect(checkout.params).not.toHaveProperty("customer_email");
    expect(checkout.params).not.toHaveProperty("application_fee_amount");
    expect(checkout.params).not.toHaveProperty("application_fee_percent");
    expect(checkout.params).not.toHaveProperty("transfer_data");
    expect(checkout.params).not.toHaveProperty("destination");
    expect(checkout.params).not.toHaveProperty("integration_identifier");
    expect(checkout.requestOptions).toEqual({
      stripeAccount: input.connectedAccountId,
      idempotencyKey: expect.stringContaining(input.registrationId),
    });
    expect(checkout.integrationIdentifier).toMatch(/^onzio_registration_[a-z]{8}$/);
  });

  it("sets Checkout expiry safely before the server-created registration deadline", () => {
    const registrationExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const checkout = buildRegistrationCheckout({ ...input, registrationExpiresAt });

    expect(checkout.params.expires_at).toBe(
      Math.floor((Date.parse(registrationExpiresAt) - 5 * 60 * 1000) / 1000),
    );
  });

  it("derives deterministic integration and idempotency identifiers", () => {
    const first = buildRegistrationCheckout(input);
    const second = buildRegistrationCheckout({ ...input });
    expect(first.integrationIdentifier).toBe(second.integrationIdentifier);
    expect(first.requestOptions.idempotencyKey).toBe(second.requestOptions.idempotencyKey);
  });

  it.each([
    [{ ...input, clubId: "club-a" }],
    [{ ...input, connectedAccountId: "acct bad" }],
    [{ ...input, successUrl: "javascript:alert(1)" }],
    [{ ...input, amountCents: 12.5 }],
    [{ ...input, amountCents: 0 }],
  ])("rejects invalid checkout input", (invalid) => {
    expect(() => buildRegistrationCheckout(invalid)).toThrow(ContractError);
  });
});
