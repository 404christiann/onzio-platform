import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";
import {
  connectWebhookSecrets,
  isConnectLiveKeyConfigured,
  resolveConnectStripeCredentials,
  type ConnectEnv,
  type ConnectStripeCredentials,
} from "@/lib/stripe/connect-config";
import { createConnectStripeClient } from "@/lib/stripe/connect-client";
import { createConnectedCheckoutSession } from "@/lib/stripe/connect-checkout";
import {
  classifyConnectAccount,
  getConnectAccountStatus,
} from "@/lib/stripe/connect-account-status";

const ROOT = process.cwd();

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const FORM_ID = "22222222-2222-4222-8222-222222222222";
const RESPONSE_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "acct_connected_club";
const SESSION_ID = "cs_test_session";

const TEST_KEY = "sk_test_connect_contract_only";
const LIVE_KEY = "sk_live_should_not_exist_in_this_phase";
const CONNECT_WEBHOOK_SECRET = "whsec_connect_test_contract_only";

/** The environment this phase actually ships: a test key and no live key. */
const PHASE_ENV: ConnectEnv = {
  ONZIO_ENVIRONMENT: "staging",
  STRIPE_CONNECT_TEST_SECRET_KEY: TEST_KEY,
  STRIPE_CONNECT_TEST_WEBHOOK_SECRET: CONNECT_WEBHOOK_SECRET,
};

/** A hypothetical future environment that also configures a live key. */
const LIVE_CAPABLE_ENV: ConnectEnv = {
  ...PHASE_ENV,
  STRIPE_CONNECT_LIVE_SECRET_KEY: LIVE_KEY,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Minimal Supabase test double
// ---------------------------------------------------------------------------
// Deliberately hand-written rather than a broad auto-mock: these tests assert
// what is written to onzio.registration_responses, so the writes have to be
// observable and the filters have to actually filter.

type Row = Record<string, any>;

type FaultKey = `${string}:${"select" | "insert" | "update" | "delete"}`;

type FakeDatabase = {
  tables: Record<string, Row[]>;
  faults?: Partial<Record<FaultKey, { code?: string; message: string }>>;
};

function createFakeSupabase(database: FakeDatabase) {
  const writes: Array<{ table: string; kind: string; values?: Row }> = [];

  const from = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let kind: "select" | "insert" | "update" | "delete" = "select";
    let values: Row | undefined;

    const rows = () => (database.tables[table] ?? []).filter((row) =>
      filters.every((predicate) => predicate(row)),
    );

    const fault = (operation: typeof kind) =>
      database.faults?.[`${table}:${operation}` as FaultKey] ?? null;

    const run = () => {
      const failure = fault(kind);
      if (failure) return { data: null, error: failure };

      if (kind === "insert") {
        const existing = database.tables[table] ?? (database.tables[table] = []);
        if (values?.id && existing.some((row) => row.id === values!.id)) {
          return {
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          };
        }
        const inserted = { id: values?.id ?? `${table}_${existing.length + 1}`, ...values };
        existing.push(inserted);
        writes.push({ table, kind, values: { ...inserted } });
        return { data: [inserted], error: null };
      }
      if (kind === "update") {
        const matched = rows();
        for (const row of matched) Object.assign(row, values);
        writes.push({ table, kind, values: { ...values } });
        return { data: matched, error: null };
      }
      if (kind === "delete") {
        const matched = new Set(rows());
        database.tables[table] = (database.tables[table] ?? []).filter(
          (row) => !matched.has(row),
        );
        writes.push({ table, kind });
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };

    const builder: any = {
      select: () => builder,
      insert: (payload: Row) => {
        kind = "insert";
        values = payload;
        return builder;
      },
      update: (payload: Row) => {
        kind = "update";
        values = payload;
        return builder;
      },
      delete: () => {
        kind = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator === "is" && value === null) {
          filters.push((row) => row[column] !== null && row[column] !== undefined);
        }
        return builder;
      },
      maybeSingle: async () => {
        const result = run();
        if (result.error) return { data: null, error: result.error };
        const matched = result.data as Row[] | null;
        return { data: matched?.[0] ?? null, error: null };
      },
      single: async () => {
        const result = run();
        if (result.error) return { data: null, error: result.error };
        const matched = result.data as Row[] | null;
        return matched?.[0]
          ? { data: matched[0], error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      },
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve(run()).then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    client: { schema: () => ({ from }) } as any,
    writes,
  };
}

function seedDatabase(overrides: {
  club?: Row;
  form?: Row;
  response?: Row;
  faults?: FakeDatabase["faults"];
} = {}): FakeDatabase {
  return {
    tables: {
      clubs: [
        {
          id: CLUB_ID,
          name: "CV United",
          lifecycle: "active",
          stripe_connect_account_id: ACCOUNT_ID,
          // The seeded default for every club in
          // 20260818120200_club_payments_connect.sql.
          payments_live_enabled: false,
          ...overrides.club,
        },
      ],
      club_domains: [
        {
          club_id: CLUB_ID,
          hostname: "cvunited.example",
          environment: "staging",
          is_primary: true,
          active: true,
          verified_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      registration_forms: [
        {
          id: FORM_ID,
          club_id: CLUB_ID,
          title: "2026 Academy Registration",
          status: "live",
          requires_payment: true,
          price_cents: 25000,
          currency: "usd",
          ...overrides.form,
        },
      ],
      registration_responses: [
        {
          id: RESPONSE_ID,
          club_id: CLUB_ID,
          form_id: FORM_ID,
          payment_status: "pending",
          parent_guardian_email: "parent@example.com",
          player_first_name: "Ada",
          player_last_name: "Lovelace",
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          amount_paid_cents: null,
          paid_at: null,
          ...overrides.response,
        },
      ],
      stripe_connect_events: [],
    },
    faults: overrides.faults,
  };
}

function fakeStripe(options: {
  account?: Record<string, unknown>;
  session?: Record<string, unknown>;
} = {}) {
  const sessionCreate = vi.fn(async () => ({
    id: SESSION_ID,
    url: "https://checkout.stripe.com/c/pay/cs_test_session",
    ...options.session,
  }));
  const accountRetrieve = vi.fn(async () => ({
    id: ACCOUNT_ID,
    charges_enabled: true,
    details_submitted: true,
    payouts_enabled: true,
    requirements: { currently_due: [], disabled_reason: null },
    ...options.account,
  }));
  const client = {
    accounts: { retrieve: accountRetrieve, create: vi.fn() },
    accountLinks: { create: vi.fn() },
    checkout: { sessions: { create: sessionCreate } },
  } as any;
  return { client, sessionCreate, accountRetrieve };
}

async function sourceFiles(root: string): Promise<string[]> {
  const absolute = resolve(ROOT, root);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return [path];
    }),
  );
  return nested
    .flat()
    .filter((path) => [".ts", ".tsx", ".mjs"].includes(extname(path)));
}

// ---------------------------------------------------------------------------
// Guard (b): code-level refusal to go live
// ---------------------------------------------------------------------------

describe("Stripe Connect live-mode gate", () => {
  it("gives a club with payments_live_enabled=false test credentials, even when a live key exists", () => {
    // The seeded default. Note the environment here DOES configure a live key:
    // the club-state check alone must be enough to keep this club in test mode,
    // so that guard (b) does not silently depend on guard (a).
    expect(
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: false,
        env: LIVE_CAPABLE_ENV,
      }),
    ).toEqual({ mode: "test", secretKey: TEST_KEY });

    expect(
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: false,
        env: PHASE_ENV,
      }),
    ).toEqual({ mode: "test", secretKey: TEST_KEY });
  });

  it("refuses, rather than downgrading, when a club is flagged live but no live key is configured", () => {
    // This is the shipped environment. Falling back to test mode here would
    // take a fake payment against a real registration, so it fails closed.
    let thrown: unknown;
    try {
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: true,
        env: PHASE_ENV,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).code).toBe("CONNECT_LIVE_MODE_UNAVAILABLE");
  });

  it("requires both conditions together, so the gate is not vacuous", () => {
    // Proves the refusal above is caused by the missing key and not by the
    // function being incapable of ever returning live credentials.
    expect(
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: true,
        env: LIVE_CAPABLE_ENV,
      }),
    ).toEqual({ mode: "live", secretKey: LIVE_KEY });
  });

  it("rejects a live key pasted into the test variable", () => {
    expect(() =>
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: false,
        env: { ...PHASE_ENV, STRIPE_CONNECT_TEST_SECRET_KEY: LIVE_KEY },
      }),
    ).toThrow(
      expect.objectContaining({ code: "CONNECT_TEST_KEY_NOT_TEST_MODE" }),
    );
  });

  it("rejects a missing test key and a non-live live key", () => {
    expect(() =>
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: false,
        env: { ONZIO_ENVIRONMENT: "staging" },
      }),
    ).toThrow(expect.objectContaining({ code: "CONNECT_TEST_KEY_MISSING" }));

    expect(() =>
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: true,
        env: { ...PHASE_ENV, STRIPE_CONNECT_LIVE_SECRET_KEY: TEST_KEY },
      }),
    ).toThrow(expect.objectContaining({ code: "CONNECT_LIVE_KEY_NOT_LIVE_MODE" }));
  });

  it("refuses to build a client whose key disagrees with its declared mode", () => {
    expect(() =>
      createConnectStripeClient(
        { mode: "live", secretKey: TEST_KEY } as ConnectStripeCredentials,
        LIVE_CAPABLE_ENV,
      ),
    ).toThrow(expect.objectContaining({ code: "CONNECT_KEY_MODE_MISMATCH" }));

    expect(() =>
      createConnectStripeClient(
        { mode: "live", secretKey: LIVE_KEY } as ConnectStripeCredentials,
        PHASE_ENV,
      ),
    ).toThrow(expect.objectContaining({ code: "CONNECT_LIVE_MODE_UNAVAILABLE" }));

    expect(() =>
      createConnectStripeClient(
        { mode: "test", secretKey: "pk_test_wrong" } as ConnectStripeCredentials,
        PHASE_ENV,
      ),
    ).toThrow(expect.objectContaining({ code: "CONNECT_KEY_UNRECOGNISED" }));
  });
});

// ---------------------------------------------------------------------------
// Guard (a): no live key is configured anywhere in this phase
// ---------------------------------------------------------------------------

describe("Stripe Connect live-mode key is absent from this environment", () => {
  it("declares only a test-mode Connect key in every checked-in env example", async () => {
    const entries = await readdir(ROOT, { withFileTypes: true });
    const examples = entries
      .filter((entry) => entry.isFile() && /^\.env\..*example$/.test(entry.name))
      .map((entry) => entry.name);

    expect(examples).toContain(".env.test.example");

    for (const name of examples) {
      const contents = await readFile(resolve(ROOT, name), "utf8");
      const assignments = contents
        .split("\n")
        .filter((line) => /^\s*STRIPE_CONNECT_[A-Z_]+\s*=/.test(line));
      for (const assignment of assignments) {
        expect(
          assignment,
          `${name} must not configure a live-mode Stripe Connect value`,
        ).not.toMatch(/^\s*STRIPE_CONNECT_LIVE_/);
      }
    }

    const testExample = await readFile(
      resolve(ROOT, ".env.test.example"),
      "utf8",
    );
    expect(testExample).toMatch(/^STRIPE_CONNECT_TEST_SECRET_KEY=/m);
    expect(testExample).not.toMatch(/^STRIPE_CONNECT_LIVE_SECRET_KEY=/m);
  });

  it("hard-codes no live secret key in application or script source", async () => {
    const files = (
      await Promise.all(["app", "lib", "scripts"].map(sourceFiles))
    )
      .flat()
      // Test fixtures deliberately contain fake live-key strings to prove the
      // mode checks reject them; only shipped source is scanned here.
      .filter((path) => !path.includes("__tests__"));
    const violations: string[] = [];
    for (const path of files) {
      const contents = await readFile(resolve(ROOT, path), "utf8");
      // A literal live key prefix followed by key material, not the bare
      // pattern strings the mode checks are built from.
      if (/["'`](?:sk|rk)_live_[A-Za-z0-9]/.test(contents)) violations.push(path);
    }
    expect(violations).toEqual([]);
  });

  it("reports the running environment as having no live Connect key", () => {
    expect(isConnectLiveKeyConfigured(PHASE_ENV)).toBe(false);
    expect(isConnectLiveKeyConfigured(LIVE_CAPABLE_ENV)).toBe(true);
    // The process this suite runs in must itself be live-key-free.
    expect(isConnectLiveKeyConfigured(process.env)).toBe(false);
  });

  it("never falls back to the platform subscription key for Connect", () => {
    // STRIPE_SECRET_KEY is live in production; reading it here would defeat
    // the whole gate.
    expect(
      resolveConnectStripeCredentials({
        paymentsLiveEnabled: false,
        env: { ...PHASE_ENV, STRIPE_SECRET_KEY: LIVE_KEY },
      }),
    ).toEqual({ mode: "test", secretKey: TEST_KEY });
  });
});

// ---------------------------------------------------------------------------
// createConnectedCheckoutSession
// ---------------------------------------------------------------------------

describe("createConnectedCheckoutSession", () => {
  it("creates a test-mode direct charge on the club's connected account", async () => {
    const database = seedDatabase();
    const { client } = createFakeSupabase(database);
    const stripe = fakeStripe();
    const credentialsSeen: ConnectStripeCredentials[] = [];

    const result = await createConnectedCheckoutSession(
      { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
      {
        client,
        env: PHASE_ENV,
        createStripeClient: (credentials) => {
          credentialsSeen.push(credentials);
          return stripe.client;
        },
      },
    );

    expect(result).toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_session",
    });

    // A club at the seeded default can only ever be handed the test key.
    expect(credentialsSeen).toEqual([{ mode: "test", secretKey: TEST_KEY }]);

    const [params, requestOptions] = stripe.sessionCreate.mock
      .calls[0] as unknown as [Record<string, any>, Record<string, any>];

    // Direct charge: the session is created ON the connected account.
    expect(requestOptions.stripeAccount).toBe(ACCOUNT_ID);
    expect(requestOptions.idempotencyKey).toBe(
      `onzio_connect_checkout:test:${RESPONSE_ID}`,
    );

    // 100% to the club: no platform fee, no transfer, no on-behalf-of.
    expect(params).not.toHaveProperty("application_fee_amount");
    expect(params).not.toHaveProperty("transfer_data");
    expect(params).not.toHaveProperty("on_behalf_of");
    expect(params.payment_intent_data).not.toHaveProperty(
      "application_fee_amount",
    );
    expect(params.payment_intent_data).not.toHaveProperty("transfer_data");

    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 25000,
          product_data: { name: "2026 Academy Registration" },
        },
      },
    ]);
    expect(params.metadata).toEqual({
      onzio_club_id: CLUB_ID,
      onzio_form_id: FORM_ID,
      onzio_response_id: RESPONSE_ID,
    });
    expect(params.success_url).toContain(
      "https://cvunited.example/join/academy",
    );
    expect(params.cancel_url).toContain("https://cvunited.example/join/academy");

    // The session id is recorded so the webhook can corroborate metadata.
    expect(database.tables.registration_responses[0]).toMatchObject({
      payment_status: "pending",
      stripe_checkout_session_id: SESSION_ID,
    });
  });

  it("refuses a live-flagged club without ever reaching Stripe", async () => {
    const { client } = createFakeSupabase(
      seedDatabase({ club: { payments_live_enabled: true } }),
    );
    const createStripeClient = vi.fn();

    const result = await createConnectedCheckoutSession(
      { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
      { client, env: PHASE_ENV, createStripeClient },
    );

    expect(result).toEqual({ error: "CONNECT_LIVE_MODE_UNAVAILABLE" });
    // No client was constructed, so no Stripe call of any kind was made.
    expect(createStripeClient).not.toHaveBeenCalled();
  });

  it("still refuses a live-flagged club when the caller supplies no env override", async () => {
    // Exercises the real process environment rather than a fixture, which is
    // what production actually runs against.
    vi.stubEnv("STRIPE_CONNECT_TEST_SECRET_KEY", TEST_KEY);
    vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
    const { client } = createFakeSupabase(
      seedDatabase({ club: { payments_live_enabled: true } }),
    );
    const createStripeClient = vi.fn();

    const result = await createConnectedCheckoutSession(
      { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
      { client, createStripeClient },
    );

    expect(result).toEqual({ error: "CONNECT_LIVE_MODE_UNAVAILABLE" });
    expect(createStripeClient).not.toHaveBeenCalled();
  });

  it("refuses a club that has not connected an account", async () => {
    const { client } = createFakeSupabase(
      seedDatabase({ club: { stripe_connect_account_id: null } }),
    );
    const stripe = fakeStripe();
    await expect(
      createConnectedCheckoutSession(
        { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
        { client, env: PHASE_ENV, createStripeClient: () => stripe.client },
      ),
    ).resolves.toEqual({ error: "CONNECT_ACCOUNT_NOT_CONNECTED" });
  });

  it("refuses a connected account that cannot yet take charges", async () => {
    const { client } = createFakeSupabase(seedDatabase());
    const stripe = fakeStripe({
      account: { charges_enabled: false, details_submitted: false },
    });
    await expect(
      createConnectedCheckoutSession(
        { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
        { client, env: PHASE_ENV, createStripeClient: () => stripe.client },
      ),
    ).resolves.toEqual({ error: "CONNECT_ACCOUNT_CHARGES_DISABLED" });
    expect(stripe.sessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ form: { status: "draft" } }, "FORM_NOT_LIVE"],
    [{ form: { requires_payment: false } }, "FORM_PAYMENT_NOT_REQUIRED"],
    [{ form: { price_cents: null } }, "FORM_PRICE_INVALID"],
    [{ response: { payment_status: "paid" } }, "RESPONSE_ALREADY_PAID"],
    [{ club: { lifecycle: "archived" } }, "CLUB_ARCHIVED"],
  ])("refuses %o with the expected code", async (overrides, expected) => {
    const { client } = createFakeSupabase(seedDatabase(overrides as any));
    const stripe = fakeStripe();
    await expect(
      createConnectedCheckoutSession(
        { clubId: CLUB_ID, formId: FORM_ID, responseId: RESPONSE_ID },
        { client, env: PHASE_ENV, createStripeClient: () => stripe.client },
      ),
    ).resolves.toEqual({ error: expected });
    expect(stripe.sessionCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers before touching the database", async () => {
    const { client } = createFakeSupabase(seedDatabase());
    await expect(
      createConnectedCheckoutSession(
        { clubId: "not-a-uuid", formId: FORM_ID, responseId: RESPONSE_ID },
        { client, env: PHASE_ENV },
      ),
    ).resolves.toEqual({ error: "INVALID_CHECKOUT_INPUT" });
  });
});

// ---------------------------------------------------------------------------
// Connect account readiness
// ---------------------------------------------------------------------------

describe("Connect account readiness", () => {
  it("maps Stripe account flags onto the four readiness states", () => {
    expect(
      classifyConnectAccount({ charges_enabled: true, details_submitted: true }),
    ).toBe("charges_enabled");
    expect(
      classifyConnectAccount({
        charges_enabled: false,
        details_submitted: false,
      }),
    ).toBe("onboarding_started");
    expect(
      classifyConnectAccount({ charges_enabled: false, details_submitted: true }),
    ).toBe("restricted");
  });

  it("reports not_connected before onboarding and never calls Stripe", async () => {
    vi.stubEnv("STRIPE_CONNECT_TEST_SECRET_KEY", TEST_KEY);
    const { client } = createFakeSupabase(
      seedDatabase({ club: { stripe_connect_account_id: null } }),
    );
    const stripe = fakeStripe();

    const status = await getConnectAccountStatus(
      { clubId: CLUB_ID },
      { client, stripe: stripe.client },
    );

    expect(status).toMatchObject({
      state: "not_connected",
      accountId: null,
      paymentsLiveEnabled: false,
      mode: "test",
      modeError: null,
    });
    expect(stripe.accountRetrieve).not.toHaveBeenCalled();
  });

  it("surfaces restriction detail for a connected but blocked account", async () => {
    vi.stubEnv("STRIPE_CONNECT_TEST_SECRET_KEY", TEST_KEY);
    const { client } = createFakeSupabase(seedDatabase());
    const stripe = fakeStripe({
      account: {
        charges_enabled: false,
        details_submitted: true,
        payouts_enabled: false,
        requirements: {
          currently_due: ["individual.verification.document"],
          disabled_reason: "requirements.past_due",
        },
      },
    });

    const status = await getConnectAccountStatus(
      { clubId: CLUB_ID },
      { client, stripe: stripe.client },
    );

    expect(status).toMatchObject({
      state: "restricted",
      accountId: ACCOUNT_ID,
      chargesEnabled: false,
      disabledReason: "requirements.past_due",
      requirementsCurrentlyDue: ["individual.verification.document"],
    });
  });

  it("records why a live-flagged club has no usable mode", async () => {
    vi.stubEnv("STRIPE_CONNECT_TEST_SECRET_KEY", TEST_KEY);
    const { client } = createFakeSupabase(
      seedDatabase({
        club: {
          payments_live_enabled: true,
          stripe_connect_account_id: null,
        },
      }),
    );

    const status = await getConnectAccountStatus({ clubId: CLUB_ID }, { client });

    expect(status).toMatchObject({
      state: "not_connected",
      paymentsLiveEnabled: true,
      mode: null,
      modeError: "CONNECT_LIVE_MODE_UNAVAILABLE",
    });
  });
});

// ---------------------------------------------------------------------------
// Connect webhook
// ---------------------------------------------------------------------------

const serviceRoleMock = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => serviceRoleMock);

function connectEvent(overrides: {
  id?: string;
  account?: string | null;
  livemode?: boolean;
  type?: string;
  session?: Record<string, unknown>;
}) {
  return {
    id: overrides.id ?? "evt_connect_1",
    object: "event",
    api_version: "2025-01-01",
    created: 1_760_000_000,
    livemode: overrides.livemode ?? false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: overrides.type ?? "checkout.session.completed",
    ...(overrides.account === null ? {} : { account: overrides.account ?? ACCOUNT_ID }),
    data: {
      object: {
        id: SESSION_ID,
        object: "checkout_session",
        payment_status: "paid",
        amount_total: 25000,
        currency: "usd",
        payment_intent: "pi_test_registration",
        metadata: {
          onzio_club_id: CLUB_ID,
          onzio_form_id: FORM_ID,
          onzio_response_id: RESPONSE_ID,
        },
        ...overrides.session,
      },
    },
  };
}

async function postConnectWebhook(
  event: Record<string, unknown>,
  options: { signingSecret?: string } = {},
) {
  const { POST } = await import("@/app/api/stripe/connect-webhook/route");
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.signingSecret ?? CONNECT_WEBHOOK_SECRET,
  });
  const response = await POST(
    new Request("https://onzio.example/api/stripe/connect-webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: payload,
    }),
  );
  return { response, body: await response.json() };
}

describe("Stripe Connect webhook", () => {
  function install(database: FakeDatabase) {
    const fake = createFakeSupabase(database);
    serviceRoleMock.createServiceRoleClient.mockReturnValue(fake.client);
    vi.stubEnv("STRIPE_CONNECT_TEST_SECRET_KEY", TEST_KEY);
    vi.stubEnv("STRIPE_CONNECT_TEST_WEBHOOK_SECRET", CONNECT_WEBHOOK_SECRET);
    vi.stubEnv("ONZIO_ENVIRONMENT", "staging");
    return fake;
  }

  it("rejects a delivery that does not verify", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const { response, body } = await postConnectWebhook(
      connectEvent({}),
      { signingSecret: "whsec_a_different_endpoint" },
    );

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "INVALID_SIGNATURE" });
    expect(database.tables.registration_responses[0].payment_status).toBe(
      "pending",
    );
    expect(database.tables.stripe_connect_events).toHaveLength(0);
  });

  it("records the payment on the response and marks the ledger applied", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const { response, body } = await postConnectWebhook(connectEvent({}));

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, result: "PAID" });
    expect(database.tables.registration_responses[0]).toMatchObject({
      payment_status: "paid",
      stripe_payment_intent_id: "pi_test_registration",
      amount_paid_cents: 25000,
    });
    expect(database.tables.registration_responses[0].paid_at).toBeTruthy();
    expect(database.tables.stripe_connect_events[0]).toMatchObject({
      id: "evt_connect_1",
      club_id: CLUB_ID,
      connected_account_id: ACCOUNT_ID,
      livemode: false,
      outcome: "applied",
    });
  });

  it("does not double-process a replayed delivery", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    await postConnectWebhook(connectEvent({}));
    const paidAt = database.tables.registration_responses[0].paid_at;

    // Same event id, redelivered, and this time reporting a different amount.
    // Neither the ledger nor the response may move.
    const replay = await postConnectWebhook(
      connectEvent({ session: { amount_total: 999_999 } }),
    );

    expect(replay.body).toEqual({ received: true, rejected: "DUPLICATE_EVENT" });
    expect(database.tables.stripe_connect_events).toHaveLength(1);
    expect(database.tables.registration_responses[0]).toMatchObject({
      payment_status: "paid",
      amount_paid_cents: 25000,
      paid_at: paidAt,
    });
  });

  it("rejects a session id that Onzio never issued for the response", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: "cs_test_a_different_session" },
    });
    install(database);

    const { body } = await postConnectWebhook(connectEvent({}));

    expect(body).toEqual({
      received: true,
      rejected: "CHECKOUT_SESSION_MISMATCH",
    });
    expect(database.tables.registration_responses[0].payment_status).toBe(
      "pending",
    );
    expect(database.tables.stripe_connect_events[0]).toMatchObject({
      outcome: "rejected",
      rejection_code: "CHECKOUT_SESSION_MISMATCH",
    });
  });

  it("rejects an event delivered for a different connected account", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const { body } = await postConnectWebhook(
      connectEvent({ account: "acct_someone_else" }),
    );

    expect(body).toEqual({
      received: true,
      rejected: "CONNECT_ACCOUNT_MISMATCH",
    });
    expect(database.tables.registration_responses[0].payment_status).toBe(
      "pending",
    );
  });

  it("rejects a live-mode delivery for a club that may only transact in test mode", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const { body } = await postConnectWebhook(
      connectEvent({ livemode: true, id: "evt_connect_live" }),
    );

    expect(body).toEqual({ received: true, rejected: "LIVE_MODE_MISMATCH" });
    expect(database.tables.registration_responses[0].payment_status).toBe(
      "pending",
    );
  });

  it("ignores an unpaid session and a platform-scoped event", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const unpaid = await postConnectWebhook(
      connectEvent({ id: "evt_unpaid", session: { payment_status: "unpaid" } }),
    );
    expect(unpaid.body).toEqual({ received: true, ignored: "SESSION_NOT_PAID" });

    const platformScoped = await postConnectWebhook(
      connectEvent({ id: "evt_platform", account: null }),
    );
    expect(platformScoped.body).toEqual({
      received: true,
      ignored: "NOT_A_CONNECT_EVENT",
    });

    expect(database.tables.registration_responses[0].payment_status).toBe(
      "pending",
    );
  });

  it("ignores event types this endpoint does not handle", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);

    const { body } = await postConnectWebhook(
      connectEvent({ id: "evt_other", type: "account.updated" }),
    );
    expect(body).toEqual({ received: true, ignored: "UNHANDLED_EVENT_TYPE" });
    expect(database.tables.stripe_connect_events).toHaveLength(0);
  });

  it("releases the ledger row so Stripe can retry a transient database fault", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
      faults: {
        "registration_responses:update": { message: "connection terminated" },
      },
    });
    install(database);

    const { response, body } = await postConnectWebhook(connectEvent({}));

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "RESPONSE_UPDATE_FAILED" });
    // Removed, so the retry is processed rather than dismissed as a replay.
    expect(database.tables.stripe_connect_events).toHaveLength(0);
  });

  it("fails closed when no Connect signing secret is configured", async () => {
    const database = seedDatabase({
      response: { stripe_checkout_session_id: SESSION_ID },
    });
    install(database);
    vi.stubEnv("STRIPE_CONNECT_TEST_WEBHOOK_SECRET", "");

    const { response, body } = await postConnectWebhook(connectEvent({}));

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "CONNECT_WEBHOOK_SECRET_MISSING" });
  });

  it("does not accept the subscription webhook secret", () => {
    // The two endpoints are signed independently; sharing a secret would let a
    // platform-billing payload be replayed as a club payment.
    expect(
      connectWebhookSecrets({
        STRIPE_WEBHOOK_SECRET: "whsec_platform_subscription",
        STRIPE_CONNECT_TEST_WEBHOOK_SECRET: CONNECT_WEBHOOK_SECRET,
      }),
    ).toEqual([CONNECT_WEBHOOK_SECRET]);
  });

});

// ---------------------------------------------------------------------------
// Operator-initiated Connect onboarding
// ---------------------------------------------------------------------------

const OPERATOR_ID = "44444444-4444-4444-8444-444444444444";

function operatorClaims() {
  return {
    sub: OPERATOR_ID,
    aal: "aal2",
    amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }],
  };
}

function onboardingStripe() {
  const accountCreate = vi.fn(async () => ({ id: "acct_newly_created" }));
  const accountLinkCreate = vi.fn(async () => ({
    url: "https://connect.stripe.com/setup/s/onboarding-token",
    expires_at: 1_760_003_600,
  }));
  const client = {
    accounts: { create: accountCreate, retrieve: vi.fn() },
    accountLinks: { create: accountLinkCreate },
    checkout: { sessions: { create: vi.fn() } },
  } as any;
  return { client, accountCreate, accountLinkCreate };
}

describe("operator-initiated Connect onboarding", () => {
  it("creates a Standard test-mode account, stores it, and issues a hosted link", async () => {
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", OPERATOR_ID);
    const { createConnectOnboardingLink } = await import(
      "@/lib/operator/stripe-connect-onboarding"
    );
    const database = seedDatabase({
      club: { stripe_connect_account_id: null },
    });
    const { client } = createFakeSupabase(database);
    const stripe = onboardingStripe();

    const result = await createConnectOnboardingLink({
      clubId: CLUB_ID,
      operatorAccessToken: "operator-token",
      dependencies: {
        client,
        env: PHASE_ENV,
        createStripeClient: () => stripe.client,
        verifyOperatorAccessToken: async () => operatorClaims(),
      },
    });

    expect(result).toMatchObject({
      clubId: CLUB_ID,
      accountId: "acct_newly_created",
      accountCreated: true,
      // No club has signed yet, so onboarding produces a TEST account.
      mode: "test",
      onboardingUrl: "https://connect.stripe.com/setup/s/onboarding-token",
      audited: true,
    });

    expect(stripe.accountCreate).toHaveBeenCalledWith(
      { type: "standard", metadata: { onzio_club_id: CLUB_ID } },
      { idempotencyKey: `onzio_connect_account:test:${CLUB_ID}` },
    );
    expect(stripe.accountLinkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: "acct_newly_created",
        type: "account_onboarding",
        refresh_url: "https://cvunited.example/admin/payments?connect=refresh",
        return_url: "https://cvunited.example/admin/payments?connect=return",
      }),
    );

    expect(database.tables.clubs[0].stripe_connect_account_id).toBe(
      "acct_newly_created",
    );

    const audit = database.tables.audit_events[0];
    expect(audit).toMatchObject({
      actor_type: "operator",
      operation: "connect_account_created",
      resource_type: "club_connect_account",
      resource_id: "acct_newly_created",
    });
    // The onboarding link is a bearer credential and must never be audited.
    expect(JSON.stringify(audit)).not.toContain("onboarding-token");
  });

  it("reuses an already-connected account instead of creating a second one", async () => {
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", OPERATOR_ID);
    const { createConnectOnboardingLink } = await import(
      "@/lib/operator/stripe-connect-onboarding"
    );
    const database = seedDatabase();
    const { client } = createFakeSupabase(database);
    const stripe = onboardingStripe();

    const result = await createConnectOnboardingLink({
      clubId: CLUB_ID,
      operatorAccessToken: "operator-token",
      dependencies: {
        client,
        env: PHASE_ENV,
        createStripeClient: () => stripe.client,
        verifyOperatorAccessToken: async () => operatorClaims(),
      },
    });

    expect(result).toMatchObject({
      accountId: ACCOUNT_ID,
      accountCreated: false,
    });
    expect(stripe.accountCreate).not.toHaveBeenCalled();
    expect(database.tables.audit_events[0]).toMatchObject({
      operation: "connect_onboarding_link_issued",
    });
  });

  it("refuses invocation from an application route and from a non-operator", async () => {
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", OPERATOR_ID);
    const { createConnectOnboardingLink } = await import(
      "@/lib/operator/stripe-connect-onboarding"
    );
    const { client } = createFakeSupabase(seedDatabase());
    const stripe = onboardingStripe();
    const dependencies = {
      client,
      env: PHASE_ENV,
      createStripeClient: () => stripe.client,
      verifyOperatorAccessToken: async () => operatorClaims(),
    };

    await expect(
      createConnectOnboardingLink({
        clubId: CLUB_ID,
        operatorAccessToken: "operator-token",
        invokedFromApplicationRoute: true,
        dependencies,
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_ONLY" });

    await expect(
      createConnectOnboardingLink({
        clubId: CLUB_ID,
        operatorAccessToken: "operator-token",
        dependencies: {
          ...dependencies,
          verifyOperatorAccessToken: async () => ({
            ...operatorClaims(),
            sub: "55555555-5555-4555-8555-555555555555",
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "OPERATOR_ONLY" });

    expect(stripe.accountLinkCreate).not.toHaveBeenCalled();
  });

  it("cannot onboard a club into live mode in this phase", async () => {
    vi.stubEnv("ONZIO_OPERATOR_USER_IDS", OPERATOR_ID);
    const { createConnectOnboardingLink } = await import(
      "@/lib/operator/stripe-connect-onboarding"
    );
    const { client } = createFakeSupabase(
      seedDatabase({
        club: {
          payments_live_enabled: true,
          stripe_connect_account_id: null,
        },
      }),
    );
    const stripe = onboardingStripe();

    await expect(
      createConnectOnboardingLink({
        clubId: CLUB_ID,
        operatorAccessToken: "operator-token",
        dependencies: {
          client,
          env: PHASE_ENV,
          createStripeClient: () => stripe.client,
          verifyOperatorAccessToken: async () => operatorClaims(),
        },
      }),
    ).rejects.toMatchObject({ code: "CONNECT_LIVE_MODE_UNAVAILABLE" });

    expect(stripe.accountCreate).not.toHaveBeenCalled();
  });
});
