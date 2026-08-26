import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/registration-route-auth", () => ({
  requireRegistrationRouteAuthorization: mocks.requireAuth,
}));

import { POST } from "@/app/api/admin/registrations/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const formId = "22222222-2222-4222-8222-222222222222";

function query(result: { data: any; error: any }) {
  const builder: any = {};
  for (const method of [
    "select",
    "eq",
    "insert",
    "update",
    "delete",
    "limit",
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn().mockResolvedValue(result);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (
    resolveResult: (value: typeof result) => unknown,
    rejectResult?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolveResult, rejectResult);
  return builder;
}

function request(body: Record<string, unknown>) {
  return new Request("https://alpha.example/api/admin/registrations", {
    method: "POST",
    headers: {
      host: "alpha.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({
    club: { id: clubId, name: "Alpha FC" },
    supabase: { schema: vi.fn(() => ({ from: mocks.from })) },
  });
});

describe("registration admin route", () => {
  it("creates a tenant-scoped form with a server-derived collision-safe slug", async () => {
    const existing = query({
      data: [{ slug: "fall-tryouts-2026" }],
      error: null,
    });
    const created = query({
      data: {
        id: formId,
        slug: "fall-tryouts-2026-2",
        status: "draft",
      },
      error: null,
    });
    mocks.from.mockReturnValueOnce(existing).mockReturnValueOnce(created);

    const response = await POST(request({
      action: "create",
      title: "Fall Tryouts 2026",
      description: "Tryout registration",
      participantMode: "adult_only",
      waiverText: "I agree to the waiver.",
    }));

    expect(response.status).toBe(201);
    expect(created.insert).toHaveBeenCalledWith(expect.objectContaining({
      club_id: clubId,
      slug: "fall-tryouts-2026-2",
      title: "Fall Tryouts 2026",
      status: "draft",
    }));
    expect(created.insert.mock.calls[0][0]).not.toHaveProperty("archived_at");
  });

  it.each([
    ["publish", "open"],
    ["stop", "closed"],
  ] as const)("applies %s only to the resolved tenant form", async (action, status) => {
    const state = query({
      data: { id: formId, status: "closed", archived_at: null },
      error: null,
    });
    const updated = query({
      data: { id: formId, status, archived_at: null },
      error: null,
    });
    mocks.from.mockReturnValueOnce(state).mockReturnValueOnce(updated);

    const response = await POST(request({ action, formId }));

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith({ status });
    expect(updated.eq).toHaveBeenCalledWith("club_id", clubId);
    expect(updated.eq).toHaveBeenCalledWith("id", formId);
  });

  it("archives a live form in one tenant-scoped update", async () => {
    const state = query({
      data: { id: formId, status: "open", archived_at: null },
      error: null,
    });
    const updated = query({
      data: {
        id: formId,
        status: "closed",
        archived_at: "2026-08-21T07:30:00.000Z",
      },
      error: null,
    });
    mocks.from.mockReturnValueOnce(state).mockReturnValueOnce(updated);

    const response = await POST(request({ action: "archive", formId }));

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith({
      status: "closed",
      archived_at: expect.any(String),
    });
    expect(updated.eq).toHaveBeenCalledWith("club_id", clubId);
  });

  it("archives a never-published form without inventing publish history", async () => {
    const state = query({
      data: { id: formId, status: "draft", archived_at: null },
      error: null,
    });
    const updated = query({
      data: {
        id: formId,
        status: "draft",
        archived_at: "2026-08-21T07:30:00.000Z",
      },
      error: null,
    });
    mocks.from.mockReturnValueOnce(state).mockReturnValueOnce(updated);

    const response = await POST(request({ action: "archive", formId }));

    expect(response.status).toBe(200);
    expect(updated.update).toHaveBeenCalledWith({
      status: "draft",
      archived_at: expect.any(String),
    });
  });

  it("refuses to delete a form after any registration exists", async () => {
    const state = query({
      data: { id: formId, status: "closed", archived_at: null },
      error: null,
    });
    const registrations = query({ data: [{ id: "registration" }], error: null });
    const programs = query({ data: [], error: null });
    const tryouts = query({ data: [], error: null });
    mocks.from
      .mockReturnValueOnce(state)
      .mockReturnValueOnce(registrations)
      .mockReturnValueOnce(programs)
      .mockReturnValueOnce(tryouts);

    const response = await POST(request({ action: "delete", formId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REGISTRATION_FORM_HAS_REGISTRATIONS" },
    });
    expect(mocks.from).toHaveBeenCalledTimes(4);
  });

  it("refuses linked-form deletion and deletes only an unlinked empty form", async () => {
    const linkedQueries = [
      query({ data: { id: formId, status: "draft", archived_at: null }, error: null }),
      query({ data: [], error: null }),
      query({ data: [{ id: "program" }], error: null }),
      query({ data: [], error: null }),
    ];
    linkedQueries.forEach((item) => mocks.from.mockReturnValueOnce(item));
    const linkedResponse = await POST(request({ action: "delete", formId }));
    expect(linkedResponse.status).toBe(409);
    expect(await linkedResponse.json()).toMatchObject({
      error: { code: "REGISTRATION_FORM_LINKED" },
    });

    mocks.from.mockReset();
    const state = query({
      data: { id: formId, status: "open", archived_at: null },
      error: null,
    });
    const registrations = query({ data: [], error: null });
    const programs = query({ data: [], error: null });
    const tryouts = query({ data: [], error: null });
    const deletion = query({ data: { id: formId }, error: null });
    [state, registrations, programs, tryouts, deletion].forEach((item) =>
      mocks.from.mockReturnValueOnce(item),
    );

    const response = await POST(request({ action: "delete", formId }));
    expect(response.status).toBe(200);
    expect(deletion.delete).toHaveBeenCalledOnce();
    expect(deletion.eq).toHaveBeenCalledWith("club_id", clubId);
  });

  it("rejects archived deletion and contains no payment implementation imports", async () => {
    const state = query({
      data: {
        id: formId,
        status: "closed",
        archived_at: "2026-08-21T07:30:00.000Z",
      },
      error: null,
    });
    mocks.from.mockReturnValueOnce(state);

    const response = await POST(request({ action: "delete", formId }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REGISTRATION_FORM_ARCHIVED" },
    });

    const source = await readFile(
      resolve(process.cwd(), "app/api/admin/registrations/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /from\s+["']@\/lib\/(?:stripe|registration-checkout)/,
    );
    expect(source).not.toContain("application_fee_amount");
  });

  it("uses a neutral conflict for a late foreign-key race", async () => {
    const state = query({
      data: { id: formId, status: "closed", archived_at: null },
      error: null,
    });
    const registrations = query({ data: [], error: null });
    const programs = query({ data: [], error: null });
    const tryouts = query({ data: [], error: null });
    const deletion = query({
      data: null,
      error: { code: "23503", message: "foreign key violation" },
    });
    [state, registrations, programs, tryouts, deletion].forEach((item) =>
      mocks.from.mockReturnValueOnce(item),
    );

    const response = await POST(request({ action: "delete", formId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REGISTRATION_FORM_IN_USE" },
    });
  });

  it("uses the same neutral conflict when RLS catches a late registration", async () => {
    const state = query({
      data: { id: formId, status: "closed", archived_at: null },
      error: null,
    });
    const registrations = query({ data: [], error: null });
    const programs = query({ data: [], error: null });
    const tryouts = query({ data: [], error: null });
    const deletion = query({ data: null, error: null });
    [state, registrations, programs, tryouts, deletion].forEach((item) =>
      mocks.from.mockReturnValueOnce(item),
    );

    const response = await POST(request({ action: "delete", formId }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "REGISTRATION_FORM_IN_USE" },
    });
  });
});
