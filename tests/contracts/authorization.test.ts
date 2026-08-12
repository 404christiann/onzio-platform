import { describe, expect, it } from "vitest";
import {
  accessStates,
  clubs,
  memberships,
  USER_IDS,
} from "../fixtures/entities";
import { expectContractError, loadContract } from "../helpers/contract";

type AuthorizeAdminAccess = (input: {
  club: Record<string, unknown>;
  userId: string;
  memberships: readonly Record<string, unknown>[];
  aal: "aal1" | "aal2";
  capability: "content" | "billing";
}) => Promise<{ allowed: true; role: "owner" | "admin" }>;
type AuthorizeMutation = (input: {
  club: Record<string, unknown>;
  userId: string;
  memberships: readonly Record<string, unknown>[];
  aal: "aal1" | "aal2";
  feature: string;
  payload: Record<string, unknown>;
}) => Promise<{ clubId: string; actorId: string }>;
type ResolvePublicAccess = (
  input: Record<string, unknown>,
  now: Date,
) => "preview" | "live" | "grace" | "suspended";
type ClubHasFeature = (
  tier: "starter" | "pro",
  feature: string,
) => boolean;

describe("admin authentication and role contract", () => {
  it("allows an AAL2 owner to manage content and billing", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    for (const capability of ["content", "billing"] as const) {
      await expect(
        authorizeAdminAccess({
          club: clubs.alpha,
          userId: USER_IDS.ownerAal2,
          memberships,
          aal: "aal2",
          capability,
        }),
      ).resolves.toMatchObject({ allowed: true, role: "owner" });
    }
  });

  it("allows an AAL2 admin to manage content", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expect(
      authorizeAdminAccess({
        club: clubs.alpha,
        userId: USER_IDS.adminAal2,
        memberships,
        aal: "aal2",
        capability: "content",
      }),
    ).resolves.toMatchObject({ allowed: true, role: "admin" });
  });

  it("allows an onboarding owner to begin billing from private preview", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expect(
      authorizeAdminAccess({
        club: clubs.bravo,
        userId: USER_IDS.multiClub,
        memberships,
        aal: "aal2",
        capability: "billing",
      }),
    ).resolves.toMatchObject({ allowed: true, role: "owner" });
  });

  it("rejects an admin attempting billing", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expectContractError(
      () =>
        authorizeAdminAccess({
          club: clubs.alpha,
          userId: USER_IDS.adminAal2,
          memberships,
          aal: "aal2",
          capability: "billing",
        }),
      "OWNER_REQUIRED",
    );
  });

  it("rejects an owner whose session has not reached AAL2", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expectContractError(
      () =>
        authorizeAdminAccess({
          club: clubs.alpha,
          userId: USER_IDS.ownerAal1,
          memberships,
          aal: "aal1",
          capability: "content",
        }),
      "MFA_REQUIRED",
    );
  });

  it.each([
    [USER_IDS.removed, "MEMBERSHIP_INACTIVE"],
    [USER_IDS.unaffiliated, "MEMBERSHIP_REQUIRED"],
  ])("rejects member state for %s", async (userId, code) => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expectContractError(
      () =>
        authorizeAdminAccess({
          club: clubs.alpha,
          userId,
          memberships,
          aal: "aal2",
          capability: "content",
        }),
      code,
    );
  });

  it("rejects every admin action for an archived club", async () => {
    const authorizeAdminAccess = await loadContract<AuthorizeAdminAccess>(
      "@/lib/authorization",
      "authorizeAdminAccess",
    );
    await expectContractError(
      () =>
        authorizeAdminAccess({
          club: { ...clubs.alpha, lifecycle: "archived" },
          userId: USER_IDS.ownerAal2,
          memberships,
          aal: "aal2",
          capability: "content",
        }),
      "CLUB_ARCHIVED",
    );
  });
});

describe("tier and mutation boundary contract", () => {
  it("allows Pro members to mutate Pro features", async () => {
    const authorizeMutation = await loadContract<AuthorizeMutation>(
      "@/lib/authorization",
      "authorizeMutation",
    );
    await expect(
      authorizeMutation({
        club: clubs.alpha,
        userId: USER_IDS.adminAal2,
        memberships,
        aal: "aal2",
        feature: "standings",
        payload: { title: "League table" },
      }),
    ).resolves.toEqual({
      clubId: clubs.alpha.id,
      actorId: USER_IDS.adminAal2,
    });
  });

  it("rejects Starter writes to Pro-only features", async () => {
    const authorizeMutation = await loadContract<AuthorizeMutation>(
      "@/lib/authorization",
      "authorizeMutation",
    );
    await expectContractError(
      () =>
        authorizeMutation({
          club: {
            ...clubs.alpha,
            tier: "starter",
          },
          userId: USER_IDS.adminAal2,
          memberships,
          aal: "aal2",
          feature: "standings",
          payload: { title: "League table" },
        }),
      "FEATURE_NOT_INCLUDED",
    );
  });

  it("rejects authoritative club_id in a client payload", async () => {
    const authorizeMutation = await loadContract<AuthorizeMutation>(
      "@/lib/authorization",
      "authorizeMutation",
    );
    await expectContractError(
      () =>
        authorizeMutation({
          club: clubs.alpha,
          userId: USER_IDS.adminAal2,
          memberships,
          aal: "aal2",
          feature: "branding",
          payload: {
            club_id: clubs.bravo.id,
            primaryColor: "#ffffff",
          },
        }),
      "UNTRUSTED_TENANT_INPUT",
    );
  });

  it.each([
    ["starter", "branding", true],
    ["starter", "standings", false],
    ["starter", "shop", false],
    ["pro", "standings", true],
    ["pro", "shop", true],
  ] as const)(
    "evaluates %s access to %s",
    async (tier, feature, expected) => {
      const clubHasFeature = await loadContract<ClubHasFeature>(
        "@/lib/club-features",
        "clubHasFeature",
      );
      expect(clubHasFeature(tier, feature)).toBe(expected);
    },
  );
});

describe("public subscription access contract", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  it.each([
    ["onboarding", "preview"],
    ["active", "live"],
    ["trialing", "live"],
    ["grace", "grace"],
    ["suspended", "suspended"],
    ["archived", "suspended"],
  ] as const)("maps %s state to %s", async (state, expected) => {
    const resolvePublicAccess = await loadContract<ResolvePublicAccess>(
      "@/lib/club-access",
      "resolvePublicAccess",
    );
    expect(resolvePublicAccess(accessStates[state], now)).toBe(expected);
  });

  it("keeps canceling subscriptions live before paid-through time", async () => {
    const resolvePublicAccess = await loadContract<ResolvePublicAccess>(
      "@/lib/club-access",
      "resolvePublicAccess",
    );
    expect(
      resolvePublicAccess(
        {
          lifecycle: "active",
          status: "active",
          cancelAtPeriodEnd: true,
          paidThrough: "2026-08-01T00:00:00Z",
        },
        now,
      ),
    ).toBe("live");
  });
});
