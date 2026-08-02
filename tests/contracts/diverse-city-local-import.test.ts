import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  buildDiverseCityImportPlan,
  DIVERSE_CITY_LOCAL_TENANT_ID,
  DIVERSE_CITY_PLAN_GENERATED_AT,
  type DiverseCityKnownAssetPath,
} from "@/lib/migration/diverse-city-plan";
import {
  buildDiverseCityLocalImportRows,
  reconcileDiverseCityLocalImportPlan,
} from "@/lib/migration/diverse-city-local-import";

const ASSETS: DiverseCityKnownAssetPath[] = [
  "media/about-team-lineup.webp",
  "media/crest.png",
  "media/hero.webp",
  "media/programs/mens-teams-detail.webp",
  "media/programs/mens-teams-hero.webp",
  "media/programs/special-kickers-hero.webp",
  "media/programs/special-olympics-hero.webp",
  "media/shop/back_jersey.png",
  "media/shop/front_jersey.png",
  "media/sponsors/elsas-bakery.webp",
];

async function inputs() {
  return Promise.all(
    ASSETS.map(async (path, index) => ({
      path,
      bytes: path.endsWith(".png")
        ? await sharp({
            create: {
              width: 24 + index,
              height: 18 + index,
              channels: 4,
              background: { r: 170 + index, g: 210 + index, b: 230, alpha: 0.8 },
            },
          }).png().toBuffer()
        : await sharp({
            create: {
              width: 28 + index,
              height: 20 + index,
              channels: 3,
              background: { r: 30 + index, g: 54, b: 83 + index },
            },
          }).webp().toBuffer(),
    })),
  );
}

async function plan(generatedAt?: string) {
  return buildDiverseCityImportPlan({
    sourceCommit: "5bbdfa33d59163b218bbd33745f9cfd4a66d379f",
    destinationEnvironment: "local",
    destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
    confirmedDestinationEnvironment: "local",
    dryRun: true,
    generatedAt,
    assets: await inputs(),
  });
}

describe("DCFC-403 deterministic local import", () => {
  it("produces a stable zero-hosted-mutation plan", async () => {
    const first = await plan();
    const second = await plan("2026-08-01T01:00:00.000Z");

    expect(first.generatedAt).toBe(DIVERSE_CITY_PLAN_GENERATED_AT);
    expect(second.planDigest).toBe(first.planDigest);
    expect(second.assets).toEqual(first.assets);
    expect({ ...second, generatedAt: first.generatedAt }).toEqual(first);
    expect(first).toMatchObject({
      kind: "diverse-city-local-import-plan",
      dryRunOnly: true,
      destination: {
        environment: "local",
        tenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
        hostedMutations: 0,
      },
      summary: {
        retainedAssetCount: 10,
        excludedAssetCount: 32,
        hostedMutations: 0,
      },
    });
    expect(first.planDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(
      /storage\/v1\/render\/image|\/_next\/image|google\.com|\.mp4|sb_secret_|service_role/i,
    );
  });

  it("builds approved tenant rows without placeholder production facts", async () => {
    const result = await plan();
    const rows = buildDiverseCityLocalImportRows(result);
    const serialized = JSON.stringify(rows);

    expect(rows.club).toMatchObject({
      id: DIVERSE_CITY_LOCAL_TENANT_ID,
      slug: "diverse-city",
      lifecycle: "active",
      public_access: "live",
      tier: "pro",
    });
    expect(rows.mediaAssets).toHaveLength(10);
    expect(rows.programs).toHaveLength(4);
    expect(rows.tryouts).toEqual([]);
    expect(rows.players).toEqual([]);
    expect(rows.staff).toEqual([]);
    expect(rows.matches).toEqual([]);
    expect(rows.leagueStandings).toEqual([]);
    expect(rows.behindTheRoseSection).toMatchObject({ visible: false });
    expect(rows.presentationDocument).toMatchObject({
      template_id: "academy",
      template_version: 1,
    });
    expect(serialized).not.toMatch(
      /Player 0|Opponent TBA|Date TBA|Sponsor opportunity|google\.com|\.mp4|Pasadena|Niky's/i,
    );
  });

  it("reconciles all retained, hidden, and linked roles", async () => {
    const result = await plan();
    expect(reconcileDiverseCityLocalImportPlan(result)).toEqual({
      tenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
      assetCount: 10,
      mediaAssetCount: 10,
      programCount: 4,
      tryoutCount: 0,
      playerCount: 0,
      staffCount: 0,
      matchCount: 0,
      standingsCount: 0,
      sponsorLogoCount: 2,
      shopKitPhotoCount: 4,
      shopCarouselPhotoCount: 2,
      presentationDocumentCount: 1,
      sourceChecksumCount: 10,
      relationshipCount: 15,
      forbiddenReferenceCount: 0,
      hostedMutations: 0,
    });
  });

  it("fails closed for a hosted, mismatched, or incomplete plan", async () => {
    const sourceAssets = await inputs();
    await expect(
      buildDiverseCityImportPlan({
        sourceCommit: "5bbdfa33d59163b218bbd33745f9cfd4a66d379f",
        destinationEnvironment: "staging",
        destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
        confirmedDestinationEnvironment: "staging",
        dryRun: true,
        assets: sourceAssets,
      }),
    ).rejects.toThrow(/loopback local planning only/i);

    await expect(
      buildDiverseCityImportPlan({
        sourceCommit: "0000000000000000000000000000000000000000",
        destinationEnvironment: "local",
        destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
        confirmedDestinationEnvironment: "local",
        dryRun: true,
        assets: sourceAssets,
      }),
    ).rejects.toThrow(/approved source commit/i);

    await expect(
      buildDiverseCityImportPlan({
        sourceCommit: "5bbdfa33d59163b218bbd33745f9cfd4a66d379f",
        destinationEnvironment: "local",
        destinationTenantId: DIVERSE_CITY_LOCAL_TENANT_ID,
        confirmedDestinationEnvironment: "local",
        dryRun: true,
        assets: sourceAssets.slice(1),
      }),
    ).rejects.toThrow(/missing diverse city assets/i);
  });
});
