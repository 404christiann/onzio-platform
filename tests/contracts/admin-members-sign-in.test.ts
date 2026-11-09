import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

// ADMIN-RE-18: the members route's half of "Who can sign in". Every action here
// is owner-only, the club always comes from the host and session (never the
// body), and the library's refusals keep their meaning on the way out.

const mocks = vi.hoisted(() => ({
  requireFreshClubSession: vi.fn(),
  getClubContext: vi.fn(),
  createClient: vi.fn(),
  addClubAdmin: vi.fn(),
  assertClubMemberSession: vi.fn(),
  assertClubOwnerSession: vi.fn(),
  listClubAdmins: vi.fn(),
  listClubOwners: vi.fn(),
  removeClubAdmin: vi.fn(),
  resendClubAdminCode: vi.fn(),
  setMemberDisplayName: vi.fn(),
  undoRemoveClubAdmin: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/owner-admin-membership", () => ({
  addClubAdmin: mocks.addClubAdmin,
  assertClubMemberSession: mocks.assertClubMemberSession,
  assertClubOwnerSession: mocks.assertClubOwnerSession,
  listClubAdmins: mocks.listClubAdmins,
  listClubOwners: mocks.listClubOwners,
  removeClubAdmin: mocks.removeClubAdmin,
  resendClubAdminCode: mocks.resendClubAdminCode,
  setMemberDisplayName: mocks.setMemberDisplayName,
  undoRemoveClubAdmin: mocks.undoRemoveClubAdmin,
}));

const { GET, POST } = await import("@/app/api/admin/members/route");

const hostClubId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const ownerSession = { actorId, clubId: hostClubId, client: {} };

function post(body: unknown) {
  return POST(new Request("https://alpha.example/api/admin/members", {
    method: "POST",
    headers: { host: "alpha.example", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function asRole(role: "owner" | "admin" | null) {
  mocks.getClubContext.mockResolvedValue({ id: hostClubId, role });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId: actorId });
  mocks.createClient.mockResolvedValue({
    auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
  });
  mocks.assertClubOwnerSession.mockResolvedValue(ownerSession);
  mocks.addClubAdmin.mockResolvedValue({ userId: adminId, codeSent: true });
  mocks.resendClubAdminCode.mockResolvedValue({ userId: adminId, codeSent: true });
  mocks.undoRemoveClubAdmin.mockResolvedValue({ userId: adminId, status: "active" });
  mocks.removeClubAdmin.mockResolvedValue({
    userId: adminId,
    status: "removed",
    undoUntil: "2026-11-08T12:10:00.000Z",
  });
});

describe("the lists carry each person's last sign-in", () => {
  it("returns lastSignInAt for owners and admins as the library gives it", async () => {
    asRole("owner");
    mocks.listClubOwners.mockResolvedValue([{ userId: actorId, lastSignInAt: "2026-11-03T18:00:00Z", isYou: true }]);
    mocks.listClubAdmins.mockResolvedValue([{ userId: adminId, lastSignInAt: null }]);
    const response = await GET(new Request("https://alpha.example/api/admin/members", {
      headers: { host: "alpha.example" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      owners: [{ userId: actorId, lastSignInAt: "2026-11-03T18:00:00Z", isYou: true }],
      admins: [{ userId: adminId, lastSignInAt: null }],
    });
  });

  it("reads it from Auth with the service role, inside the membership library only", () => {
    const lib = readFileSync(resolve(process.cwd(), "lib/owner-admin-membership.ts"), "utf8");
    expect(lib).toContain("lastSignInAt: identity.data.user?.last_sign_in_at ?? null");
    const route = readFileSync(resolve(process.cwd(), "app/api/admin/members/route.ts"), "utf8");
    expect(route).not.toMatch(/supabase-service-role|SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe.each([
  ["resend-code", mocks.resendClubAdminCode],
  ["undo-remove", mocks.undoRemoveClubAdmin],
] as const)("%s", (action, handler) => {
  it("runs for an owner, on the host's club, ignoring any club in the body", async () => {
    asRole("owner");
    const response = await post({ action, userId: adminId, clubId: "evil", club_id: "evil" });
    expect(response.status).toBe(200);
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "alpha.example", userId: actorId });
    expect(mocks.assertClubOwnerSession).toHaveBeenCalledWith("token", hostClubId);
    expect(handler).toHaveBeenCalledWith(ownerSession, adminId);
  });

  it("refuses an admin and an outsider before reaching the library", async () => {
    for (const role of ["admin", null] as const) {
      asRole(role);
      const response = await post({ action, userId: adminId });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "OWNER_REQUIRED" });
    }
    expect(mocks.assertClubOwnerSession).not.toHaveBeenCalled();
    expect(mocks.assertClubMemberSession).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed person before touching the session", async () => {
    asRole("owner");
    for (const body of [{ action }, { action, userId: "not-a-uuid" }, { action, userId: 42 }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_MEMBERSHIP_INPUT" });
    }
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled();
  });

  it("passes a cross-club or removed target's refusal through as 403", async () => {
    asRole("owner");
    for (const code of ["MEMBERSHIP_REQUIRED", "MEMBERSHIP_INACTIVE", "OWNER_TRANSFER_OPERATOR_REQUIRED"]) {
      handler.mockRejectedValueOnce(new ContractError(code));
      const response = await post({ action, userId: adminId });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: code });
    }
  });
});

describe("send the code again", () => {
  it("keeps the Auth cooldown as a retryable 429", async () => {
    asRole("owner");
    mocks.resendClubAdminCode.mockRejectedValueOnce(new ContractError("AUTH_CODE_RATE_LIMITED"));
    const response = await post({ action: "resend-code", userId: adminId });
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_CODE_RATE_LIMITED" });
  });

  it("uses the same signInWithOtp path as add", () => {
    const lib = readFileSync(resolve(process.cwd(), "lib/owner-admin-membership.ts"), "utf8");
    expect(lib.match(/auth\.signInWithOtp\(/g)).toHaveLength(1);
    const resend = lib.slice(lib.indexOf("export async function resendClubAdminCode("));
    expect(resend.slice(0, resend.indexOf("\n}\n"))).toContain("await sendSignInCode(session, email, options);");
  });
});

describe("remove with undo", () => {
  it("tells the page how long Undo lasts", async () => {
    asRole("owner");
    const response = await post({ action: "remove", userId: adminId });
    await expect(response.json()).resolves.toEqual({
      userId: adminId,
      status: "removed",
      undoUntil: "2026-11-08T12:10:00.000Z",
    });
  });

  it("answers 409 once the undo window has passed", async () => {
    asRole("owner");
    mocks.undoRemoveClubAdmin.mockRejectedValueOnce(new ContractError("MEMBERSHIP_UNDO_UNAVAILABLE"));
    const response = await post({ action: "undo-remove", userId: adminId });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "MEMBERSHIP_UNDO_UNAVAILABLE" });
  });

  it("keeps the audit payloads free of names and addresses", () => {
    const lib = readFileSync(resolve(process.cwd(), "lib/owner-admin-membership.ts"), "utf8");
    expect(lib).toContain('payload: { role: "admin", source: "undo" }');
    expect(lib).toContain('operation: "membership_code_resent"');
  });
});

describe("a name for new helpers (decision 0010)", () => {
  it("passes the name through to add, and leaves it out when the old page sends none", async () => {
    asRole("owner");
    await post({ action: "add", email: "sam@example.com", displayName: "Sam Lee" });
    expect(mocks.addClubAdmin).toHaveBeenLastCalledWith(ownerSession, {
      email: "sam@example.com",
      role: "admin",
      displayName: "Sam Lee",
    });
    await post({ action: "add", email: "sam@example.com" });
    expect(mocks.addClubAdmin).toHaveBeenLastCalledWith(ownerSession, {
      email: "sam@example.com",
      role: "admin",
      displayName: undefined,
    });
  });

  it("refuses an unusable name with 400", async () => {
    asRole("owner");
    for (const displayName of [42, "x".repeat(1_001)]) {
      const response = await post({ action: "add", email: "sam@example.com", displayName });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_MEMBERSHIP_INPUT" });
    }
    mocks.addClubAdmin.mockRejectedValueOnce(new ContractError("INVALID_DISPLAY_NAME"));
    const invisible = await post({ action: "add", email: "sam@example.com", displayName: "​" });
    expect(invisible.status).toBe(400);
    await expect(invisible.json()).resolves.toEqual({ error: "INVALID_DISPLAY_NAME" });
  });

  it("still refuses add to an admin", async () => {
    asRole("admin");
    const response = await post({ action: "add", email: "sam@example.com", displayName: "Sam" });
    expect(response.status).toBe(403);
    expect(mocks.addClubAdmin).not.toHaveBeenCalled();
  });
});
