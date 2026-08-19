import { afterEach, describe, expect, it, vi } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { ContractError } from "@/lib/contract-error";

// CV United C1: app/api/admin/responses/export/route.ts streams
// onzio.registration_responses rows -- real families' PII, including minors'
// dates of birth -- as a CSV download. These contracts hold the two halves of
// its authorization boundary that matter most: an unauthenticated caller gets
// nothing, and a caller authenticated for one club cannot pull another club's
// form (or its responses) by guessing/supplying a foreign formId. The route
// itself re-derives club scope from the verified session on every request
// (see lib/auth-session.ts, lib/club-context.ts) and never trusts a
// client-supplied club id; authorizeAdminAccess (lib/authorization.ts) runs
// unmocked here so its real membership/lifecycle checks are exercised too.

const { requireFreshClubSessionMock, getClubContextMock } = vi.hoisted(() => ({
  requireFreshClubSessionMock: vi.fn(),
  getClubContextMock: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  requireFreshClubSession: requireFreshClubSessionMock,
}));

vi.mock("@/lib/club-context", () => ({
  getClubContext: getClubContextMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase-server";
import { GET } from "@/app/api/admin/responses/export/route";

const createClientMock = vi.mocked(createClient);

type QueryResult = { data: unknown; error: unknown };

function chain(result: QueryResult) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) {
    (query as Record<string, ReturnType<typeof vi.fn>>)[method] = vi
      .fn()
      .mockReturnValue(query);
  }
  (query as Record<string, unknown>).maybeSingle = vi
    .fn()
    .mockResolvedValue(result);
  (query as Record<string, unknown>).then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query as Record<string, ReturnType<typeof vi.fn>>;
}

function buildSupabase(options: {
  formResult: QueryResult;
  responsesResult?: QueryResult;
}) {
  const formsChain = chain(options.formResult);
  const responsesChain = chain(
    options.responsesResult ?? { data: [], error: null },
  );
  const fromMock = vi.fn((table: string) =>
    table === "registration_forms" ? formsChain : responsesChain,
  );
  const schema = vi.fn(() => ({ from: fromMock }));
  return { schema, fromMock, formsChain, responsesChain };
}

function exportRequest(formId: string | null): Request {
  const url = new URL("https://alpha-onzio.vercel.app/api/admin/responses/export");
  if (formId) url.searchParams.set("formId", formId);
  return new Request(url, { headers: { host: "alpha-onzio.vercel.app" } });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CV United C1 registration responses CSV export authorization", () => {
  it("rejects an unauthenticated request before resolving any club or querying any table", async () => {
    requireFreshClubSessionMock.mockRejectedValue(
      new ContractError("AUTHENTICATION_REQUIRED"),
    );
    createClientMock.mockResolvedValue({} as never);

    const response = await GET(
      exportRequest("aaaaaaaa-aaaa-4aaa-8aaa-000000000001"),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(getClubContextMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no fresh session as forbidden, not as a data response", async () => {
    requireFreshClubSessionMock.mockRejectedValue(
      new ContractError("SESSION_EXPIRED"),
    );
    createClientMock.mockResolvedValue({} as never);

    const response = await GET(
      exportRequest("aaaaaaaa-aaaa-4aaa-8aaa-000000000001"),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("SESSION_EXPIRED");
  });

  it("treats a formId belonging to another club as not found, and never queries responses for it", async () => {
    // The requester is a genuine, currently-active admin -- of Alpha FC. The
    // formId in the query string names a form that (per this club-scoped
    // lookup) does not belong to Alpha, simulating the real
    // `.eq("club_id", club.id)` filter rejecting a foreign-club form the way
    // registration_forms_member_read (RLS) would too.
    requireFreshClubSessionMock.mockResolvedValue({
      userId: USER_IDS.adminAal2,
    });
    getClubContextMock.mockResolvedValue({
      id: CLUB_IDS.alpha,
      role: "admin",
      lifecycle: "active",
    });
    const supabase = buildSupabase({ formResult: { data: null, error: null } });
    createClientMock.mockResolvedValue(supabase as never);

    const bravoOwnedFormId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
    const response = await GET(exportRequest(bravoOwnedFormId));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("FORM_NOT_FOUND");

    // The form lookup itself must have been scoped to the session's own
    // club, not to any value the request could supply.
    expect(supabase.formsChain.eq).toHaveBeenCalledWith(
      "club_id",
      CLUB_IDS.alpha,
    );
    expect(supabase.formsChain.eq).toHaveBeenCalledWith(
      "id",
      bravoOwnedFormId,
    );
    // No response rows were ever requested once the form didn't resolve.
    expect(supabase.fromMock).not.toHaveBeenCalledWith(
      "registration_responses",
    );
  });

  it("rejects a caller with no active membership on the resolved club", async () => {
    requireFreshClubSessionMock.mockResolvedValue({
      userId: USER_IDS.unaffiliated,
    });
    getClubContextMock.mockResolvedValue({
      id: CLUB_IDS.alpha,
      role: null,
      lifecycle: "active",
    });
    const supabase = buildSupabase({ formResult: { data: null, error: null } });
    createClientMock.mockResolvedValue(supabase as never);

    const response = await GET(
      exportRequest("aaaaaaaa-aaaa-4aaa-8aaa-000000000001"),
    );

    expect(response.status).toBe(403);
    expect(supabase.fromMock).not.toHaveBeenCalled();
  });

  it("streams a CSV with the expected header row and file headers for an authorized, correctly-scoped request", async () => {
    requireFreshClubSessionMock.mockResolvedValue({
      userId: USER_IDS.adminAal2,
    });
    getClubContextMock.mockResolvedValue({
      id: CLUB_IDS.alpha,
      role: "admin",
      lifecycle: "active",
    });
    const formId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    const supabase = buildSupabase({
      formResult: {
        data: { id: formId, title: "2026 Academy Intake" },
        error: null,
      },
      responsesResult: {
        data: [
          {
            id: "cccccccc-cccc-4ccc-8ccc-000000000003",
            form_id: formId,
            player_first_name: "Ada",
            player_last_name: "Rivera",
            player_dob: "2014-03-09",
            parent_guardian_name: "Marta Rivera",
            parent_guardian_email: "marta@example.test",
            parent_guardian_phone: "+1-503-555-0142",
            notes: null,
            interest_area: null,
            waiver_accepted_at: "2026-08-01T12:00:00.000Z",
            waiver_version_accepted: 3,
            payment_status: "paid",
            stripe_checkout_session_id: "cs_test_123",
            stripe_payment_intent_id: "pi_test_123",
            amount_paid_cents: 15000,
            paid_at: "2026-08-01T12:05:00.000Z",
            submitted_at: "2026-08-01T11:55:00.000Z",
          },
        ],
        error: null,
      },
    });
    createClientMock.mockResolvedValue(supabase as never);

    const response = await GET(exportRequest(formId));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "attachment",
    );
    const text = await response.text();
    expect(text).toContain(
      "id,form_id,player_first_name,player_last_name,player_dob,parent_guardian_name,parent_guardian_email,parent_guardian_phone,notes,interest_area,waiver_accepted_at,waiver_version_accepted,payment_status,stripe_checkout_session_id,stripe_payment_intent_id,amount_paid_cents,paid_at,submitted_at",
    );
    expect(text).toContain("Ada,Rivera");
    expect(text).toContain("Marta Rivera");
    expect(supabase.responsesChain.eq).toHaveBeenCalledWith(
      "club_id",
      CLUB_IDS.alpha,
    );
    expect(supabase.responsesChain.eq).toHaveBeenCalledWith(
      "form_id",
      formId,
    );
  });
});
