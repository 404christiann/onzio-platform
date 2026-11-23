import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
}));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/admin/public-page-visibility/route";

const clubId = "11111111-1111-4111-8111-111111111111";
const otherClubId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

const club = (patch: Record<string, unknown> = {}) => ({
  id: clubId,
  role: "owner",
  lifecycle: "active",
  presentationTemplateKey: "cinematic@2",
  ...patch,
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://rosecity.example/api/admin/public-page-visibility", {
    method: "POST",
    headers: { host: "rosecity.example", "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue(club());
  mocks.rpc.mockResolvedValue({ data: { stadium: false }, error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.createClient.mockResolvedValue({ schema: mocks.schema });
});

describe("POST /api/admin/public-page-visibility", () => {
  it.each([
    ["a body that is not JSON", "not json"],
    ["an empty object", {}],
    ["a missing visible", { page: "stadium" }],
    ["a missing page", { visible: false }],
    ["a visible that is not a boolean", { page: "stadium", visible: "false" }],
    ["a null visible", { page: "stadium", visible: null }],
    ["an unknown page", { page: "shop", visible: false }],
    ["a page that is not a visibility key", { page: "robinson", visible: false }],
    ["an array body", [{ page: "stadium", visible: false }]],
    ["an extra field", { page: "stadium", visible: false, extra: true }],
  ])("rejects %s with 400 before touching the session or the database", async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_PUBLIC_PAGE_VISIBILITY" });
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("never uses a club id from the body: it is rejected and nothing is written", async () => {
    for (const body of [
      { page: "stadium", visible: false, clubId: otherClubId },
      { page: "stadium", visible: false, club_id: otherClubId },
      { page: "stadium", visible: false, p_club_id: otherClubId },
    ]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["stadium", "chick-fil-a", "foothill-transit"] as const)("lets an owner hide and show %s, with the club taken from the host", async page => {
    for (const visible of [false, true]) {
      mocks.rpc.mockResolvedValueOnce({ data: { [page]: visible }, error: null });
      const response = await POST(post({ page, visible }));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ visibility: { [page]: visible } });
      expect(mocks.rpc).toHaveBeenLastCalledWith("set_public_page_visibility", { p_club_id: clubId, p_page_key: page, p_visible: visible });
    }
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "rosecity.example", userId });
    expect(mocks.schema).toHaveBeenCalledWith("onzio");
  });

  it("lets an admin change it too", async () => {
    mocks.getClubContext.mockResolvedValue(club({ role: "admin" }));
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("set_public_page_visibility", { p_club_id: clubId, p_page_key: "stadium", p_visible: false });
  });

  it("returns only the known boolean entries the database sent back", async () => {
    mocks.rpc.mockResolvedValue({ data: { stadium: false, "chick-fil-a": true, shop: false, "foothill-transit": "no" }, error: null });
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(await response.json()).toEqual({ visibility: { stadium: false, "chick-fil-a": true } });
  });

  it.each([null, "viewer", "operator", undefined])("returns 403 for a caller whose role is %s and never calls the database", async role => {
    mocks.getClubContext.mockResolvedValue(club({ role }));
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["archived", "suspended"])("returns 403 when the club is %s", async lifecycle => {
    mocks.getClubContext.mockResolvedValue(club({ lifecycle }));
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 401 without a fresh session and never resolves the club", async () => {
    for (const code of ["AUTHENTICATION_REQUIRED", "SESSION_EXPIRED"]) {
      mocks.requireFreshClubSession.mockRejectedValueOnce(new ContractError(code));
      const response = await POST(post({ page: "stadium", visible: false }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: code });
    }
    expect(mocks.getClubContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown host", async () => {
    mocks.getClubContext.mockRejectedValue(new ContractError("UNKNOWN_TENANT"));
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a cross-site request before reading it", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[]) {
      const response = await POST(post({ page: "stadium", visible: false }, headers));
      expect(response.status).toBe(403);
    }
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    const sameOrigin = await POST(post({ page: "stadium", visible: false }, { origin: "https://rosecity.example", "sec-fetch-site": "same-origin" }));
    expect(sameOrigin.status).toBe(200);
  });

  it("maps database refusals to 403, 400 and 404 (a design without these pages), and anything else to 500", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_AUTHORIZED", code: "42501" } });
    expect((await POST(post({ page: "stadium", visible: false }))).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied for function x", code: "42501" } });
    expect((await POST(post({ page: "stadium", visible: false }))).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "INVALID_PUBLIC_PAGE_VISIBILITY", code: "22023" } });
    expect((await POST(post({ page: "stadium", visible: false }))).status).toBe(400);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "PAGE_UNAVAILABLE", code: "22023" } });
    const unavailable = await POST(post({ page: "stadium", visible: false }));
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({ error: "PAGE_UNAVAILABLE" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "boom", code: "XX000" } });
    const failed = await POST(post({ page: "stadium", visible: false }));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "PUBLIC_PAGE_VISIBILITY_FAILED" });
  });

  it("returns 500 if the database client itself throws", async () => {
    mocks.createClient.mockRejectedValue(new Error("down"));
    const response = await POST(post({ page: "stadium", visible: false }));
    expect(response.status).toBe(500);
  });
});
