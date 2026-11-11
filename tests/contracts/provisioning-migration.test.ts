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

// The real path, against a fake operator client: the database purge is one
// call to onzio.purge_archived_club (one transaction, see
// tests/database/purge-archived-club.test.ts), and Storage is removed only
// after it returns.
describe("hard purge database and Storage order", () => {
  type RpcReply = { data: unknown; error: { message: string; details?: string } | null };

  function fakeClient(options: {
    rpc: RpcReply;
    storage?: Record<string, string[]>;
    removeError?: string;
    auditError?: string;
  }) {
    const calls: string[] = [];
    const rpcArgs: unknown[] = [];
    const removed: string[] = [];
    const audits: Record<string, unknown>[] = [];
    const storage = options.storage ?? {};
    const client = {
      schema(schema: string) {
        return {
          rpc: async (name: string, args: unknown) => {
            calls.push(`rpc:${schema}.${name}`);
            rpcArgs.push(args);
            return options.rpc;
          },
          from: (table: string) => ({
            insert: (row: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  calls.push(`insert:${schema}.${table}`);
                  if (options.auditError) {
                    return { data: null, error: { message: options.auditError } };
                  }
                  audits.push(row);
                  return { data: { id: 77 }, error: null };
                },
              }),
            }),
          }),
        };
      },
      storage: {
        from(bucket: string) {
          return {
            list: async (prefix: string) => {
              calls.push(`list:${bucket}/${prefix}`);
              const names = (storage[bucket] ?? [])
                .filter((path) => path.startsWith(`${prefix}/`))
                .map((path) => path.slice(prefix.length + 1));
              const entries = new Map<string, { name: string; id: string | null }>();
              for (const name of names) {
                const [head, ...rest] = name.split("/");
                entries.set(head, { name: head, id: rest.length ? null : `id-${head}` });
              }
              return { data: [...entries.values()], error: null };
            },
            remove: async (paths: string[]) => {
              calls.push(`remove:${bucket}`);
              if (options.removeError) {
                return { data: null, error: { message: options.removeError } };
              }
              removed.push(...paths.map((path) => `${bucket}/${path}`));
              return { data: [], error: null };
            },
          };
        },
      },
    };
    return { client, calls, rpcArgs, removed, audits };
  }

  async function purge(client: unknown) {
    const purgeClub = await loadContract<PurgeClub>(
      "@/lib/operator/purge-club",
      "purgeClub",
    );
    return purgeClub({
      clubId: clubs.alpha.id,
      operatorAccessToken: OPERATOR_TOKEN,
      exportId: "export_123",
      confirmation: clubs.alpha.slug,
      dependencies: { ...operatorDependencies, client },
    });
  }

  const media = {
    "onzio-media": [
      `${clubs.alpha.id}/branding/logo.png`,
      `${clubs.alpha.id}/roster/player.jpg`,
    ],
    "onzio-upload-staging": [`${clubs.alpha.id}/roster/staged.jpg`],
  };

  it("purges the rows in one database call, then removes Storage", async () => {
    const fake = fakeClient({
      rpc: {
        data: {
          status: "purged",
          club_slug: clubs.alpha.slug,
          audit_event_id: 42,
          rows_deleted: { "onzio.players": 3, "onzio.clubs": 1 },
        },
        error: null,
      },
      storage: media,
    });

    await expect(purge(fake.client)).resolves.toMatchObject({
      purged: true,
      alreadyPurged: false,
      auditEventId: 42,
      rowsDeleted: { "onzio.players": 3, "onzio.clubs": 1 },
      storageObjectsRemoved: 3,
      storageAuditEventId: 77,
      finalAuditOutsideTenant: true,
    });
    expect(fake.rpcArgs).toEqual([
      {
        p_club_id: clubs.alpha.id,
        p_export_id: "export_123",
        p_confirmation: clubs.alpha.slug,
        p_actor_id: USER_IDS.ownerAal2,
      },
    ]);
    expect(fake.calls[0]).toBe("rpc:onzio.purge_archived_club");
    expect(fake.calls.filter((call) => call.startsWith("rpc:"))).toHaveLength(1);
    expect(fake.removed.sort()).toEqual([
      `onzio-media/${clubs.alpha.id}/branding/logo.png`,
      `onzio-media/${clubs.alpha.id}/roster/player.jpg`,
      `onzio-upload-staging/${clubs.alpha.id}/roster/staged.jpg`,
    ]);
    // The Storage outcome is its own audit event, written after the files go.
    expect(fake.calls.at(-1)).toBe("insert:onzio.audit_events");
    expect(fake.audits).toEqual([
      {
        club_id: null,
        actor_user_id: USER_IDS.ownerAal2,
        actor_type: "operator",
        operation: "hard_purge_storage",
        resource_type: "purged_club",
        resource_id: clubs.alpha.id,
        payload: { export_id: "export_123", objects_removed: 3, status: "removed" },
      },
    ]);
  });

  it.each([
    "CLUB_NOT_FOUND",
    "CONFIRMATION_MISMATCH",
    "CLUB_NOT_ARCHIVED",
    "EXPORT_REQUIRED",
    "PURGE_BLOCKED",
    "PURGE_UNKNOWN_CLUB_TABLE",
    "PURGE_OTHER_CLUB_CHANGED",
    "PURGE_INCOMPLETE",
  ])("passes the database refusal %s through and leaves Storage alone", async (code) => {
    const fake = fakeClient({
      rpc: { data: null, error: { message: code, details: "detail" } },
      storage: media,
    });
    await expectContractError(() => purge(fake.client), code);
    expect(fake.calls).toEqual(["rpc:onzio.purge_archived_club"]);
    expect(fake.audits).toEqual([]);
  });

  it("reports any other database error as PURGE_DATABASE_FAILED and leaves Storage alone", async () => {
    const fake = fakeClient({
      rpc: { data: null, error: { message: "canceling statement due to lock timeout" } },
      storage: media,
    });
    await expectContractError(() => purge(fake.client), "PURGE_DATABASE_FAILED");
    expect(fake.calls).toEqual(["rpc:onzio.purge_archived_club"]);
  });

  it("records a Storage failure after the rows are purged, then reports PURGE_STORAGE_FAILED", async () => {
    const fake = fakeClient({
      rpc: { data: { status: "purged", club_slug: clubs.alpha.slug }, error: null },
      storage: media,
      removeError: "storage unavailable",
    });
    await expectContractError(() => purge(fake.client), "PURGE_STORAGE_FAILED");
    expect(fake.audits).toEqual([
      expect.objectContaining({
        club_id: null,
        operation: "hard_purge_storage",
        resource_id: clubs.alpha.id,
        payload: {
          export_id: "export_123",
          objects_removed: 0,
          status: "failed",
          error: "onzio-upload-staging: storage unavailable",
        },
      }),
    ]);
  });

  it("still reports PURGE_STORAGE_FAILED when the failure can't be recorded", async () => {
    const fake = fakeClient({
      rpc: { data: { status: "purged", club_slug: clubs.alpha.slug }, error: null },
      storage: media,
      removeError: "storage unavailable",
      auditError: "audit insert failed",
    });
    await expectContractError(() => purge(fake.client), "PURGE_STORAGE_FAILED");
  });

  it("retries only the Storage removal when the club was already purged", async () => {
    const fake = fakeClient({
      rpc: { data: { status: "already_purged", club_slug: clubs.alpha.slug }, error: null },
      storage: media,
    });
    await expect(purge(fake.client)).resolves.toMatchObject({
      purged: true,
      alreadyPurged: true,
      auditEventId: null,
      storageObjectsRemoved: 3,
    });
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
