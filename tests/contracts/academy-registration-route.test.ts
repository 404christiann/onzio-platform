import { afterEach, describe, expect, it, vi } from "vitest";

// Mocked before the route import so the route picks up these mocks instead
// of the real service-role client / Stripe Connect helper. Mirrors the
// vi.mock-then-import shape tests/contracts/media-cleanup-cron.test.ts uses
// for the cron route.
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/stripe/connect-checkout", () => ({
  createConnectedCheckoutSession: vi.fn(),
}));

import { POST } from "@/app/api/registrations/academy/route";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
import { createConnectedCheckoutSession } from "@/lib/stripe/connect-checkout";

const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);
const mockCreateConnectedCheckoutSession = vi.mocked(
  createConnectedCheckoutSession,
);

const CLUB_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const FORM_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const RESPONSE_ID = "cccccccc-3333-4333-8333-cccccccccccc";

const validPayload = {
  playerFirstName: "Ada",
  playerLastName: "Rivera",
  playerDob: "2014-03-09",
  parentGuardianName: "Marta Rivera",
  parentGuardianEmail: "marta@example.test",
  parentGuardianPhone: "+1-503-555-0142",
  notes: "Prefers weekend sessions.",
  waiverAccepted: true,
};

/** A single-row "chain" stub covering the exact builder calls route.ts makes
 * for one table: `.select().eq().eq().eq().maybeSingle()` for a lookup, or
 * `.insert().select().single()` for a write. Every intermediate call
 * returns the same object so any call order/count of `.eq()` resolves. */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.insert = () => builder;
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  return builder;
}

function fakeClient(options: {
  form: { data: unknown; error?: unknown };
  response?: { data: unknown; error?: unknown };
}) {
  const formChain = chain({ error: null, ...options.form });
  const responseChain = options.response
    ? chain({ error: null, ...options.response })
    : chain({ data: null, error: null });
  const from = vi.fn((table: string) => {
    if (table === "registration_forms") return formChain;
    if (table === "registration_responses") return responseChain;
    throw new Error(`unexpected table: ${table}`);
  });
  return { schema: vi.fn(() => ({ from })), from };
}

function request(body: unknown, clubId: string | null = CLUB_ID): Request {
  return new Request("https://onzio.example/api/registrations/academy", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(clubId ? { "x-onzio-club-id": clubId } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/registrations/academy", () => {
  it("fails closed with 404 when no verified club id header is present", async () => {
    const response = await POST(request(validPayload, null));
    expect(response.status).toBe(404);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload with 400 before touching the database", async () => {
    mockCreateServiceRoleClient.mockReturnValue(
      fakeClient({ form: { data: null } }) as never,
    );
    const response = await POST(
      request({ ...validPayload, parentGuardianEmail: "not-an-email" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects an unchecked waiver box with 400", async () => {
    const response = await POST(
      request({ ...validPayload, waiverAccepted: false }),
    );
    expect(response.status).toBe(400);
  });

  // The core draft-gating safety requirement: the server-side route must
  // independently re-check status === 'live' and hard-reject regardless of
  // what the client rendered or sent, even given an otherwise perfectly
  // valid payload. The route's Supabase query filters on
  // `.eq("status", "live")`, so a draft (or closed, or nonexistent) form
  // simply never matches and this stub returns no row -- exactly what the
  // real database would do for the same query.
  it("hard-rejects a submission when the club's academy form is not live (draft-status form)", async () => {
    const client = fakeClient({ form: { data: null } });
    mockCreateServiceRoleClient.mockReturnValue(client as never);

    const response = await POST(request(validPayload));

    expect([404, 409]).toContain(response.status);
    const body = await response.json();
    expect(body.error.code).toBe("ACADEMY_REGISTRATION_NOT_LIVE");
    // No response row may be written for a form that isn't live, and
    // checkout must never be attempted.
    expect(client.from).not.toHaveBeenCalledWith("registration_responses");
    expect(mockCreateConnectedCheckoutSession).not.toHaveBeenCalled();
  });

  it("inserts the response and redirects to the checkout URL for a paid live form", async () => {
    const client = fakeClient({
      form: {
        data: { id: FORM_ID, waiver_version: 3, requires_payment: true },
      },
      response: { data: { id: RESPONSE_ID } },
    });
    mockCreateServiceRoleClient.mockReturnValue(client as never);
    mockCreateConnectedCheckoutSession.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_123",
    });

    const response = await POST(request(validPayload));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkoutUrl).toBe(
      "https://checkout.stripe.com/c/pay/cs_test_123",
    );
    expect(mockCreateConnectedCheckoutSession).toHaveBeenCalledWith({
      clubId: CLUB_ID,
      formId: FORM_ID,
      responseId: RESPONSE_ID,
    });
  });

  it("succeeds with no checkout URL for a free (requires_payment=false) live form", async () => {
    const client = fakeClient({
      form: {
        data: { id: FORM_ID, waiver_version: 1, requires_payment: false },
      },
      response: { data: { id: RESPONSE_ID } },
    });
    mockCreateServiceRoleClient.mockReturnValue(client as never);

    const response = await POST(request(validPayload));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checkoutUrl).toBeFalsy();
    expect(mockCreateConnectedCheckoutSession).not.toHaveBeenCalled();
  });

  it("surfaces a checkout failure as a clear response, not a crash, after the response is already saved", async () => {
    const client = fakeClient({
      form: {
        data: { id: FORM_ID, waiver_version: 3, requires_payment: true },
      },
      response: { data: { id: RESPONSE_ID } },
    });
    mockCreateServiceRoleClient.mockReturnValue(client as never);
    mockCreateConnectedCheckoutSession.mockResolvedValue({
      error: "CONNECT_ACCOUNT_CHARGES_DISABLED",
    });

    const response = await POST(request(validPayload));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("ACADEMY_REGISTRATION_CHECKOUT_FAILED");
  });

  it("returns 500 rather than crashing when the insert itself fails (e.g. the waiver trigger rejects it)", async () => {
    const client = fakeClient({
      form: {
        data: { id: FORM_ID, waiver_version: 3, requires_payment: true },
      },
      response: { data: null, error: { message: "check violation" } },
    });
    mockCreateServiceRoleClient.mockReturnValue(client as never);

    const response = await POST(request(validPayload));

    expect(response.status).toBe(500);
    expect(mockCreateConnectedCheckoutSession).not.toHaveBeenCalled();
  });
});
