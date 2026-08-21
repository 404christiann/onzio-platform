import { ContractError } from "@/lib/contract-error";
import type {
  RegistrationParticipantMode,
  RegistrationParticipantScope,
  RegistrationParticipantType,
} from "@/lib/registration-fields";
import { RegistrationInfrastructureError } from "@/lib/registration-infrastructure-error";
import { getRegistrationLedgerEnvironment } from "@/lib/stripe-config";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export type RegistrationFormRecord = {
  id: string;
  club_id: string;
  slug: string;
  title: string;
  description: string;
  participant_mode: RegistrationParticipantMode;
  waiver_text: string;
};

type RegistrationFormLookupRecord = RegistrationFormRecord & {
  status: "draft" | "open" | "closed";
};

export type RegistrationFieldRecord = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  required: boolean;
  is_core: boolean;
  participant_scope: RegistrationParticipantScope;
  position: number;
};

export type RegistrationPriceRecord = {
  id: string;
  label: string;
  amount_cents: number;
  position: number;
};

export type ClubConnectRecord = {
  club_id: string;
  stripe_account_id: string;
  environment: "test" | "production";
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
};

export type OpenRegistrationForm = {
  form: RegistrationFormRecord;
  fields: RegistrationFieldRecord[];
  prices: RegistrationPriceRecord[];
  connect: ClubConnectRecord | null;
};

function serviceSchema() {
  return createServiceRoleClient().schema("onzio");
}

function databaseFailure(code: string, cause?: { message?: string } | null): never {
  throw new RegistrationInfrastructureError(code, cause);
}

export async function loadOpenRegistrationForm(
  clubId: string,
  formSlug: string,
): Promise<OpenRegistrationForm> {
  const service = serviceSchema();
  const { data: form, error: formError } = await service
    .from("registration_forms")
    .select("id,club_id,slug,title,description,participant_mode,waiver_text,status")
    .eq("club_id", clubId)
    .eq("slug", formSlug)
    .maybeSingle();
  if (formError) databaseFailure("REGISTRATION_FORM_READ_FAILED", formError);
  if (!form) throw new ContractError("REGISTRATION_FORM_NOT_FOUND");
  const lookup = form as RegistrationFormLookupRecord;
  // The tenant predicate remains mandatory: a form from another club stays
  // indistinguishable from a missing form. Draft forms do too, while a closed
  // form that this public page previously loaded gets an actionable response.
  if (lookup.status === "closed") {
    throw new ContractError("REGISTRATION_FORM_CLOSED");
  }
  if (lookup.status !== "open") {
    throw new ContractError("REGISTRATION_FORM_NOT_FOUND");
  }

  const [fieldsResult, pricesResult, connectResult] = await Promise.all([
    service
      .from("registration_form_fields")
      .select("id,field_key,label,field_type,options,required,is_core,participant_scope,position")
      .eq("club_id", clubId)
      .eq("form_id", form.id)
      .order("position", { ascending: true }),
    service
      .from("registration_price_options")
      .select("id,label,amount_cents,position")
      .eq("club_id", clubId)
      .eq("form_id", form.id)
      .eq("active", true)
      .order("position", { ascending: true }),
    service
      .from("club_stripe_connect")
      .select(
        "club_id,stripe_account_id,environment,charges_enabled,details_submitted,payouts_enabled",
      )
      .eq("club_id", clubId)
      .maybeSingle(),
  ]);
  if (fieldsResult.error) {
    databaseFailure("REGISTRATION_FIELDS_READ_FAILED", fieldsResult.error);
  }
  if (pricesResult.error) {
    databaseFailure("REGISTRATION_PRICES_READ_FAILED", pricesResult.error);
  }
  if (connectResult.error) {
    databaseFailure("REGISTRATION_CONNECT_READ_FAILED", connectResult.error);
  }

  return {
    form: lookup,
    fields: (fieldsResult.data ?? []) as RegistrationFieldRecord[],
    prices: (pricesResult.data ?? []) as RegistrationPriceRecord[],
    connect: connectResult.data as ClubConnectRecord | null,
  };
}

export async function createPendingRegistration(input: {
  clubId: string;
  formId: string;
  answers: Record<string, string | number | boolean>;
  registrantEmail: string;
  participantType: RegistrationParticipantType;
  priceOptionId: string;
  waiverAcceptedAt: string;
  statusTokenHash: string;
  environment: "test" | "production";
}): Promise<string> {
  const { data, error } = await serviceSchema().rpc(
    "create_pending_registration",
    {
      p_club_id: input.clubId,
      p_form_id: input.formId,
      p_answers: input.answers,
      p_registrant_email: input.registrantEmail,
      p_participant_type: input.participantType,
      p_price_option_id: input.priceOptionId,
      p_waiver_accepted_at: input.waiverAcceptedAt,
      p_status_token_hash: input.statusTokenHash,
      p_environment: input.environment,
    },
  );
  if (error?.message === "REGISTRATION_FORM_CLOSED") {
    throw new ContractError("REGISTRATION_FORM_CLOSED");
  }
  if (error || typeof data !== "string") {
    databaseFailure("REGISTRATION_PENDING_CREATE_FAILED", error);
  }
  return data;
}

/** Reads the server-created deadline before constructing a paid Checkout Session. */
export async function getPendingRegistrationCheckoutExpiry(input: {
  clubId: string;
  registrationId: string;
}): Promise<string> {
  const { data, error } = await serviceSchema()
    .from("registrations")
    .select("expires_at")
    .eq("club_id", input.clubId)
    .eq("id", input.registrationId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) databaseFailure("REGISTRATION_CHECKOUT_EXPIRY_READ_FAILED", error);
  if (!data) throw new ContractError("REGISTRATION_CHECKOUT_CUTOFF");
  return data.expires_at;
}

export async function attachRegistrationCheckout(input: {
  clubId: string;
  registrationId: string;
  checkoutSessionId: string;
  checkoutCreatedAt: string;
}): Promise<void> {
  const { error } = await serviceSchema().rpc(
    "attach_registration_checkout",
    {
      p_club_id: input.clubId,
      p_registration_id: input.registrationId,
      p_checkout_session_id: input.checkoutSessionId,
      p_checkout_created_at: input.checkoutCreatedAt,
    },
  );
  if (error) databaseFailure("REGISTRATION_CHECKOUT_ATTACH_FAILED", error);
}

export async function markFreeRegistrationPaid(
  clubId: string,
  registrationId: string,
): Promise<void> {
  const { error } = await serviceSchema().rpc(
    "mark_free_registration_paid",
    { p_club_id: clubId, p_registration_id: registrationId },
  );
  if (error) databaseFailure("FREE_REGISTRATION_COMPLETION_FAILED", error);
}

export async function expireRegistration(
  clubId: string,
  registrationId: string,
): Promise<void> {
  const { error } = await serviceSchema().rpc("expire_registration", {
    p_club_id: clubId,
    p_registration_id: registrationId,
  });
  if (error) databaseFailure("REGISTRATION_EXPIRY_FAILED", error);
}

/** Expires only registrations that were pending when the sweep began. */
export async function expirePendingRegistrations(
  now = new Date(),
): Promise<{ inspected: number; expired: number; failed: number }> {
  const { data, error } = await serviceSchema()
    .from("registrations")
    .select("id,club_id")
    .eq("status", "pending")
    .lt("expires_at", now.toISOString())
    .limit(500);
  if (error) databaseFailure("REGISTRATION_EXPIRY_READ_FAILED", error);

  let expired = 0;
  let failed = 0;
  for (const registration of data ?? []) {
    try {
      await expireRegistration(registration.club_id, registration.id);
      expired += 1;
    } catch {
      failed += 1;
    }
  }
  return { inspected: data?.length ?? 0, expired, failed };
}

export async function readRegistrationStatus(
  clubId: string,
  statusTokenHash: string,
): Promise<"pending" | "paid" | "refunded" | "expired" | null> {
  const { data, error } = await serviceSchema()
    .from("registrations")
    .select("status,expires_at")
    .eq("club_id", clubId)
    .eq("status_token_hash", statusTokenHash)
    .maybeSingle();
  if (error) databaseFailure("REGISTRATION_STATUS_READ_FAILED", error);
  if (!data) return null;
  if (data.status === "pending" && Date.parse(data.expires_at) <= Date.now()) {
    return "expired";
  }
  return data.status as "pending" | "paid" | "refunded" | "expired";
}

export async function getClubConnectRecord(
  clubId: string,
): Promise<ClubConnectRecord | null> {
  const { data, error } = await serviceSchema()
    .from("club_stripe_connect")
    .select(
      "club_id,stripe_account_id,environment,charges_enabled,details_submitted,payouts_enabled",
    )
    .eq("club_id", clubId)
    .maybeSingle();
  if (error) databaseFailure("STRIPE_CONNECT_READ_FAILED", error);
  return data as ClubConnectRecord | null;
}

export async function saveClubConnectRecord(input: ClubConnectRecord): Promise<void> {
  const { error } = await serviceSchema()
    .from("club_stripe_connect")
    .upsert(input, { onConflict: "club_id" });
  if (error) databaseFailure("STRIPE_CONNECT_WRITE_FAILED", error);
}

export async function getClubConnectRecordByAccount(
  stripeAccountId: string,
): Promise<ClubConnectRecord | null> {
  const { data, error } = await serviceSchema()
    .from("club_stripe_connect")
    .select(
      "club_id,stripe_account_id,environment,charges_enabled,details_submitted,payouts_enabled",
    )
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (error) databaseFailure("STRIPE_CONNECT_READ_FAILED", error);
  return data as ClubConnectRecord | null;
}

export type RegistrationPaymentProjection = {
  id: string;
  club_id: string;
  form_id: string;
  status: "pending" | "paid" | "refunded" | "expired";
  amount_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
};

export async function getRegistrationPaymentProjection(input: {
  clubId: string;
  registrationId?: string;
  paymentIntentId?: string;
}): Promise<RegistrationPaymentProjection | null> {
  let query = serviceSchema()
    .from("registrations")
    .select(
      "id,club_id,form_id,status,amount_cents,stripe_checkout_session_id,stripe_payment_intent_id",
    )
    .eq("club_id", input.clubId);
  if (input.registrationId) query = query.eq("id", input.registrationId);
  if (input.paymentIntentId) {
    query = query.eq("stripe_payment_intent_id", input.paymentIntentId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) databaseFailure("REGISTRATION_PAYMENT_READ_FAILED", error);
  return data as RegistrationPaymentProjection | null;
}

export async function stripeEventExists(eventId: string): Promise<boolean> {
  const { data, error } = await serviceSchema()
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) databaseFailure("STRIPE_EVENT_READ_FAILED", error);
  return Boolean(data);
}

export async function recordRegistrationStripeRejection(input: {
  eventId: string;
  eventType: string;
  stripeCreatedAt: string;
  clubId: string;
  payloadDigest: string;
  rejectionCode: string;
}): Promise<void> {
  const { error } = await serviceSchema().rpc("record_stripe_rejection", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_stripe_created_at: input.stripeCreatedAt,
    p_environment: getRegistrationLedgerEnvironment(),
    p_club_id: input.clubId,
    p_payload_digest: input.payloadDigest,
    p_rejection_code: input.rejectionCode,
  });
  if (error) databaseFailure("STRIPE_REJECTION_LEDGER_FAILED", error);
}

export async function applyRegistrationCheckoutEvent(input: {
  eventId: string;
  stripeCreatedAt: string;
  clubId: string;
  registrationId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  amountTotal: number;
  payloadDigest: string;
}) {
  const { data, error } = await serviceSchema().rpc(
    "apply_registration_checkout_event",
    {
      p_event_id: input.eventId,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: input.stripeCreatedAt,
      p_environment: getRegistrationLedgerEnvironment(),
      p_club_id: input.clubId,
      p_registration_id: input.registrationId,
      p_checkout_session_id: input.checkoutSessionId,
      p_payment_intent_id: input.paymentIntentId,
      p_amount_total: input.amountTotal,
      p_payload_digest: input.payloadDigest,
    },
  );
  if (error) databaseFailure("REGISTRATION_CHECKOUT_EVENT_FAILED", error);
  return data;
}

export async function applyRegistrationRefundEvent(input: {
  eventId: string;
  stripeCreatedAt: string;
  clubId: string;
  registrationId: string;
  paymentIntentId: string;
  amountRefunded: number;
  payloadDigest: string;
}) {
  const { data, error } = await serviceSchema().rpc(
    "apply_registration_refund_event",
    {
      p_event_id: input.eventId,
      p_event_type: "charge.refunded",
      p_stripe_created_at: input.stripeCreatedAt,
      p_environment: getRegistrationLedgerEnvironment(),
      p_club_id: input.clubId,
      p_registration_id: input.registrationId,
      p_payment_intent_id: input.paymentIntentId,
      p_amount_refunded: input.amountRefunded,
      p_payload_digest: input.payloadDigest,
    },
  );
  if (error) databaseFailure("REGISTRATION_REFUND_EVENT_FAILED", error);
  return data;
}

export async function applyRegistrationConnectEvent(input: {
  eventId: string;
  stripeCreatedAt: string;
  clubId: string;
  stripeAccountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  payloadDigest: string;
}) {
  const { data, error } = await serviceSchema().rpc(
    "apply_registration_connect_event",
    {
      p_event_id: input.eventId,
      p_event_type: "account.updated",
      p_stripe_created_at: input.stripeCreatedAt,
      p_environment: getRegistrationLedgerEnvironment(),
      p_club_id: input.clubId,
      p_stripe_account_id: input.stripeAccountId,
      p_charges_enabled: input.chargesEnabled,
      p_details_submitted: input.detailsSubmitted,
      p_payouts_enabled: input.payoutsEnabled,
      p_payload_digest: input.payloadDigest,
    },
  );
  if (error) databaseFailure("REGISTRATION_CONNECT_EVENT_FAILED", error);
  return data;
}

export type RegistrationNotificationData = {
  registrationId: string;
  clubId: string;
  clubName: string;
  participantName: string;
  formTitle: string;
  formDescription: string;
  registrantEmail: string;
  ownerEmails: string[];
  priceLabel: string;
  amountCents: number;
};

function registrationParticipantName(
  answers: unknown,
  participantType: RegistrationParticipantType,
): string {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    databaseFailure("REGISTRATION_NOTIFICATION_DATA_INVALID");
  }
  const key = participantType === "minor" ? "player_name" : "registrant_name";
  const value = (answers as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) {
    databaseFailure("REGISTRATION_NOTIFICATION_DATA_INVALID");
  }
  return value.trim();
}

export async function loadRegistrationNotificationData(
  registrationId: string,
): Promise<RegistrationNotificationData> {
  const client = createServiceRoleClient();
  const service = client.schema("onzio");
  const { data: registration, error } = await service
    .from("registrations")
    .select("id,club_id,form_id,status,answers,registrant_email,participant_type,price_label,amount_cents")
    .eq("id", registrationId)
    .maybeSingle();
  if (error) databaseFailure("REGISTRATION_NOTIFICATION_READ_FAILED", error);
  if (!registration || registration.status !== "paid") {
    throw new ContractError("PAID_REGISTRATION_REQUIRED");
  }

  const [clubResult, formResult, ownersResult] = await Promise.all([
    service.from("clubs").select("name").eq("id", registration.club_id).single(),
    service
      .from("registration_forms")
      .select("title,description")
      .eq("club_id", registration.club_id)
      .eq("id", registration.form_id)
      .single(),
    service
      .from("club_members")
      .select("user_id")
      .eq("club_id", registration.club_id)
      .eq("role", "owner")
      .eq("status", "active"),
  ]);
  if (clubResult.error || formResult.error || ownersResult.error) {
    databaseFailure(
      "REGISTRATION_NOTIFICATION_READ_FAILED",
      clubResult.error ?? formResult.error ?? ownersResult.error,
    );
  }

  const resolvedOwnerEmails = await Promise.all(
    (ownersResult.data ?? []).map(async ({ user_id }) => {
      const { data, error: userError } =
        await client.auth.admin.getUserById(user_id);
      if (userError) return null;
      return data.user.email?.trim().toLowerCase() ?? null;
    }),
  );
  const ownerEmails = Array.from(new Set(
    resolvedOwnerEmails.filter((email): email is string => Boolean(email)),
  )).sort();

  return {
    registrationId: registration.id,
    clubId: registration.club_id,
    clubName: clubResult.data.name,
    participantName: registrationParticipantName(
      registration.answers,
      registration.participant_type as RegistrationParticipantType,
    ),
    formTitle: formResult.data.title,
    formDescription: formResult.data.description.trim(),
    registrantEmail: registration.registrant_email.trim().toLowerCase(),
    ownerEmails,
    priceLabel: registration.price_label,
    amountCents: registration.amount_cents,
  };
}

export async function updateRegistrationEmailDelivery(input: {
  registrationId: string;
  registrantStatus: "pending" | "sent" | "failed" | "skipped";
  adminStatus: "pending" | "sent" | "failed" | "skipped";
  error?: string | null;
}): Promise<void> {
  const { error } = await serviceSchema()
    .from("registrations")
    .update({
      registrant_email_status: input.registrantStatus,
      admin_email_status: input.adminStatus,
      email_error: input.error?.slice(0, 500) ?? null,
    })
    .eq("id", input.registrationId)
    .eq("status", "paid");
  if (error) databaseFailure("REGISTRATION_EMAIL_STATUS_FAILED", error);
}
