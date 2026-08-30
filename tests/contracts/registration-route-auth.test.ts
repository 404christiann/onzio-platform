import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(),
  createClient: vi.fn(),
  getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  authorizeAdminAccess: mocks.authorizeAdminAccess,
}));
vi.mock("@/lib/auth-session", () => ({
  requireFreshClubSession: mocks.requireFreshClubSession,
}));
vi.mock("@/lib/club-context", () => ({
  getClubContext: mocks.getClubContext,
}));
vi.mock("@/lib/supabase-server", () => ({
  createClient: mocks.createClient,
}));

import { requireRegistrationRouteAuthorization } from
  "@/lib/registration-route-auth";

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: {} });
  mocks.requireFreshClubSession.mockResolvedValue({ userId, claims: {} });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
});

describe("registration route authorization", () => {
  it.each(["owner", "admin"] as const)(
    "uses the standard fresh AAL1 content boundary for an active %s",
    async (role) => {
      mocks.getClubContext.mockResolvedValue({
        id: clubId,
        role,
        lifecycle: "active",
      });

      const result = await requireRegistrationRouteAuthorization(
        new Request("https://alpha.localhost/admin/registrations", {
          headers: { host: "alpha.localhost" },
        }),
      );

      expect(mocks.requireFreshClubSession).toHaveBeenCalledOnce();
      expect(mocks.getClubContext).toHaveBeenCalledWith({
        hostname: "alpha.localhost",
        userId,
      });
      expect(mocks.authorizeAdminAccess).toHaveBeenCalledWith({
        club: expect.objectContaining({ id: clubId, role }),
        userId,
        memberships: [{
          userId,
          clubId,
          role,
          status: "active",
        }],
        aal: "aal1",
        capability: "content",
      });
      expect(result.user).toEqual({ id: userId });
    },
  );

  it("contains no registration-specific MFA assurance lookup", async () => {
    const source = await readFile(
      resolve(process.cwd(), "lib/registration-route-auth.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/auth\.mfa|getAuthenticatorAssuranceLevel|aal2/i);
    expect(source).toContain("requireFreshClubSession");
  });
});
