import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors tests/contracts/media-cleanup-cron.test.ts: import the route
// handler directly and mock its one external dependency (the service-role
// client) rather than standing up a real Next server or a local database
// for a unit-level contract on the route's own control flow. The
// database-level RLS/constraint contracts for onzio.registration_responses
// itself already live in tests/database/registration-forms-responses.test.ts.
const formLookup = vi.fn();
const insertResponse = vi.fn();

vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({
      from: (table: string) => {
        if (table === "registration_forms") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: formLookup,
                }),
              }),
            }),
          };
        }
        if (table === "registration_responses") {
          return { insert: insertResponse };
        }
        throw new Error(`unexpected table in test double: ${table}`);
      },
    }),
  }),
}));

import { POST } from "@/app/api/registrations/interest/route";
import { _resetRegistrationInterestRateLimitForTests } from "@/lib/registration-interest-rate-limit";

const CLUB_ID = "11111111-1111-4111-8111-111111111111";
const CLUB_SLUG = "alpha";

const validSubmission = {
  player_first_name: "Ada",
  player_last_name: "Rivera",
  player_dob: "2014-03-09",
  parent_guardian_name: "Marta Rivera",
  parent_guardian_email: "marta@example.test",
  parent_guardian_phone: "+1-503-555-0142",
};

function request(
  body: unknown,
  options: { headers?: Record<string, string>; ip?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-onzio-club-id": CLUB_ID,
    "x-onzio-club-slug": CLUB_SLUG,
    "x-forwarded-for": options.ip ?? "203.0.113.1",
    ...options.headers,
  };
  return new Request("https://alpha.onzio.example/api/registrations/interest", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetRegistrationInterestRateLimitForTests();
  formLookup.mockReset();
  insertResponse.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/registrations/interest", () => {
  it("fails closed with UNKNOWN_TENANT when tenant headers are missing", async () => {
    const response = await POST(
      request(validSubmission, {
        headers: { "x-onzio-club-id": "", "x-onzio-club-slug": "" },
      }),
    );
    expect(response.status).toBe(404);
    expect(formLookup).not.toHaveBeenCalled();
    expect(insertResponse).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload without ever looking up a form", async () => {
    const response = await POST(
      request({ ...validSubmission, parent_guardian_email: "not-an-email" }),
    );
    expect(response.status).toBe(400);
    expect(formLookup).not.toHaveBeenCalled();
    expect(insertResponse).not.toHaveBeenCalled();
  });

  it("returns a fake success for a honeypot-filled submission and writes nothing", async () => {
    const response = await POST(
      request({ ...validSubmission, company: "I am a bot" }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(formLookup).not.toHaveBeenCalled();
    expect(insertResponse).not.toHaveBeenCalled();
  });

  it("returns 404 when the club has no general_interest form at all", async () => {
    formLookup.mockResolvedValue({ data: null, error: null });

    const response = await POST(request(validSubmission));
    expect(response.status).toBe(404);
    expect(insertResponse).not.toHaveBeenCalled();
  });

  it("returns 409 when the club's general_interest form exists but is not live", async () => {
    formLookup.mockResolvedValue({
      data: { id: "form-1", status: "draft" },
      error: null,
    });

    const response = await POST(request(validSubmission));
    expect(response.status).toBe(409);
    expect(insertResponse).not.toHaveBeenCalled();
  });

  it("accepts a valid submission against a live form", async () => {
    formLookup.mockResolvedValue({
      data: { id: "form-1", status: "live" },
      error: null,
    });
    insertResponse.mockResolvedValue({ error: null });

    const response = await POST(
      request({ ...validSubmission, interest_area: "Goalkeeping" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(insertResponse).toHaveBeenCalledWith({
      club_id: CLUB_ID,
      form_id: "form-1",
      payment_status: "not_required",
      player_first_name: "Ada",
      player_last_name: "Rivera",
      player_dob: "2014-03-09",
      parent_guardian_name: "Marta Rivera",
      parent_guardian_email: "marta@example.test",
      parent_guardian_phone: "+1-503-555-0142",
      interest_area: "Goalkeeping",
    });
  });

  it("rate limits repeated submissions from the same club and IP", async () => {
    formLookup.mockResolvedValue({
      data: { id: "form-1", status: "live" },
      error: null,
    });
    insertResponse.mockResolvedValue({ error: null });

    for (let i = 0; i < 5; i += 1) {
      const response = await POST(request(validSubmission, { ip: "198.51.100.9" }));
      expect(response.status).toBe(200);
    }

    const limited = await POST(
      request(validSubmission, { ip: "198.51.100.9" }),
    );
    expect(limited.status).toBe(429);
    expect(insertResponse).toHaveBeenCalledTimes(5);
  });
});
