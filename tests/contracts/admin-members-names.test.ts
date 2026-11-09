import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName } from "@/lib/admin-greeting";
import { ContractError } from "@/lib/contract-error";

// ADMIN-RE-04: people's names on the members route. Any active owner or admin
// may name themselves, only an owner may name someone else, the club comes from
// the host and session (never the body), and `add` caps the email at 254 like
// lib/owner-admin-membership.ts does.

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
  setMemberDisplayName: vi.fn(),
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
  setMemberDisplayName: mocks.setMemberDisplayName,
}));

const { POST } = await import("@/app/api/admin/members/route");

const hostClubId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const memberSession = { actorId, clubId: hostClubId, client: {}, role: "admin" };

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
  mocks.assertClubMemberSession.mockResolvedValue(memberSession);
  mocks.assertClubOwnerSession.mockResolvedValue({ actorId, clubId: hostClubId, client: {} });
  mocks.setMemberDisplayName.mockImplementation(async (_session, input) => ({
    userId: input.userId ?? actorId,
    displayName: input.displayName.trim(),
  }));
  mocks.addClubAdmin.mockResolvedValue({ codeSent: true });
});

describe("set-name", () => {
  it("lets an admin name themselves through the any-member session, never the owner one", async () => {
    asRole("admin");
    const response = await post({ action: "set-name", displayName: "Andrea" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ userId: actorId, displayName: "Andrea" });
    expect(mocks.assertClubMemberSession).toHaveBeenCalledWith("token", hostClubId);
    expect(mocks.assertClubOwnerSession).not.toHaveBeenCalled();
    expect(mocks.setMemberDisplayName).toHaveBeenCalledWith(memberSession, {
      userId: undefined,
      displayName: "Andrea",
    });
  });

  it("takes the club from the host and session, ignoring any club in the body", async () => {
    asRole("owner");
    await post({ action: "set-name", userId: otherId, displayName: "Marco", clubId: "evil", club_id: "evil" });
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "alpha.example", userId: actorId });
    expect(mocks.assertClubMemberSession).toHaveBeenCalledWith("token", hostClubId);
    expect(mocks.setMemberDisplayName).toHaveBeenCalledWith(memberSession, {
      userId: otherId,
      displayName: "Marco",
    });
  });

  it("refuses someone who isn't an owner or admin of this club", async () => {
    asRole(null);
    const response = await post({ action: "set-name", displayName: "Andrea" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "CLUB_MEMBER_REQUIRED" });
    expect(mocks.setMemberDisplayName).not.toHaveBeenCalled();
  });

  it("passes the library's refusals through with the right status", async () => {
    asRole("admin");
    mocks.setMemberDisplayName.mockRejectedValueOnce(new ContractError("INVALID_DISPLAY_NAME"));
    const blank = await post({ action: "set-name", displayName: "   " });
    expect(blank.status).toBe(400);
    await expect(blank.json()).resolves.toEqual({ error: "INVALID_DISPLAY_NAME" });

    mocks.setMemberDisplayName.mockRejectedValueOnce(new ContractError("OWNER_REQUIRED"));
    const other = await post({ action: "set-name", userId: otherId, displayName: "Marco" });
    expect(other.status).toBe(403);
    await expect(other.json()).resolves.toEqual({ error: "OWNER_REQUIRED" });
  });

  it("rejects a malformed request before touching the session", async () => {
    asRole("owner");
    for (const body of [
      { action: "set-name", userId: "not-a-uuid", displayName: "Andrea" },
      { action: "set-name" },
      { action: "set-name", displayName: 42 },
      { action: "set-name", displayName: "x".repeat(1_001) },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "INVALID_MEMBERSHIP_INPUT" });
    }
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled();
  });
});

describe("add keeps owner-only and gains the email cap", () => {
  // 64 + 1 + 189 = 254 characters, the limit in lib/owner-admin-membership.ts.
  const email254 = `${"a".repeat(64)}@${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.ffffff`;

  it("accepts a 254-character email and refuses 255", async () => {
    asRole("owner");
    expect(email254).toHaveLength(254);
    expect((await post({ action: "add", email: email254 })).status).toBe(200);
    expect(mocks.addClubAdmin).toHaveBeenCalledTimes(1);

    const email255 = `${email254.slice(0, -6)}fffffff`;
    expect(email255).toHaveLength(255);
    const response = await post({ action: "add", email: email255 });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_MEMBERSHIP_INPUT" });
    expect(mocks.addClubAdmin).toHaveBeenCalledTimes(1);
  });

  it("still refuses add and remove to an admin", async () => {
    asRole("admin");
    for (const body of [
      { action: "add", email: "new@example.com" },
      { action: "remove", userId: otherId },
    ]) {
      const response = await post(body);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "OWNER_REQUIRED" });
    }
    expect(mocks.assertClubMemberSession).not.toHaveBeenCalled();
  });

  it("matches the library's email schema", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/admin/members/route.ts"), "utf8");
    const lib = readFileSync(resolve(process.cwd(), "lib/owner-admin-membership.ts"), "utf8");
    expect(lib).toContain("z.string().trim().email().max(254)");
    expect(route).toContain("z.string().trim().email().max(254)");
  });
});

describe("normalizeDisplayName matches club_members_display_name_length", () => {
  it("trims and folds whitespace, so a saved name is never padded", () => {
    expect(normalizeDisplayName("  Andrea \n\t Lopez  ")).toBe("Andrea Lopez");
  });

  it("allows 1 to 120 characters, counted like Postgres char_length", () => {
    expect(DISPLAY_NAME_MAX_LENGTH).toBe(120);
    expect(normalizeDisplayName("A")).toBe("A");
    expect(normalizeDisplayName("x".repeat(120))).toBe("x".repeat(120));
    expect(normalizeDisplayName("x".repeat(121))).toBeNull();
    expect(normalizeDisplayName("⚽".repeat(120))).toBe("⚽".repeat(120));
    expect(normalizeDisplayName("😀".repeat(120))).toBe("😀".repeat(120));
    expect(normalizeDisplayName("😀".repeat(121))).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(normalizeDisplayName("")).toBeNull();
    expect(normalizeDisplayName("   \n ")).toBeNull();
  });
});

describe("the audit event never carries the name", () => {
  it("writes membership_renamed with only non-identifying facts", () => {
    const lib = readFileSync(resolve(process.cwd(), "lib/owner-admin-membership.ts"), "utf8");
    const start = lib.indexOf("export async function setMemberDisplayName(");
    const body = lib.slice(start, lib.indexOf("\n}\n", start));
    expect(body).toContain('operation: "membership_renamed"');
    expect(body).toContain("payload: { self, had_name: previous !== null }");
  });
});
