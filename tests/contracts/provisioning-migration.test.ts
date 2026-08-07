import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubs, USER_IDS } from "../fixtures/entities";
import { expectContractError, loadContract } from "../helpers/contract";

type ProvisionClub = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
type ArchiveClub = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
type ReactivateClub = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
type PurgeClub = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
type TransformRoseCity = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

const OPERATOR_TOKEN = "verified-operator-token";
const operatorDependencies = {
  now: () => new Date("2026-08-03T18:00:00Z"),
  verifyOperatorAccessToken: async () => ({
    sub: USER_IDS.ownerAal2,
    aal: "aal2",
    amr: [{ method: "totp", timestamp: 1785780000 }],
  }),
};

beforeEach(() => {
  vi.stubEnv("ONZIO_OPERATOR_USER_IDS", USER_IDS.ownerAal2);
});

describe("operator provisioning contract", () => {
  const request = {
    slug: "charlie",
    name: "Charlie Athletic",
    primaryDomain: "charlie-onzio.vercel.app",
    kind: "customer" as const,
    ownerEmail: "owner@charlie.example",
    operatorAccessToken: OPERATOR_TOKEN,
    dependencies: operatorDependencies,
  };

  it("creates the onboarding tenant atomically", async () => {
    const provisionClub = await loadContract<ProvisionClub>(
      "@/lib/operator/provision-club",
      "provisionClub",
    );
    await expect(provisionClub(request)).resolves.toMatchObject({
      club: {
        slug: "charlie",
        kind: "customer",
        lifecycle: "onboarding",
        publicAccess: "preview",
      },
      domain: {
        hostname: "charlie-onzio.vercel.app",
        primary: true,
        verified: true,
      },
      owner: {
        email: "owner@charlie.example",
        role: "owner",
      },
      public: false,
      committed: true,
    });
  });

  it("reuses an existing Auth user without duplication", async () => {
    const provisionClub = await loadContract<ProvisionClub>(
      "@/lib/operator/provision-club",
      "provisionClub",
    );
    await expect(
      provisionClub({ ...request, existingAuthUserId: USER_IDS.multiClub }),
    ).resolves.toMatchObject({
      owner: { userId: USER_IDS.multiClub, authUserCreated: false },
    });
  });

  it.each([
    [{ existingSlug: true }, "SLUG_CONFLICT"],
    [{ existingDomain: true }, "DOMAIN_CONFLICT"],
    [{ simulateMembershipFailure: true }, "PROVISIONING_ROLLED_BACK"],
    [{ kind: undefined }, "INVALID_OPERATOR_INPUT"],
    [{ kind: "enterprise" }, "INVALID_OPERATOR_INPUT"],
  ] as const)("rolls back invalid provisioning %#", async (override, code) => {
    const provisionClub = await loadContract<ProvisionClub>(
      "@/lib/operator/provision-club",
      "provisionClub",
    );
    await expectContractError(
      () => provisionClub({ ...request, ...override }),
      code,
    );
  });

  it.each(["customer", "demo", "test"] as const)(
    "persists the requested kind (%s)",
    async (kind) => {
      const provisionClub = await loadContract<ProvisionClub>(
        "@/lib/operator/provision-club",
        "provisionClub",
      );
      await expect(
        provisionClub({ ...request, kind }),
      ).resolves.toMatchObject({ club: { kind } });
    },
  );
});

describe("archive, reactivate, and purge contract", () => {
  it("archives without deleting tenant data or media", async () => {
    const archiveClub = await loadContract<ArchiveClub>(
      "@/lib/operator/archive-club",
      "archiveClub",
    );
    await expect(
      archiveClub({
        clubId: clubs.alpha.id,
        operatorAccessToken: OPERATOR_TOKEN,
        dependencies: operatorDependencies,
      }),
    ).resolves.toMatchObject({
      lifecycle: "archived",
      domainsDetached: true,
      sessionsRejected: true,
      writesBlocked: true,
      contentPreserved: true,
      mediaPreserved: true,
      audited: true,
    });
  });

  it("reactivates the same tenant identity and content", async () => {
    const reactivateClub = await loadContract<ReactivateClub>(
      "@/lib/operator/reactivate-club",
      "reactivateClub",
    );
    await expect(
      reactivateClub({
        clubId: clubs.alpha.id,
        operatorAccessToken: OPERATOR_TOKEN,
        dependencies: operatorDependencies,
      }),
    ).resolves.toMatchObject({
      clubId: clubs.alpha.id,
      contentRestored: true,
      requiresBillingBeforePublicLaunch: true,
    });
  });

  it.each([
    [{ exportId: null, confirmation: clubs.alpha.slug }, "EXPORT_REQUIRED"],
    [{ exportId: "export_123", confirmation: "wrong-club" }, "CONFIRMATION_MISMATCH"],
    [{ invokedFromApplicationRoute: true }, "OPERATOR_ONLY"],
  ] as const)("rejects unsafe hard purge %#", async (override, code) => {
    const purgeClub = await loadContract<PurgeClub>(
      "@/lib/operator/purge-club",
      "purgeClub",
    );
    await expectContractError(
      () =>
        purgeClub({
          clubId: clubs.alpha.id,
          operatorAccessToken: OPERATOR_TOKEN,
          exportId: "export_123",
          confirmation: clubs.alpha.slug,
          dependencies: operatorDependencies,
          ...override,
        }),
      code,
    );
  });
});

describe("Rose City migration contract", () => {
  const source = {
    clubId: "33333333-3333-4333-8333-333333333333",
    singletonRows: [{ table: "site_branding", id: 1 }],
    players: [{ id: "player_1", name: "Player One" }],
    matches: [{ id: "match_1", opponent: "Opponent" }],
    playerMatchStats: [
      { id: "stat_1", playerId: "player_1", matchId: "match_1" },
    ],
    media: [
      {
        sourcePath: "roster/player-1.jpg",
        checksum: "sha256:source",
      },
    ],
    stripeSubscriptionId: "sub_rose_existing",
  };

  it("transforms rows, relationships, and media into one tenant", async () => {
    const transformRoseCity = await loadContract<TransformRoseCity>(
      "@/lib/migration/rose-city-transform",
      "transformRoseCity",
    );
    await expect(transformRoseCity(source)).resolves.toMatchObject({
      clubId: source.clubId,
      singletonRows: [{ club_id: source.clubId }],
      players: [{ club_id: source.clubId }],
      matches: [{ club_id: source.clubId }],
      playerMatchStats: [
        {
          club_id: source.clubId,
          player_id: "player_1",
          match_id: "match_1",
        },
      ],
      media: [
        {
          club_id: source.clubId,
          versioned: true,
          transformedBySupabase: false,
        },
      ],
      stripeSubscriptionId: "sub_rose_existing",
    });
  });

  it("is idempotent on repeated imports", async () => {
    const transformRoseCity = await loadContract<TransformRoseCity>(
      "@/lib/migration/rose-city-transform",
      "transformRoseCity",
    );
    const first = await transformRoseCity(source);
    const second = await transformRoseCity(source);
    expect(second).toEqual(first);
  });

  it.each([
    [{ missingMedia: true }, "MISSING_MEDIA"],
    [{ duplicateRows: true }, "DUPLICATE_SOURCE_ROW"],
    [{ corruptMedia: true }, "CORRUPT_MEDIA"],
    [{ missingRelationship: true }, "RELATIONSHIP_MISMATCH"],
    [{ rowCountMismatch: true }, "ROW_COUNT_MISMATCH"],
    [{ checksumMismatch: true }, "CHECKSUM_MISMATCH"],
  ] as const)("fails migration preflight %#", async (override, code) => {
    const transformRoseCity = await loadContract<TransformRoseCity>(
      "@/lib/migration/rose-city-transform",
      "transformRoseCity",
    );
    await expectContractError(
      () => transformRoseCity({ ...source, ...override }),
      code,
    );
  });
});
