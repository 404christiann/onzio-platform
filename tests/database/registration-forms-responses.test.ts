import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { expectPostgrestError } from "../helpers/database-security";
import { createFreshLocalClient } from "../helpers/mfa";
import {
  createLocalClients,
  requirePlannedDatabase,
  type LocalClients,
} from "../helpers/supabase";

// Database contracts for onzio.registration_forms and
// onzio.registration_responses, added in
// 20260818120100_registration_forms_responses.sql, plus the operator-only
// payment switches added in 20260818120200_club_payments_connect.sql.
//
// The boundary these own is an asymmetric one and every test below exists to
// hold one half of it:
//
//   * a form is public marketing-adjacent content, readable anonymously, but
//     only once the club has actually put it live;
//   * a response is family PII with no anonymous exposure at all -- anon holds
//     no grant, and `authenticated` holds read-only access scoped to its own
//     club, so the service-role API route is the only writer.

let clients: LocalClients;
const cleanups: Array<() => Promise<void>> = [];

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const MISSING_TABLE = "PGRST205";

const ALL_FIXTURE_CLUBS = [CLUB_IDS.alpha, CLUB_IDS.bravo, CLUB_IDS.charlie];

function form(overrides: Record<string, unknown> = {}) {
  return {
    club_id: CLUB_IDS.alpha,
    form_type: "general_interest",
    title: "2026 interest list",
    status: "live",
    ...overrides,
  };
}

function academyForm(overrides: Record<string, unknown> = {}) {
  return form({
    form_type: "academy_registration",
    title: "2026 academy intake",
    waiver_text: "Participation carries risk of injury.",
    waiver_version: 3,
    ...overrides,
  });
}

function response(formId: string, overrides: Record<string, unknown> = {}) {
  return {
    club_id: CLUB_IDS.alpha,
    form_id: formId,
    player_first_name: "Ada",
    player_last_name: "Rivera",
    player_dob: "2014-03-09",
    parent_guardian_name: "Marta Rivera",
    parent_guardian_email: "marta@example.test",
    parent_guardian_phone: "+1-503-555-0142",
    ...overrides,
  };
}

async function insertForm(overrides: Record<string, unknown> = {}) {
  const { data, error } = await clients.service
    .from("registration_forms")
    .insert(form(overrides))
    .select("id")
    .single();
  expect(error?.message).toBeUndefined();
  return data!.id as string;
}

async function clearRows() {
  await clients.service
    .from("registration_responses")
    .delete()
    .in("club_id", ALL_FIXTURE_CLUBS);
  await clients.service
    .from("registration_forms")
    .delete()
    .in("club_id", ALL_FIXTURE_CLUBS);
}

beforeEach(async () => {
  clients = createLocalClients();
  await requirePlannedDatabase(clients.service);
  await clearRows();
});

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
  await clearRows();
  await clients.service
    .from("clubs")
    .update({ payments_live_enabled: false, stripe_connect_account_id: null })
    .in("id", ALL_FIXTURE_CLUBS);
});

describe("onzio.registration_forms schema", () => {
  it("exposes the table", async () => {
    const { error } = await clients.service
      .from("registration_forms")
      .select("*")
      .limit(0);
    expect(error?.code).not.toBe(MISSING_TABLE);
    expect(error?.message).toBeUndefined();
  });

  it("defaults a new form to a draft that requires no payment", async () => {
    const { data, error } = await clients.service
      .from("registration_forms")
      .insert({
        club_id: CLUB_IDS.alpha,
        form_type: "general_interest",
        title: "Untitled intake",
      })
      .select("status, requires_payment, price_cents, currency")
      .single();
    expect(error?.message).toBeUndefined();
    expect(data).toEqual({
      status: "draft",
      requires_payment: false,
      price_cents: null,
      currency: null,
    });
  });

  it.each(["tryout_signup", "", "academy"])(
    "rejects %o as a form_type",
    async (formType) => {
      const { error } = await clients.service
        .from("registration_forms")
        .insert(form({ form_type: formType }));
      expectPostgrestError(error, CHECK_VIOLATION, `form_type ${formType}`);
    },
  );

  it.each(["published", "open", ""])(
    "rejects %o as a status",
    async (status) => {
      const { error } = await clients.service
        .from("registration_forms")
        .insert(form({ status }));
      expectPostgrestError(error, CHECK_VIOLATION, `status ${status}`);
    },
  );

  it("refuses a paid form that does not say what it charges", async () => {
    const missingPrice = await clients.service
      .from("registration_forms")
      .insert(form({ requires_payment: true, currency: "usd" }));
    expectPostgrestError(
      missingPrice.error,
      CHECK_VIOLATION,
      "paid form without price_cents",
    );

    const missingCurrency = await clients.service
      .from("registration_forms")
      .insert(form({ requires_payment: true, price_cents: 25000 }));
    expectPostgrestError(
      missingCurrency.error,
      CHECK_VIOLATION,
      "paid form without currency",
    );

    const complete = await clients.service
      .from("registration_forms")
      .insert(form({ requires_payment: true, price_cents: 25000, currency: "usd" }));
    expect(complete.error?.message).toBeUndefined();
  });

  it("lets an academy form stay a draft without a waiver but not go live without one", async () => {
    const draft = await clients.service
      .from("registration_forms")
      .insert(
        form({
          form_type: "academy_registration",
          status: "draft",
          waiver_text: null,
          waiver_version: null,
        }),
      )
      .select("id")
      .single();
    expect(
      draft.error?.message,
      "a half-written academy form must still be savable",
    ).toBeUndefined();

    const publish = await clients.service
      .from("registration_forms")
      .update({ status: "live" })
      .eq("id", draft.data!.id);
    expectPostgrestError(
      publish.error,
      CHECK_VIOLATION,
      "live academy form without waiver text",
    );

    const publishWithWaiver = await clients.service
      .from("registration_forms")
      .update({
        status: "live",
        waiver_text: "Participation carries risk of injury.",
        waiver_version: 1,
      })
      .eq("id", draft.data!.id);
    expect(publishWithWaiver.error?.message).toBeUndefined();
  });

  it("rejects a currency that is not lowercase ISO 4217", async () => {
    const { error } = await clients.service
      .from("registration_forms")
      .insert(form({ requires_payment: true, price_cents: 1000, currency: "USD" }));
    expectPostgrestError(error, CHECK_VIOLATION, "uppercase currency");
  });
});

describe("onzio.registration_forms authorization", () => {
  it("shows the public only live forms belonging to a publicly accessible club", async () => {
    const live = await insertForm({ title: "Live intake", status: "live" });
    await insertForm({ title: "Draft intake", status: "draft" });
    await insertForm({ title: "Closed intake", status: "closed" });

    const { data, error } = await clients.anon
      .from("registration_forms")
      .select("id, title")
      .eq("club_id", CLUB_IDS.alpha);
    expect(error?.message).toBeUndefined();
    expect(
      data,
      "a draft or closed form must not be discoverable on the public /join page",
    ).toEqual([{ id: live, title: "Live intake" }]);
  });

  it("hides even a live form for a club that is not publicly accessible", async () => {
    await clients.service
      .from("registration_forms")
      .insert(form({ club_id: CLUB_IDS.bravo, status: "live" }));

    const { data, error } = await clients.anon
      .from("registration_forms")
      .select("id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(error?.message).toBeUndefined();
    expect(data ?? []).toEqual([]);
  });

  it("denies an anonymous write", async () => {
    const { error } = await clients.anon
      .from("registration_forms")
      .insert(form());
    expectPostgrestError(
      error,
      PERMISSION_DENIED,
      "anonymous registration_forms insert",
    );
  });

  it("lets a club member see and manage only its own club's forms", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const draft = await insertForm({ title: "Draft intake", status: "draft" });
    await clients.service
      .from("registration_forms")
      .insert(form({ club_id: CLUB_IDS.bravo, title: "Bravo intake" }));

    const own = await session.client
      .from("registration_forms")
      .select("id")
      .eq("club_id", CLUB_IDS.alpha);
    expect(own.error?.message).toBeUndefined();
    expect(
      own.data,
      "a signed-in member must see its own club's unpublished forms",
    ).toEqual([{ id: draft }]);

    const foreign = await session.client
      .from("registration_forms")
      .select("id")
      .eq("club_id", CLUB_IDS.bravo);
    expect(foreign.error?.message).toBeUndefined();
    expect(foreign.data ?? []).toEqual([]);

    const allowed = await session.client
      .from("registration_forms")
      .insert(form({ title: "Member-created intake" }));
    expect(allowed.error?.message).toBeUndefined();

    const crossClub = await session.client
      .from("registration_forms")
      .insert(form({ club_id: CLUB_IDS.bravo, title: "Cross-club intake" }));
    expectPostgrestError(
      crossClub.error,
      PERMISSION_DENIED,
      "cross-club registration_forms insert",
    );

    await session.client
      .from("registration_forms")
      .delete()
      .eq("club_id", CLUB_IDS.bravo);
    const { data: survivors } = await clients.service
      .from("registration_forms")
      .select("title")
      .eq("club_id", CLUB_IDS.bravo);
    expect(
      survivors ?? [],
      "another club's form must survive a foreign delete attempt",
    ).toEqual([{ title: "Bravo intake" }]);
  });
});

describe("onzio.registration_responses schema", () => {
  it("defaults a submission to not_required payment and stamps submitted_at", async () => {
    const formId = await insertForm();
    const { data, error } = await clients.service
      .from("registration_responses")
      .insert(response(formId))
      .select("payment_status, submitted_at, waiver_accepted_at")
      .single();
    expect(error?.message).toBeUndefined();
    expect(data!.payment_status).toBe("not_required");
    expect(data!.waiver_accepted_at).toBeNull();
    expect(Number.isNaN(Date.parse(data!.submitted_at as string))).toBe(false);
  });

  it("refuses a submission pointed at another club's form", async () => {
    const alphaForm = await insertForm();
    const { error } = await clients.service
      .from("registration_responses")
      .insert(response(alphaForm, { club_id: CLUB_IDS.bravo }));
    expectPostgrestError(
      error,
      FOREIGN_KEY_VIOLATION,
      "cross-tenant (club_id, form_id) reference",
    );
  });

  it.each(["refunded", "complete", ""])(
    "rejects %o as a payment_status",
    async (paymentStatus) => {
      const formId = await insertForm();
      const { error } = await clients.service
        .from("registration_responses")
        .insert(response(formId, { payment_status: paymentStatus }));
      expectPostgrestError(
        error,
        CHECK_VIOLATION,
        `payment_status ${paymentStatus}`,
      );
    },
  );

  it("requires an amount and a timestamp before a submission may be called paid", async () => {
    const formId = await insertForm({
      requires_payment: true,
      price_cents: 25000,
      currency: "usd",
    });

    const unevidenced = await clients.service
      .from("registration_responses")
      .insert(response(formId, { payment_status: "paid" }));
    expectPostgrestError(
      unevidenced.error,
      CHECK_VIOLATION,
      "paid submission without amount or paid_at",
    );

    const evidenced = await clients.service
      .from("registration_responses")
      .insert(
        response(formId, {
          payment_status: "paid",
          amount_paid_cents: 25000,
          paid_at: new Date().toISOString(),
          stripe_checkout_session_id: "cs_test_contract_only",
          stripe_payment_intent_id: "pi_test_contract_only",
        }),
      );
    expect(evidenced.error?.message).toBeUndefined();
  });

  it("rejects a waiver timestamp with no version behind it", async () => {
    const formId = await insertForm();
    const { error } = await clients.service
      .from("registration_responses")
      .insert(
        response(formId, { waiver_accepted_at: new Date().toISOString() }),
      );
    expectPostgrestError(
      error,
      CHECK_VIOLATION,
      "waiver timestamp without a version",
    );
  });

  it("rejects an implausible date of birth and a malformed guardian email", async () => {
    const formId = await insertForm();

    const futureDob = await clients.service
      .from("registration_responses")
      .insert(response(formId, { player_dob: "2999-01-01" }));
    expectPostgrestError(futureDob.error, CHECK_VIOLATION, "future player_dob");

    const badEmail = await clients.service
      .from("registration_responses")
      .insert(response(formId, { parent_guardian_email: "marta@example" }));
    expectPostgrestError(
      badEmail.error,
      CHECK_VIOLATION,
      "malformed guardian email",
    );
  });
});

describe("onzio.registration_responses academy waiver enforcement", () => {
  it("refuses an academy submission with no accepted waiver", async () => {
    const { data, error } = await clients.service
      .from("registration_forms")
      .insert(academyForm())
      .select("id")
      .single();
    expect(error?.message).toBeUndefined();

    const missing = await clients.service
      .from("registration_responses")
      .insert(response(data!.id));
    expectPostgrestError(
      missing.error,
      CHECK_VIOLATION,
      "academy submission without waiver acceptance",
    );
    expect(missing.error?.message).toMatch(/waiver/i);

    const accepted = await clients.service
      .from("registration_responses")
      .insert(
        response(data!.id, {
          waiver_accepted_at: new Date().toISOString(),
          waiver_version_accepted: 3,
        }),
      );
    expect(accepted.error?.message).toBeUndefined();
  });

  it("refuses to strip waiver acceptance off an existing academy submission", async () => {
    const { data } = await clients.service
      .from("registration_forms")
      .insert(academyForm())
      .select("id")
      .single();

    const created = await clients.service
      .from("registration_responses")
      .insert(
        response(data!.id, {
          waiver_accepted_at: new Date().toISOString(),
          waiver_version_accepted: 3,
        }),
      )
      .select("id")
      .single();
    expect(created.error?.message).toBeUndefined();

    const stripped = await clients.service
      .from("registration_responses")
      .update({ waiver_accepted_at: null, waiver_version_accepted: null })
      .eq("id", created.data!.id);
    expectPostgrestError(
      stripped.error,
      CHECK_VIOLATION,
      "clearing waiver acceptance on an academy submission",
    );
  });

  it("does not require a waiver on a general-interest submission", async () => {
    const formId = await insertForm({ form_type: "general_interest" });
    const { error } = await clients.service
      .from("registration_responses")
      .insert(response(formId, { interest_area: "Goalkeeping" }));
    expect(error?.message).toBeUndefined();
  });
});

describe("onzio.registration_responses authorization", () => {
  it("gives anonymous callers no access to family PII at all", async () => {
    const formId = await insertForm();
    await clients.service
      .from("registration_responses")
      .insert(response(formId));

    const read = await clients.anon
      .from("registration_responses")
      .select("player_first_name")
      .eq("club_id", CLUB_IDS.alpha);
    expectPostgrestError(
      read.error,
      PERMISSION_DENIED,
      "anonymous registration_responses select",
    );

    const write = await clients.anon
      .from("registration_responses")
      .insert(response(formId));
    expectPostgrestError(
      write.error,
      PERMISSION_DENIED,
      "anonymous registration_responses insert",
    );
  });

  it("lets a club member read its own submissions but never write one", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const formId = await insertForm();
    const created = await clients.service
      .from("registration_responses")
      .insert(response(formId))
      .select("id")
      .single();
    expect(created.error?.message).toBeUndefined();

    const read = await session.client
      .from("registration_responses")
      .select("id, parent_guardian_email")
      .eq("club_id", CLUB_IDS.alpha);
    expect(read.error?.message).toBeUndefined();
    expect(read.data).toEqual([
      { id: created.data!.id, parent_guardian_email: "marta@example.test" },
    ]);

    // Submissions are written only by the service-role API route: the table
    // grants `authenticated` nothing beyond SELECT.
    const insert = await session.client
      .from("registration_responses")
      .insert(response(formId, { player_first_name: "Forged" }));
    expectPostgrestError(
      insert.error,
      PERMISSION_DENIED,
      "club member registration_responses insert",
    );

    const update = await session.client
      .from("registration_responses")
      .update({ payment_status: "paid" })
      .eq("id", created.data!.id);
    expectPostgrestError(
      update.error,
      PERMISSION_DENIED,
      "club member registration_responses update",
    );

    const remove = await session.client
      .from("registration_responses")
      .delete()
      .eq("id", created.data!.id);
    expectPostgrestError(
      remove.error,
      PERMISSION_DENIED,
      "club member registration_responses delete",
    );
  });

  it("hides another club's submissions from a signed-in member", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const bravoForm = await clients.service
      .from("registration_forms")
      .insert(form({ club_id: CLUB_IDS.bravo }))
      .select("id")
      .single();
    await clients.service
      .from("registration_responses")
      .insert(
        response(bravoForm.data!.id, {
          club_id: CLUB_IDS.bravo,
          parent_guardian_email: "other-club@example.test",
        }),
      );

    const { data, error } = await session.client
      .from("registration_responses")
      .select("parent_guardian_email");
    expect(error?.message).toBeUndefined();
    expect(
      data ?? [],
      "an alpha member must not read a bravo family's contact details",
    ).toEqual([]);
  });
});

describe("onzio.clubs registration payment switches", () => {
  it("starts every club with live payments off and no connected account", async () => {
    const { data, error } = await clients.service
      .from("clubs")
      .select("id, payments_live_enabled, stripe_connect_account_id")
      .in("id", ALL_FIXTURE_CLUBS);
    expect(error?.message).toBeUndefined();
    expect(
      data?.every(
        (club: Record<string, unknown>) =>
          club.payments_live_enabled === false &&
          club.stripe_connect_account_id === null,
      ),
      "no club may start out able to take live money",
    ).toBe(true);
  });

  it("rejects a connected account id that is not a Stripe acct_ reference", async () => {
    const { error } = await clients.service
      .from("clubs")
      .update({ stripe_connect_account_id: "cus_not_an_account" })
      .eq("id", CLUB_IDS.alpha);
    expectPostgrestError(
      error,
      CHECK_VIOLATION,
      "malformed stripe_connect_account_id",
    );
  });

  it("refuses to let a club owner flip its own payments_live_enabled", async () => {
    const session = await createFreshLocalClient({
      email: "owner-aal2@alpha.local",
      userId: USER_IDS.ownerAal2,
    });
    cleanups.push(session.cleanup);

    const attempt = await session.client
      .from("clubs")
      .update({ payments_live_enabled: true, stripe_connect_account_id: "acct_self" })
      .eq("id", CLUB_IDS.alpha);
    expectPostgrestError(
      attempt.error,
      PERMISSION_DENIED,
      "club owner enabling live payments",
    );

    const { data } = await clients.service
      .from("clubs")
      .select("payments_live_enabled, stripe_connect_account_id")
      .eq("id", CLUB_IDS.alpha)
      .single();
    expect(data).toEqual({
      payments_live_enabled: false,
      stripe_connect_account_id: null,
    });
  });

  it("lets the operator boundary enable payments for a single club", async () => {
    const enabled = await clients.service
      .from("clubs")
      .update({
        payments_live_enabled: true,
        stripe_connect_account_id: "acct_1LocalContractOnly",
      })
      .eq("id", CLUB_IDS.alpha);
    expect(enabled.error?.message).toBeUndefined();

    const { data } = await clients.service
      .from("clubs")
      .select("id, payments_live_enabled")
      .in("id", ALL_FIXTURE_CLUBS);
    const enabledIds = (data ?? [])
      .filter((club: Record<string, unknown>) => club.payments_live_enabled)
      .map((club: Record<string, unknown>) => club.id);
    expect(
      enabledIds,
      "enabling payments for one club must not enable them for any other",
    ).toEqual([CLUB_IDS.alpha]);
  });
});
