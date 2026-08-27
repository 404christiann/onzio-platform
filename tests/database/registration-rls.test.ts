import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];
const createdIds: Record<string, string[]> = {
  registration_form_fields: [],
  registration_price_options: [],
  registrations: [],
  registration_forms: [],
};

async function isolateClubConnect(clubId: string) {
  const existing = await clients.service
    .from("club_stripe_connect")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();
  expect(existing.error?.message).toBeUndefined();

  if (existing.data) {
    const remove = await clients.service
      .from("club_stripe_connect")
      .delete()
      .eq("club_id", clubId);
    expect(remove.error?.message).toBeUndefined();
  }

  return async () => {
    const removeFixture = await clients.service
      .from("club_stripe_connect")
      .delete()
      .eq("club_id", clubId);
    expect(removeFixture.error?.message).toBeUndefined();

    if (existing.data) {
      const restore = await clients.service
        .from("club_stripe_connect")
        .insert(existing.data);
      expect(restore.error?.message).toBeUndefined();
    }
  };
}

function form(clubId: string, status: "draft" | "open" | "closed" = "draft") {
  const id = randomUUID();
  createdIds.registration_forms.push(id);
  return {
    id,
    club_id: clubId,
    slug: `contract-${id.slice(0, 8)}`,
    title: `Contract ${status} form`,
    status,
  };
}

async function insertDraftForm(clubId: string = CLUB_IDS.alpha) {
  const row = form(clubId);
  const { error } = await clients.service.from("registration_forms").insert(row);
  expect(error?.message).toBeUndefined();
  return row;
}

async function insertAdultCoreFields(formRow: Awaited<ReturnType<typeof insertDraftForm>>) {
  const fields = [
    ["registrant_name", "Registrant name", "name", "adult"],
    ["registrant_email", "Registrant email", "email", "adult"],
    ["registrant_phone", "Registrant phone", "phone", "adult"],
    ["emergency_contact_name", "Emergency contact name", "name", "all"],
    ["emergency_contact_phone", "Emergency contact phone", "phone", "all"],
  ].map(([field_key, label, field_type, participant_scope], position) => ({
    id: randomUUID(),
    club_id: formRow.club_id,
    form_id: formRow.id,
    field_key,
    label,
    field_type,
    is_core: true,
    required: true,
    participant_scope,
    position,
  }));
  createdIds.registration_form_fields.push(...fields.map((field) => field.id));
  const insert = await clients.service
    .from("registration_form_fields")
    .insert(fields);
  expect(insert.error?.message).toBeUndefined();
  return fields;
}

async function insertMinorCoreFields(formRow: Awaited<ReturnType<typeof insertDraftForm>>) {
  const fields = [
    ["player_name", "Player name", "name", "minor"],
    ["guardian_name", "Guardian name", "name", "minor"],
    ["guardian_email", "Guardian email", "email", "minor"],
    ["guardian_phone", "Guardian phone", "phone", "minor"],
    ["emergency_contact_name", "Emergency contact name", "name", "all"],
    ["emergency_contact_phone", "Emergency contact phone", "phone", "all"],
  ].map(([field_key, label, field_type, participant_scope], position) => ({
    id: randomUUID(), club_id: formRow.club_id, form_id: formRow.id,
    field_key, label, field_type, is_core: true, required: true, participant_scope, position,
  }));
  createdIds.registration_form_fields.push(...fields.map((field) => field.id));
  const insert = await clients.service.from("registration_form_fields").insert(fields);
  expect(insert.error?.message).toBeUndefined();
  return fields;
}

async function insertBothCoreFields(formRow: Awaited<ReturnType<typeof insertDraftForm>>) {
  const fields = [
    ["player_name", "Player name", "name", "minor"],
    ["guardian_name", "Guardian name", "name", "minor"],
    ["guardian_email", "Guardian email", "email", "minor"],
    ["guardian_phone", "Guardian phone", "phone", "minor"],
    ["registrant_name", "Registrant name", "name", "adult"],
    ["registrant_email", "Registrant email", "email", "adult"],
    ["registrant_phone", "Registrant phone", "phone", "adult"],
    ["emergency_contact_name", "Emergency contact name", "name", "all"],
    ["emergency_contact_phone", "Emergency contact phone", "phone", "all"],
  ].map(([field_key, label, field_type, participant_scope], position) => ({
    id: randomUUID(), club_id: formRow.club_id, form_id: formRow.id,
    field_key, label, field_type, is_core: true, required: true, participant_scope, position,
  }));
  createdIds.registration_form_fields.push(...fields.map((field) => field.id));
  const insert = await clients.service.from("registration_form_fields").insert(fields);
  expect(insert.error?.message).toBeUndefined();
  return fields;
}

async function insertOpenForm(clubId: string = CLUB_IDS.alpha) {
  const row = await insertDraftForm(clubId);
  await insertAdultCoreFields(row);
  const priceId = randomUUID();
  createdIds.registration_price_options.push(priceId);
  const price = {
    id: priceId,
    club_id: clubId,
    form_id: row.id,
    label: "Contract price",
    amount_cents: 0,
    position: 0,
  };
  const priceInsert = await clients.service
    .from("registration_price_options")
    .insert(price);
  expect(priceInsert.error?.message).toBeUndefined();
  const formOpen = await clients.service
    .from("registration_forms")
    .update({ status: "open" })
    .eq("club_id", clubId)
    .eq("id", row.id);
  expect(formOpen.error?.message).toBeUndefined();
  return { ...row, status: "open" as const, price };
}

async function createRegistrationMember(role: "owner" | "admin") {
  const email = `registration-${role}-${randomUUID()}@local.test`;
  const created = await clients.service.auth.admin.createUser({
    email,
    password: "local-contract-only",
    email_confirm: true,
  });
  expect(created.error?.message).toBeUndefined();
  const userId = created.data.user!.id;
  const membership = await clients.service.from("club_members").insert({
    user_id: userId,
    club_id: CLUB_IDS.alpha,
    role,
    status: "active",
  });
  expect(membership.error?.message).toBeUndefined();

  const session = await createFreshLocalClient({ email, userId });
  return {
    client: session.client,
    cleanup: async () => {
      await session.cleanup();
      await clients.service
        .from("club_members")
        .delete()
        .eq("user_id", userId)
        .eq("club_id", CLUB_IDS.alpha);
      await clients.service.auth.admin.deleteUser(userId);
    },
  };
}

function registrationRow(formRow: Awaited<ReturnType<typeof insertOpenForm>>) {
  const id = randomUUID();
  createdIds.registrations.push(id);
  return {
    id,
    club_id: formRow.club_id,
    form_id: formRow.id,
    answers: {},
    registrant_email: "family@contract.test",
    participant_type: "adult",
    price_option_id: formRow.price.id,
    price_label: formRow.price.label,
    amount_cents: formRow.price.amount_cents,
    waiver_accepted_at: new Date().toISOString(),
    status_token_hash: randomUUID().replaceAll("-", "").repeat(2),
  };
}

async function insertPaidPendingRegistration(
  environment: "test" | "production" = "test",
) {
  cleanups.push(await isolateClubConnect(CLUB_IDS.alpha));
  const stripeAccountId = `acct_${randomUUID().replaceAll("-", "")}`;
  const connect = await clients.service.from("club_stripe_connect").upsert({
    club_id: CLUB_IDS.alpha,
    stripe_account_id: stripeAccountId,
    environment,
    charges_enabled: true,
    details_submitted: true,
    payouts_enabled: true,
  });
  expect(connect.error?.message).toBeUndefined();

  const formRow = await insertDraftForm();
  await insertAdultCoreFields(formRow);
  const priceId = randomUUID();
  createdIds.registration_price_options.push(priceId);
  const price = {
    id: priceId,
    club_id: CLUB_IDS.alpha,
    form_id: formRow.id,
    label: "Paid contract registration",
    amount_cents: 2500,
    position: 0,
  };
  expect(
    (await clients.service.from("registration_price_options").insert(price)).error
      ?.message,
  ).toBeUndefined();
  expect(
    (await clients.service.from("registration_forms")
      .update({ status: "open" })
      .eq("id", formRow.id)).error?.message,
  ).toBeUndefined();

  const registrationId = randomUUID();
  const checkoutSessionId = `${environment === "production" ? "cs_live_" : "cs_test_"}${randomUUID().replaceAll("-", "")}`;
  createdIds.registrations.push(registrationId);
  const registration = await clients.service.from("registrations").insert({
    id: registrationId,
    club_id: CLUB_IDS.alpha,
    form_id: formRow.id,
    answers: {},
    registrant_email: "paid@contract.test",
    participant_type: "adult",
    price_option_id: price.id,
    price_label: price.label,
    amount_cents: price.amount_cents,
    waiver_accepted_at: new Date().toISOString(),
    status_token_hash: randomUUID().replaceAll("-", "").repeat(2),
    stripe_checkout_session_id: checkoutSessionId,
  });
  expect(registration.error?.message).toBeUndefined();
  return { registrationId, checkoutSessionId, stripeAccountId, amount: price.amount_cents };
}

async function setRegistrationExpiry(
  registrationId: string,
  expiryOffsetMinutes: number,
) {
  const now = Date.now();
  const update = await clients.service.from("registrations").update({
    submitted_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(now + expiryOffsetMinutes * 60 * 1000).toISOString(),
  }).eq("id", registrationId);
  expect(update.error?.message).toBeUndefined();
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
});

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();

  for (const table of [
    "registrations",
    "registration_price_options",
    "registration_form_fields",
    "registration_forms",
  ]) {
    const ids = createdIds[table].splice(0);
    if (ids.length > 0) await clients.service.from(table).delete().in("id", ids);
  }
});

describe("registration definition visibility and RLS contract", () => {
  it("requires the fixed adult core fields before a form can open", async () => {
    const row = await insertDraftForm();
    const priceId = randomUUID();
    createdIds.registration_price_options.push(priceId);
    const price = await clients.service.from("registration_price_options").insert({
      id: priceId,
      club_id: CLUB_IDS.alpha,
      form_id: row.id,
      label: "Free registration",
      amount_cents: 0,
      position: 0,
    });
    expect(price.error?.message).toBeUndefined();

    const missingCore = await clients.service
      .from("registration_forms")
      .update({ status: "open" })
      .eq("id", row.id);
    expect(missingCore.error?.message).toContain(
      "REGISTRATION_CORE_FIELDS_REQUIRED",
    );

    await insertAdultCoreFields(row);
    const open = await clients.service
      .from("registration_forms")
      .update({ status: "open" })
      .eq("id", row.id);
    expect(open.error?.message).toBeUndefined();
  });

  it("requires the distinct player, guardian, and emergency-contact core fields for minor forms", async () => {
    const minor = { ...form(CLUB_IDS.alpha), participant_mode: "minor_only" };
    const formInsert = await clients.service.from("registration_forms").insert(minor);
    expect(formInsert.error?.message).toBeUndefined();
    const priceId = randomUUID();
    createdIds.registration_price_options.push(priceId);
    const price = await clients.service.from("registration_price_options").insert({
      id: priceId, club_id: CLUB_IDS.alpha, form_id: minor.id,
      label: "Free minor registration", amount_cents: 0, position: 0,
    });
    expect(price.error?.message).toBeUndefined();
    const adultFields = await insertAdultCoreFields(minor);
    const adultFieldsRejected = await clients.service.from("registration_forms")
      .update({ status: "open" }).eq("id", minor.id);
    expect(adultFieldsRejected.error?.message).toMatch(
      /REGISTRATION_CORE_(FIELDS_REQUIRED|FIELD_INVALID)/,
    );
    const removeAdultFields = await clients.service
      .from("registration_form_fields")
      .delete()
      .in("id", adultFields.map((field) => field.id));
    expect(removeAdultFields.error?.message).toBeUndefined();
    createdIds.registration_form_fields = createdIds.registration_form_fields.filter(
      (id) => !adultFields.some((field) => field.id === id),
    );
    await insertMinorCoreFields(minor);
    const open = await clients.service.from("registration_forms")
      .update({ status: "open" }).eq("id", minor.id);
    expect(open.error?.message).toBeUndefined();
  });

  it("requires both core branches before a both-mode form can open", async () => {
    const both = { ...form(CLUB_IDS.alpha), participant_mode: "both" };
    const formInsert = await clients.service.from("registration_forms").insert(both);
    expect(formInsert.error?.message).toBeUndefined();
    const priceId = randomUUID();
    createdIds.registration_price_options.push(priceId);
    const price = await clients.service.from("registration_price_options").insert({
      id: priceId, club_id: CLUB_IDS.alpha, form_id: both.id,
      label: "Free combined registration", amount_cents: 0, position: 0,
    });
    expect(price.error?.message).toBeUndefined();
    await insertBothCoreFields(both);
    const open = await clients.service.from("registration_forms")
      .update({ status: "open" }).eq("id", both.id);
    expect(open.error?.message).toBeUndefined();
  });

  it("rejects invalid participant modes at the database boundary", async () => {
    const invalid = await clients.service.from("registration_forms").insert({
      ...form(CLUB_IDS.alpha),
      participant_mode: "sometimes",
    });
    expectPostgrestError(invalid.error, "23514", "invalid participant mode");
  });

  it("shows anonymous visitors only open definitions for live clubs", async () => {
    const open = await insertOpenForm(CLUB_IDS.alpha);
    const draft = await insertDraftForm(CLUB_IDS.alpha);
    const closed = await insertDraftForm(CLUB_IDS.alpha);
    const close = await clients.service
      .from("registration_forms")
      .update({ status: "closed" })
      .eq("id", closed.id);
    expect(close.error?.message).toBeUndefined();
    const preview = await insertOpenForm(CLUB_IDS.bravo);
    const openFieldId = randomUUID();
    const draftFieldId = randomUUID();
    const draftPriceId = randomUUID();
    createdIds.registration_form_fields.push(openFieldId, draftFieldId);
    createdIds.registration_price_options.push(draftPriceId);
    const definitions = await clients.service
      .from("registration_form_fields")
      .insert([
        {
          id: openFieldId,
          club_id: CLUB_IDS.alpha,
          form_id: open.id,
          field_key: "open_name",
          label: "Open name",
          field_type: "name",
          position: 10,
        },
        {
          id: draftFieldId,
          club_id: CLUB_IDS.alpha,
          form_id: draft.id,
          field_key: "draft_name",
          label: "Draft name",
          field_type: "name",
          position: 0,
        },
      ]);
    expect(definitions.error?.message).toBeUndefined();
    const draftPrice = await clients.service
      .from("registration_price_options")
      .insert({
        id: draftPriceId,
        club_id: CLUB_IDS.alpha,
        form_id: draft.id,
        label: "Draft price",
        amount_cents: 1000,
        position: 0,
      });
    expect(draftPrice.error?.message).toBeUndefined();

    const { data, error } = await clients.anon
      .from("registration_forms")
      .select("id,status")
      .in("id", [open.id, draft.id, closed.id, preview.id]);
    expect(error?.message).toBeUndefined();
    expect(data).toEqual([{ id: open.id, status: "open" }]);

    const fields = await clients.anon
      .from("registration_form_fields")
      .select("id")
      .in("id", [openFieldId, draftFieldId]);
    const prices = await clients.anon
      .from("registration_price_options")
      .select("id")
      .in("id", [open.price.id, draftPriceId]);
    expect(fields.error?.message).toBeUndefined();
    expect(prices.error?.message).toBeUndefined();
    expect(fields.data).toEqual([{ id: openFieldId }]);
    expect(prices.data).toEqual([{ id: open.price.id }]);
  });

  it("denies anonymous reads and writes for registrations and Connect records", async () => {
    const formRow = await insertOpenForm();
    const registrations = await clients.anon.from("registrations").select("id");
    const connect = await clients.anon.from("club_stripe_connect").select("club_id");
    expect(registrations.data ?? []).toEqual([]);
    expect(connect.data ?? []).toEqual([]);

    const registrationWrite = await clients.anon
      .from("registrations")
      .insert(registrationRow(formRow));
    const connectWrite = await clients.anon.from("club_stripe_connect").insert({
      club_id: CLUB_IDS.alpha,
      stripe_account_id: "acct_forged_contract",
      environment: "test",
    });
    expectPostgrestError(
      registrationWrite.error,
      "42501",
      "anonymous registration write",
    );
    expectPostgrestError(
      connectWrite.error,
      "42501",
      "anonymous Connect write",
    );
  });

  it("blocks paid-form publication until Connect charges are enabled", async () => {
    const restoreConnect = await isolateClubConnect(CLUB_IDS.alpha);
    try {
      const row = await insertDraftForm();
      const priceId = randomUUID();
      createdIds.registration_price_options.push(priceId);
      const price = await clients.service
        .from("registration_price_options")
        .insert({
          id: priceId,
          club_id: CLUB_IDS.alpha,
          form_id: row.id,
          label: "Paid registration",
          amount_cents: 2500,
          position: 0,
        });
      expect(price.error?.message).toBeUndefined();
      await insertAdultCoreFields(row);

      const disconnectedOpen = await clients.service
        .from("registration_forms")
        .update({ status: "open" })
        .eq("id", row.id);
      expectPostgrestError(
        disconnectedOpen.error,
        "23514",
        "paid form without a Connect account",
      );

      const connect = await clients.service.from("club_stripe_connect").insert({
        club_id: CLUB_IDS.alpha,
        stripe_account_id: `acct_${randomUUID().replaceAll("-", "")}`,
        environment: "test",
        charges_enabled: false,
      });
      expect(connect.error?.message).toBeUndefined();

      const disabledOpen = await clients.service
        .from("registration_forms")
        .update({ status: "open" })
        .eq("id", row.id);
      expectPostgrestError(
        disabledOpen.error,
        "23514",
        "paid form with Connect charges disabled",
      );

      const enable = await clients.service
        .from("club_stripe_connect")
        .update({ charges_enabled: true })
        .eq("club_id", CLUB_IDS.alpha);
      expect(enable.error?.message).toBeUndefined();

      const enabledOpen = await clients.service
        .from("registration_forms")
        .update({ status: "open" })
        .eq("id", row.id);
      expect(enabledOpen.error?.message).toBeUndefined();
    } finally {
      await restoreConnect();
    }
  });

  it("allows fresh AAL1 owner and admin CRUD of definitions in their own club only", async () => {
    const owner = await createRegistrationMember("owner");
    const admin = await createRegistrationMember("admin");
    cleanups.push(owner.cleanup, admin.cleanup);

    const row = form(CLUB_IDS.alpha);
    const insert = await owner.client
      .from("registration_forms")
      .insert(row)
      .select("id,club_id")
      .single();
    expect(insert.error?.message).toBeUndefined();
    expect(insert.data).toEqual({ id: row.id, club_id: CLUB_IDS.alpha });
    await insertAdultCoreFields(row);

    const priceId = randomUUID();
    createdIds.registration_price_options.push(priceId);
    const price = await owner.client.from("registration_price_options").insert({
      id: priceId,
      club_id: CLUB_IDS.alpha,
      form_id: row.id,
      label: "Owner price",
      amount_cents: 0,
      position: 0,
    });
    expect(price.error?.message).toBeUndefined();

    const update = await admin.client
      .from("registration_forms")
      .update({ status: "open" })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", row.id);
    expect(update.error?.message).toBeUndefined();

    const forged = await owner.client.from("registration_forms").insert({
      ...form(CLUB_IDS.bravo),
    });
    expectPostgrestError(
      forged.error,
      "42501",
      "fresh AAL1 member cross-club form insert",
    );

    const deletion = await admin.client
      .from("registration_forms")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", row.id);
    expect(deletion.error?.message).toBeUndefined();
    createdIds.registration_forms = createdIds.registration_forms.filter(
      (id) => id !== row.id,
    );
  });

  it("allows a tenant admin to archive once while preserving public and tenant boundaries", async () => {
    const owner = await createRegistrationMember("owner");
    cleanups.push(owner.cleanup);

    const open = await insertOpenForm(CLUB_IDS.alpha);
    const neverPublished = await insertDraftForm(CLUB_IDS.alpha);
    const otherClub = await insertDraftForm(CLUB_IDS.bravo);
    const archivedAt = new Date().toISOString();
    const archivedField = await clients.service
      .from("registration_form_fields")
      .select("id,label")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("form_id", open.id)
      .limit(1)
      .single();
    const archivedPrice = await clients.service
      .from("registration_price_options")
      .select("id,label")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("form_id", open.id)
      .single();
    expect(archivedField.error?.message).toBeUndefined();
    expect(archivedPrice.error?.message).toBeUndefined();

    const archiveOpen = await owner.client
      .from("registration_forms")
      .update({ archived_at: archivedAt })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", open.id)
      .select("id,status,closed_at,archived_at")
      .single();
    expect(archiveOpen.error?.message).toBeUndefined();
    expect(archiveOpen.data).toMatchObject({
      id: open.id,
      status: "closed",
    });
    expect(archiveOpen.data?.closed_at).toBeTruthy();
    expect(new Date(archiveOpen.data!.archived_at!).toISOString()).toBe(
      archivedAt,
    );

    const archiveDraft = await owner.client
      .from("registration_forms")
      .update({ archived_at: archivedAt })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", neverPublished.id)
      .select("id,status,closed_at,archived_at")
      .single();
    expect(archiveDraft.error?.message).toBeUndefined();
    expect(archiveDraft.data).toMatchObject({
      id: neverPublished.id,
      status: "draft",
      closed_at: null,
    });
    expect(new Date(archiveDraft.data!.archived_at!).toISOString()).toBe(
      archivedAt,
    );

    const anonymousRead = await clients.anon
      .from("registration_forms")
      .select("id")
      .in("id", [open.id, neverPublished.id]);
    expect(anonymousRead.error?.message).toBeUndefined();
    expect(anonymousRead.data).toEqual([]);

    const editArchived = await owner.client
      .from("registration_forms")
      .update({ title: "Attempted archived edit" })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", open.id);
    expectPostgrestError(
      editArchived.error,
      "23514",
      "archived form mutation",
    );

    const insertedFieldId = randomUUID();
    createdIds.registration_form_fields.push(insertedFieldId);
    const insertArchivedField = await owner.client
      .from("registration_form_fields")
      .insert({
        id: insertedFieldId,
        club_id: CLUB_IDS.alpha,
        form_id: open.id,
        field_key: `archived_${insertedFieldId.slice(0, 8)}`,
        label: "Attempted archived field",
        field_type: "short_text",
        position: 99,
      });
    expectPostgrestError(
      insertArchivedField.error,
      "42501",
      "archived form field insert",
    );

    const updateArchivedField = await owner.client
      .from("registration_form_fields")
      .update({ label: "Attempted archived field update" })
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", archivedField.data!.id)
      .select("id");
    expect(updateArchivedField.error?.message).toBeUndefined();
    expect(updateArchivedField.data).toEqual([]);

    const deleteArchivedPrice = await owner.client
      .from("registration_price_options")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", archivedPrice.data!.id)
      .select("id");
    expect(deleteArchivedPrice.error?.message).toBeUndefined();
    expect(deleteArchivedPrice.data).toEqual([]);

    const deleteArchivedForm = await owner.client
      .from("registration_forms")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", open.id)
      .select("id");
    expect(deleteArchivedForm.error?.message).toBeUndefined();
    expect(deleteArchivedForm.data).toEqual([]);

    const archivedDefinition = await clients.service
      .from("registration_form_fields")
      .select("label")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", archivedField.data!.id)
      .single();
    const archivedPriceState = await clients.service
      .from("registration_price_options")
      .select("label")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", archivedPrice.data!.id)
      .single();
    expect(archivedDefinition.data?.label).toBe(archivedField.data!.label);
    expect(archivedPriceState.data?.label).toBe(archivedPrice.data!.label);

    const crossTenantArchive = await owner.client
      .from("registration_forms")
      .update({ archived_at: archivedAt })
      .eq("club_id", CLUB_IDS.bravo)
      .eq("id", otherClub.id)
      .select("id");
    expect(crossTenantArchive.error?.message).toBeUndefined();
    expect(crossTenantArchive.data).toEqual([]);

    const otherClubState = await clients.service
      .from("registration_forms")
      .select("archived_at")
      .eq("club_id", CLUB_IDS.bravo)
      .eq("id", otherClub.id)
      .single();
    expect(otherClubState.error?.message).toBeUndefined();
    expect(otherClubState.data?.archived_at).toBeNull();
  });

  it("guards form deletion at RLS once a registration exists", async () => {
    const admin = await createRegistrationMember("admin");
    cleanups.push(admin.cleanup);
    const open = await insertOpenForm(CLUB_IDS.alpha);
    const registration = registrationRow(open);
    const insertRegistration = await clients.service
      .from("registrations")
      .insert(registration);
    expect(insertRegistration.error?.message).toBeUndefined();

    const deletion = await admin.client
      .from("registration_forms")
      .delete()
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", open.id)
      .select("id");
    expect(deletion.error?.message).toBeUndefined();
    expect(deletion.data).toEqual([]);

    const retained = await clients.service
      .from("registration_forms")
      .select("id")
      .eq("club_id", CLUB_IDS.alpha)
      .eq("id", open.id)
      .single();
    expect(retained.error?.message).toBeUndefined();
    expect(retained.data?.id).toBe(open.id);
  });

  it("rejects cross-club form relationships at the database boundary", async () => {
    const bravoForm = await insertOpenForm(CLUB_IDS.bravo);
    const field = await clients.service.from("registration_form_fields").insert({
      id: randomUUID(),
      club_id: CLUB_IDS.alpha,
      form_id: bravoForm.id,
      field_key: "forged_field",
      label: "Forged field",
      field_type: "short_text",
      required: false,
      position: 0,
    });
    const price = await clients.service.from("registration_price_options").insert({
      id: randomUUID(),
      club_id: CLUB_IDS.alpha,
      form_id: bravoForm.id,
      label: "Forged price",
      amount_cents: 1000,
      position: 0,
    });
    const registration = await clients.service.from("registrations").insert({
      ...registrationRow(await insertOpenForm(CLUB_IDS.alpha)),
      form_id: bravoForm.id,
    });
    expectPostgrestError(field.error, "23503", "cross-club form field");
    expectPostgrestError(price.error, "23503", "cross-club price option");
    expectPostgrestError(
      registration.error,
      "23503",
      "cross-club registration",
    );
  });

  it("lets fresh AAL1 members read only their club registrations and reserves writes for service role", async () => {
    cleanups.push(await isolateClubConnect(CLUB_IDS.alpha));
    const connectInsert = await clients.service.from("club_stripe_connect").insert({
      club_id: CLUB_IDS.alpha,
      stripe_account_id: `acct_${randomUUID().replaceAll("-", "")}`,
      environment: "test",
      charges_enabled: true,
    });
    expect(connectInsert.error?.message).toBeUndefined();

    const formRow = await insertOpenForm();
    const registration = registrationRow(formRow);
    const serviceInsert = await clients.service.from("registrations").insert(registration);
    expect(serviceInsert.error?.message).toBeUndefined();
    const bravoForm = await insertOpenForm(CLUB_IDS.bravo);
    const bravoRegistration = registrationRow(bravoForm);
    const bravoInsert = await clients.service
      .from("registrations")
      .insert(bravoRegistration);
    expect(bravoInsert.error?.message).toBeUndefined();

    const owner = await createRegistrationMember("owner");
    const admin = await createRegistrationMember("admin");
    cleanups.push(owner.cleanup, admin.cleanup);

    for (const [role, member] of [["owner", owner], ["admin", admin]] as const) {
      const ownRows = await member.client
        .from("registrations")
        .select("id,club_id")
        .in("id", [registration.id, bravoRegistration.id]);
      expect(ownRows.error?.message).toBeUndefined();
      expect(ownRows.data).toEqual([
        { id: registration.id, club_id: CLUB_IDS.alpha },
      ]);

      const connectRows = await member.client
        .from("club_stripe_connect")
        .select("club_id")
        .in("club_id", [CLUB_IDS.alpha, CLUB_IDS.bravo]);
      expect(connectRows.error?.message).toBeUndefined();
      expect(connectRows.data).toEqual([{ club_id: CLUB_IDS.alpha }]);

      const browserWrite = await member.client
        .from("registrations")
        .insert(registrationRow(formRow));
      expectPostgrestError(
        browserWrite.error,
        "42501",
        `fresh AAL1 ${role} registration write`,
      );
    }
  });
});

describe("registration Stripe Connect projection RPC contract", () => {
  it("requires an exact attached pending checkout before atomically marking a registration paid", async () => {
    const fixture = await insertPaidPendingRegistration();
    const base = {
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "test",
      p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId,
      p_checkout_session_id: fixture.checkoutSessionId,
      p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: fixture.amount,
      p_payload_digest: "a".repeat(64),
    };
    const mismatch = await clients.service.rpc("apply_registration_checkout_event", {
      ...base,
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: fixture.amount + 1,
    });
    expect(mismatch.error?.message).toBeUndefined();
    expect(mismatch.data).toMatchObject({ code: "REGISTRATION_CHECKOUT_MISMATCH" });

    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const applied = await clients.service.rpc("apply_registration_checkout_event", {
      ...base, p_event_id: eventId,
    });
    expect(applied.error?.message).toBeUndefined();
    expect(applied.data).toMatchObject({ action: "applied", registrationId: fixture.registrationId });
    const { data: paid } = await clients.service.from("registrations")
      .select("status,stripe_payment_intent_id").eq("id", fixture.registrationId).single();
    expect(paid).toEqual({ status: "paid", stripe_payment_intent_id: base.p_payment_intent_id });

    const duplicate = await clients.service.rpc("apply_registration_checkout_event", {
      ...base, p_event_id: eventId,
    });
    expect(duplicate.data).toMatchObject({ code: "DUPLICATE_EVENT" });
  });

  it("atomically turns concurrent duplicate checkout deliveries into one apply and one no-op", async () => {
    const fixture = await insertPaidPendingRegistration();
    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const args = {
      p_event_id: eventId,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "test",
      p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId,
      p_checkout_session_id: fixture.checkoutSessionId,
      p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: fixture.amount,
      p_payload_digest: "f".repeat(64),
    };
    const [first, second] = await Promise.all([
      clients.service.rpc("apply_registration_checkout_event", args),
      clients.service.rpc("apply_registration_checkout_event", args),
    ]);
    expect(first.error?.message).toBeUndefined();
    expect(second.error?.message).toBeUndefined();
    expect([first.data?.action, second.data?.action].sort()).toEqual([
      "applied",
      "rejected",
    ]);
    expect([first.data?.code, second.data?.code]).toContain("DUPLICATE_EVENT");
    const { data: ledgerRows } = await clients.service.from("stripe_events")
      .select("id,outcome").eq("id", eventId);
    expect(ledgerRows).toEqual([{ id: eventId, outcome: "applied" }]);
  });

  it("allows the narrow checkout-expiry grace, then flags later canonical payments for manual recovery", async () => {
    const graceFixture = await insertPaidPendingRegistration();
    await setRegistrationExpiry(graceFixture.registrationId, -10);
    const gracePaymentIntentId = `pi_${randomUUID().replaceAll("-", "")}`;
    const grace = await clients.service.rpc("apply_registration_checkout_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "test", p_club_id: CLUB_IDS.alpha,
      p_registration_id: graceFixture.registrationId,
      p_checkout_session_id: graceFixture.checkoutSessionId,
      p_payment_intent_id: gracePaymentIntentId,
      p_amount_total: graceFixture.amount, p_payload_digest: "f".repeat(64),
    });
    expect(grace.error?.message).toBeUndefined();
    expect(grace.data).toMatchObject({ action: "applied" });

    const lateFixture = await insertPaidPendingRegistration();
    await setRegistrationExpiry(lateFixture.registrationId, -16);
    const lateEventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const late = await clients.service.rpc("apply_registration_checkout_event", {
      p_event_id: lateEventId,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "test", p_club_id: CLUB_IDS.alpha,
      p_registration_id: lateFixture.registrationId,
      p_checkout_session_id: lateFixture.checkoutSessionId,
      p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: lateFixture.amount, p_payload_digest: "6".repeat(64),
    });
    expect(late.error?.message).toBeUndefined();
    expect(late.data).toMatchObject({
      action: "recovery_required",
      code: "REGISTRATION_LATE_PAYMENT_RECOVERY_REQUIRED",
      registrationId: lateFixture.registrationId,
    });
    const { data: flagged } = await clients.service.from("registrations")
      .select("status,payment_recovery_required,payment_recovery_reason,payment_recovery_detected_at")
      .eq("id", lateFixture.registrationId).single();
    expect(flagged).toMatchObject({
      status: "pending",
      payment_recovery_required: true,
      payment_recovery_reason: "checkout_completed_after_expiry",
    });
    expect(flagged?.payment_recovery_detected_at).toEqual(expect.any(String));
    const { data: ledger } = await clients.service.from("stripe_events")
      .select("outcome,rejection_code").eq("id", lateEventId).single();
    expect(ledger).toEqual({
      outcome: "rejected",
      rejection_code: "REGISTRATION_LATE_PAYMENT_RECOVERY_REQUIRED",
    });
  });

  it("stores a partial refund and synchronizes Connect account status", async () => {
    const fixture = await insertPaidPendingRegistration();
    const paymentIntentId = `pi_${randomUUID().replaceAll("-", "")}`;
    const checkout = await clients.service.rpc("apply_registration_checkout_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(), p_environment: "test",
      p_club_id: CLUB_IDS.alpha, p_registration_id: fixture.registrationId,
      p_checkout_session_id: fixture.checkoutSessionId, p_payment_intent_id: paymentIntentId,
      p_amount_total: fixture.amount, p_payload_digest: "b".repeat(64),
    });
    expect(checkout.data).toMatchObject({ action: "applied" });
    const refundArgs = {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "charge.refunded", p_stripe_created_at: new Date().toISOString(),
      p_environment: "test", p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId, p_payment_intent_id: paymentIntentId,
      p_amount_refunded: 1000, p_payload_digest: "c".repeat(64),
    };
    const [firstRefund, duplicateRefund] = await Promise.all([
      clients.service.rpc("apply_registration_refund_event", refundArgs),
      clients.service.rpc("apply_registration_refund_event", refundArgs),
    ]);
    expect([firstRefund.data?.action, duplicateRefund.data?.action].sort()).toEqual([
      "applied", "rejected",
    ]);
    expect([firstRefund.data?.code, duplicateRefund.data?.code]).toContain("DUPLICATE_EVENT");
    const { data: refunded } = await clients.service.from("registrations")
      .select("status,amount_refunded_cents").eq("id", fixture.registrationId).single();
    expect(refunded).toEqual({ status: "refunded", amount_refunded_cents: 1000 });

    const connectArgs = {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "account.updated", p_stripe_created_at: new Date().toISOString(),
      p_environment: "test", p_club_id: CLUB_IDS.alpha,
      p_stripe_account_id: fixture.stripeAccountId, p_charges_enabled: false,
      p_details_submitted: false, p_payouts_enabled: false, p_payload_digest: "d".repeat(64),
    };
    const [firstConnect, duplicateConnect] = await Promise.all([
      clients.service.rpc("apply_registration_connect_event", connectArgs),
      clients.service.rpc("apply_registration_connect_event", connectArgs),
    ]);
    expect([firstConnect.data?.action, duplicateConnect.data?.action].sort()).toEqual([
      "applied", "rejected",
    ]);
    expect([firstConnect.data?.code, duplicateConnect.data?.code]).toContain("DUPLICATE_EVENT");
    const { data: account } = await clients.service.from("club_stripe_connect")
      .select("charges_enabled,details_submitted,payouts_enabled").eq("club_id", CLUB_IDS.alpha).single();
    expect(account).toEqual({ charges_enabled: false, details_submitted: false, payouts_enabled: false });
  });

  it("does not grant webhook RPC execution to anonymous or authenticated callers", async () => {
    const fixture = await insertPaidPendingRegistration();
    const args = {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "checkout.session.completed", p_stripe_created_at: new Date().toISOString(),
      p_environment: "test", p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId, p_checkout_session_id: fixture.checkoutSessionId,
      p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: fixture.amount, p_payload_digest: "e".repeat(64),
    };
    expect((await clients.anon.rpc("apply_registration_checkout_event", args)).error).not.toBeNull();
    const member = await createRegistrationMember("admin");
    cleanups.push(member.cleanup);
    expect((await member.client.rpc("apply_registration_checkout_event", args)).error).not.toBeNull();
  });

  it("applies a production-environment checkout event with a cs_live_ session id", async () => {
    const fixture = await insertPaidPendingRegistration("production");
    const applied = await clients.service.rpc("apply_registration_checkout_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "production",
      p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId,
      p_checkout_session_id: fixture.checkoutSessionId,
      p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
      p_amount_total: fixture.amount,
      p_payload_digest: "a".repeat(64),
    });
    expect(applied.error?.message).toBeUndefined();
    expect(applied.data).toMatchObject({
      action: "applied",
      registrationId: fixture.registrationId,
    });
  });

  it("rejects a checkout event whose session id prefix does not match its environment", async () => {
    const productionFixture = await insertPaidPendingRegistration("production");
    const productionWithTestId = await clients.service.rpc(
      "apply_registration_checkout_event",
      {
        p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
        p_event_type: "checkout.session.completed",
        p_stripe_created_at: new Date().toISOString(),
        p_environment: "production",
        p_club_id: CLUB_IDS.alpha,
        p_registration_id: productionFixture.registrationId,
        p_checkout_session_id: `cs_test_${randomUUID().replaceAll("-", "")}`,
        p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
        p_amount_total: productionFixture.amount,
        p_payload_digest: "b".repeat(64),
      },
    );
    expectPostgrestError(
      productionWithTestId.error,
      "22023",
      "production environment with cs_test_ session id",
    );

    const testFixture = await insertPaidPendingRegistration("test");
    const testWithLiveId = await clients.service.rpc(
      "apply_registration_checkout_event",
      {
        p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
        p_event_type: "checkout.session.completed",
        p_stripe_created_at: new Date().toISOString(),
        p_environment: "test",
        p_club_id: CLUB_IDS.alpha,
        p_registration_id: testFixture.registrationId,
        p_checkout_session_id: `cs_live_${randomUUID().replaceAll("-", "")}`,
        p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
        p_amount_total: testFixture.amount,
        p_payload_digest: "c".repeat(64),
      },
    );
    expectPostgrestError(
      testWithLiveId.error,
      "22023",
      "test environment with cs_live_ session id",
    );
  });

  it.each(["staging", "live"])(
    "rejects an invalid environment string (%s) on every registration Stripe event RPC",
    async (invalidEnvironment) => {
      const fixture = await insertPaidPendingRegistration("test");
      const checkout = await clients.service.rpc("apply_registration_checkout_event", {
        p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
        p_event_type: "checkout.session.completed",
        p_stripe_created_at: new Date().toISOString(),
        p_environment: invalidEnvironment,
        p_club_id: CLUB_IDS.alpha,
        p_registration_id: fixture.registrationId,
        p_checkout_session_id: fixture.checkoutSessionId,
        p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
        p_amount_total: fixture.amount,
        p_payload_digest: "d".repeat(64),
      });
      expectPostgrestError(
        checkout.error,
        "22023",
        `checkout event with environment ${invalidEnvironment}`,
      );

      const refund = await clients.service.rpc("apply_registration_refund_event", {
        p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
        p_event_type: "charge.refunded",
        p_stripe_created_at: new Date().toISOString(),
        p_environment: invalidEnvironment,
        p_club_id: CLUB_IDS.alpha,
        p_registration_id: fixture.registrationId,
        p_payment_intent_id: `pi_${randomUUID().replaceAll("-", "")}`,
        p_amount_refunded: 100,
        p_payload_digest: "e".repeat(64),
      });
      expectPostgrestError(
        refund.error,
        "22023",
        `refund event with environment ${invalidEnvironment}`,
      );

      const connect = await clients.service.rpc("apply_registration_connect_event", {
        p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
        p_event_type: "account.updated",
        p_stripe_created_at: new Date().toISOString(),
        p_environment: invalidEnvironment,
        p_club_id: CLUB_IDS.alpha,
        p_stripe_account_id: fixture.stripeAccountId,
        p_charges_enabled: true,
        p_details_submitted: true,
        p_payouts_enabled: true,
        p_payload_digest: "f".repeat(64),
      });
      expectPostgrestError(
        connect.error,
        "22023",
        `connect event with environment ${invalidEnvironment}`,
      );
    },
  );

  it("applies production-environment refund and connect events for a production connected account", async () => {
    const fixture = await insertPaidPendingRegistration("production");
    const paymentIntentId = `pi_${randomUUID().replaceAll("-", "")}`;
    const checkout = await clients.service.rpc("apply_registration_checkout_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "checkout.session.completed",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "production",
      p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId,
      p_checkout_session_id: fixture.checkoutSessionId,
      p_payment_intent_id: paymentIntentId,
      p_amount_total: fixture.amount,
      p_payload_digest: "1".repeat(64),
    });
    expect(checkout.data).toMatchObject({ action: "applied" });

    const refund = await clients.service.rpc("apply_registration_refund_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "charge.refunded",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "production",
      p_club_id: CLUB_IDS.alpha,
      p_registration_id: fixture.registrationId,
      p_payment_intent_id: paymentIntentId,
      p_amount_refunded: 500,
      p_payload_digest: "2".repeat(64),
    });
    expect(refund.error?.message).toBeUndefined();
    expect(refund.data).toMatchObject({
      action: "applied",
      registrationId: fixture.registrationId,
    });

    const connect = await clients.service.rpc("apply_registration_connect_event", {
      p_event_id: `evt_${randomUUID().replaceAll("-", "")}`,
      p_event_type: "account.updated",
      p_stripe_created_at: new Date().toISOString(),
      p_environment: "production",
      p_club_id: CLUB_IDS.alpha,
      p_stripe_account_id: fixture.stripeAccountId,
      p_charges_enabled: false,
      p_details_submitted: true,
      p_payouts_enabled: false,
      p_payload_digest: "3".repeat(64),
    });
    expect(connect.error?.message).toBeUndefined();
    expect(connect.data).toMatchObject({ action: "applied", clubId: CLUB_IDS.alpha });
  });
});
