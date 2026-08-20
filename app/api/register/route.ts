import { NextResponse } from "next/server";
import { z } from "zod";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import {
  recordRegistrationNotificationFailure,
  sendRegistrationNotifications,
} from "@/lib/email/send-registration-notifications";
import { buildRegistrationCheckout } from "@/lib/registration-checkout";
import {
  type RegistrationFieldDefinition,
  validateRegistrationAnswers,
} from "@/lib/registration-fields";
import {
  generateRegistrationStatusToken,
  hashRegistrationStatusToken,
} from "@/lib/registration-status-token";
import {
  attachRegistrationCheckout,
  createPendingRegistration,
  expireRegistration,
  getPendingRegistrationCheckoutExpiry,
  loadOpenRegistrationForm,
  markFreeRegistrationPaid,
} from "@/lib/registration-service";
import { getStripeClient } from "@/lib/stripe-client";
import {
  getRegistrationLedgerEnvironment,
  getStripeRegistrationRuntimeConfig,
  verifiedClubRequestOrigin,
} from "@/lib/stripe-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submitSchema = z.object({
  formSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  priceOptionId: z.uuid(),
  answers: z.record(z.string(), z.unknown()),
  waiverAccepted: z.literal(true),
}).strict();

function responseForError(error: unknown) {
  const code = error instanceof ContractError
    ? error.code
    : "REGISTRATION_SUBMISSION_FAILED";
  const status = code === "REGISTRATION_FORM_NOT_FOUND"
    ? 404
    : code.includes("CLOSED") || code.includes("CUTOFF")
      ? 409
      : error instanceof ContractError
        ? 400
        : 500;
  return NextResponse.json({ error: code }, { status });
}

function fieldDefinitions(
  fields: Awaited<ReturnType<typeof loadOpenRegistrationForm>>["fields"],
): RegistrationFieldDefinition[] {
  return fields.map((field) => ({
    key: field.field_key,
    label: field.label,
    type: field.field_type as RegistrationFieldDefinition["type"],
    required: field.required,
    options: field.field_type === "dropdown"
      ? field.options as string[]
      : undefined,
    isCore: field.is_core,
  }));
}

function registrationEmail(
  isMinor: boolean,
  answers: Record<string, string | number | boolean>,
): string {
  const value = answers[isMinor ? "guardian_email" : "registrant_email"];
  if (typeof value !== "string") {
    throw new ContractError("REGISTRATION_EMAIL_REQUIRED");
  }
  return value;
}

async function notifyWithoutAffectingPayment(registrationId: string) {
  try {
    await sendRegistrationNotifications(registrationId);
  } catch (error) {
    // Payment truth is durable before email; delivery failures never roll back.
    await recordRegistrationNotificationFailure(registrationId, error);
  }
}

export async function POST(request: Request) {
  let pending: { clubId: string; registrationId: string } | null = null;
  try {
    const parsed = submitSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ContractError("INVALID_REGISTRATION_SUBMISSION");

    const club = await getClubContext({
      hostname: request.headers.get("host") ?? "",
    });
    if (
      club.lifecycle !== "active" ||
      (club.publicAccess !== "live" && club.publicAccess !== "grace")
    ) {
      throw new ContractError("REGISTRATION_NOT_PUBLIC");
    }

    const aggregate = await loadOpenRegistrationForm(club.id, parsed.data.formSlug);
    const answers = validateRegistrationAnswers(
      fieldDefinitions(aggregate.fields),
      parsed.data.answers,
    );
    const price = aggregate.prices.find(
      (option) => option.id === parsed.data.priceOptionId,
    );
    if (!price) throw new ContractError("REGISTRATION_PRICE_INVALID");

    const ledgerEnvironment = getRegistrationLedgerEnvironment();
    const statusToken = generateRegistrationStatusToken();
    const registrantEmail = registrationEmail(aggregate.form.is_minor, answers);
    const registrationId = await createPendingRegistration({
      clubId: club.id,
      formId: aggregate.form.id,
      answers,
      registrantEmail,
      priceOptionId: price.id,
      waiverAcceptedAt: new Date().toISOString(),
      statusTokenHash: hashRegistrationStatusToken(statusToken),
      environment: ledgerEnvironment,
    });
    pending = { clubId: club.id, registrationId };

    const origin = verifiedClubRequestOrigin({
      primaryDomain: club.primaryDomain,
      clubSlug: club.slug,
      requestHost: request.headers.get("host"),
    });
    const confirmationUrl = `${origin}/register/${aggregate.form.slug}/confirmation?token=${encodeURIComponent(statusToken)}`;
    if (price.amount_cents === 0) {
      await markFreeRegistrationPaid(club.id, registrationId);
      pending = null;
      await notifyWithoutAffectingPayment(registrationId);
      return NextResponse.json({ confirmationUrl }, { status: 201 });
    }
    const config = getStripeRegistrationRuntimeConfig();
    if (
      !aggregate.connect ||
      aggregate.connect.environment !== config.ledgerEnvironment ||
      !aggregate.connect.charges_enabled
    ) {
      throw new ContractError("STRIPE_CONNECT_REQUIRED");
    }
    const registrationExpiresAt = await getPendingRegistrationCheckoutExpiry({
      clubId: club.id,
      registrationId,
    });

    const checkout = buildRegistrationCheckout({
      clubId: club.id,
      clubName: club.name,
      formId: aggregate.form.id,
      formTitle: aggregate.form.title,
      formSlug: aggregate.form.slug,
      registrationId,
      priceLabel: price.label,
      amountCents: price.amount_cents,
      connectedAccountId: aggregate.connect.stripe_account_id,
      ledgerEnvironment: config.ledgerEnvironment,
      registrationExpiresAt,
      successUrl: confirmationUrl,
      cancelUrl: `${origin}/register/${aggregate.form.slug}?checkout=cancelled`,
    });
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create(
      checkout.params,
      checkout.requestOptions,
    );
    if (!session.url) throw new ContractError("CHECKOUT_URL_REQUIRED");

    try {
      await attachRegistrationCheckout({
        clubId: club.id,
        registrationId,
        checkoutSessionId: session.id,
        checkoutCreatedAt: new Date(session.created * 1000).toISOString(),
      });
    } catch (error) {
      await stripe.checkout.sessions
        .expire(
          session.id,
          {},
          { stripeAccount: aggregate.connect.stripe_account_id },
        )
        .catch(() => undefined);
      throw error;
    }
    pending = null;
    return NextResponse.json(
      { checkoutUrl: session.url, confirmationUrl },
      { status: 201 },
    );
  } catch (error) {
    if (pending) {
      await expireRegistration(pending.clubId, pending.registrationId)
        .catch(() => undefined);
    }
    return responseForError(error);
  }
}
