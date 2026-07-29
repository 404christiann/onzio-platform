import { describe, expect, it } from "vitest";
import {
  buildRoseCityImportPlan,
  materializeMediaTokens,
  ROSE_CITY_SOURCE_TABLES,
  type PlannedMedia,
  type SourceRow,
} from "@/lib/migration/rose-city-plan";

function completeTables(): Record<string, SourceRow[]> {
  const tables = Object.fromEntries(
    ROSE_CITY_SOURCE_TABLES.map((table) => [table, []]),
  ) as Record<string, SourceRow[]>;
  tables.stripe_subscription = [
    {
      id: 1,
      stripe_customer_id: "cus_rose_existing",
      stripe_subscription_id: "sub_rose_existing",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-07-27T00:00:00.000Z",
    },
  ];
  return tables;
}

describe("complete Rose City import plan", () => {
  it("maps all 24 source tables deterministically and preserves Stripe", () => {
    const input = {
      sourceTables: completeTables(),
      media: [] as PlannedMedia[],
      sourceIdentityCount: 3,
      verifiedSourceDigest: "a".repeat(64),
    };
    const first = buildRoseCityImportPlan(input);
    const second = buildRoseCityImportPlan(input);

    expect(second).toEqual(first);
    expect(first.mappings).toHaveLength(24);
    expect(first.reconciliation).toMatchObject({
      allSourceTablesMapped: true,
      sourceRowCount: 1,
      mappedSourceRowCount: 1,
      relationshipsPreserved: true,
      referencedMediaResolved: true,
      credentialsEmbedded: false,
    });
    expect(first.stripe).toMatchObject({
      sourceSubscriptionId: "sub_rose_existing",
      preserved: true,
      networkCalls: 0,
    });
    expect(first.tables.club_subscriptions).toEqual([
      expect.objectContaining({
        stripe_customer_id: "cus_rose_existing",
        stripe_subscription_id: "sub_rose_existing",
        paid_through: "2026-08-01T00:00:00.000Z",
      }),
    ]);
    expect(first.planDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records excluded legacy-only fields instead of silently dropping them", () => {
    const tables = completeTables();
    tables.matches = [
      {
        id: "legacy-match",
        season_id: "legacy-season",
        date: "2026-07-27",
        time: "19:00",
        opponent: "Opponent",
        passes_ours: 100,
      },
    ];
    tables.seasons = [
      {
        id: "legacy-season",
        label: "2026",
        start_year: 2026,
        end_year: 2026,
        active: true,
      },
    ];

    const plan = buildRoseCityImportPlan({
      sourceTables: tables,
      media: [],
      sourceIdentityCount: 3,
      verifiedSourceDigest: "b".repeat(64),
    });
    const matchMapping = plan.mappings.find(
      (mapping) => mapping.sourceTable === "matches",
    );
    expect(matchMapping?.fields).toContainEqual({
      source: "passes_ours",
      target: null,
      transformation:
        "legacy-only field retained in this mapping ledger and intentionally excluded because the Onzio schema has no equivalent",
    });
  });

  it("rejects missing tables, broken relationships, and referenced exclusions", () => {
    const missing = completeTables();
    delete missing.staff;
    expect(() =>
      buildRoseCityImportPlan({
        sourceTables: missing,
        media: [],
        sourceIdentityCount: 3,
        verifiedSourceDigest: "c".repeat(64),
      }),
    ).toThrow(/Source table set mismatch/);

    const broken = completeTables();
    broken.player_match_stats = [
      { id: "stat", player_id: "missing", match_id: "missing" },
    ];
    expect(() =>
      buildRoseCityImportPlan({
        sourceTables: broken,
        media: [],
        sourceIdentityCount: 3,
        verifiedSourceDigest: "d".repeat(64),
      }),
    ).toThrow(/broken relationship/);

    const media: PlannedMedia = {
      id: "11111111-1111-4111-8111-111111111111",
      sourceBucket: "videos",
      sourcePath: "hero.mp4",
      sourceChecksumSha256: "e".repeat(64),
      referenced: true,
      classification: "video",
      surface: "homepage",
      importable: false,
      destinationPath: null,
      outputRelativePath: null,
      outputMimeType: null,
      outputByteSize: null,
      outputWidth: null,
      outputHeight: null,
      outputChecksumSha256: null,
      reason: "unsupported",
      migrationException: null,
    };
    expect(() =>
      buildRoseCityImportPlan({
        sourceTables: completeTables(),
        media: [media],
        sourceIdentityCount: 3,
        verifiedSourceDigest: "e".repeat(64),
      }),
    ).toThrow(/Referenced media cannot be represented/);
  });

  it("materializes deterministic media tokens only at local import time", () => {
    expect(
      materializeMediaTokens(
        {
          url: "__ONZIO_MEDIA__/club/homepage/asset.webp",
          external: "https://example.com/image.png",
        },
        "http://127.0.0.1:54321/",
      ),
    ).toEqual({
      url: "http://127.0.0.1:54321/storage/v1/object/public/onzio-media/club/homepage/asset.webp",
      external: "https://example.com/image.png",
    });
  });

  it("maps the legacy path-only crest through the logos_v2 inventory", () => {
    const tables = completeTables();
    tables.site_branding = [
      {
        id: 1,
        club_logo_path: "club-branding/rose-city.png",
        updated_at: "2026-07-27T00:00:00.000Z",
      },
    ];
    const crest: PlannedMedia = {
      id: "11111111-1111-4111-8111-111111111111",
      sourceBucket: "logos_v2",
      sourcePath: "club-branding/rose-city.png",
      sourceChecksumSha256: "f".repeat(64),
      referenced: true,
      classification: "graphic",
      surface: "branding",
      importable: true,
      destinationPath:
        "32ceba0b-4e25-52c2-bb6b-d82fb87637a7/branding/11111111-1111-4111-8111-111111111111.png",
      outputRelativePath:
        "media/11111111-1111-4111-8111-111111111111.png",
      outputMimeType: "image/png",
      outputByteSize: 100,
      outputWidth: 100,
      outputHeight: 100,
      outputChecksumSha256: "1".repeat(64),
      reason: null,
      migrationException: null,
    };

    const plan = buildRoseCityImportPlan({
      sourceTables: tables,
      media: [crest],
      sourceIdentityCount: 3,
      verifiedSourceDigest: "f".repeat(64),
    });
    expect(plan.tables.site_branding).toEqual([
      expect.objectContaining({
        club_logo_path: crest.destinationPath,
        club_logo_asset_id: crest.id,
      }),
    ]);
  });
});
