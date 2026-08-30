import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  buildLionsMediaImportPlan,
  LIONS_SOURCE_BUCKET,
  LIONS_SOURCE_PREFIX,
  LIONS_SOURCE_PROJECT_REF,
  type LionsKnownAssetName,
  type LionsSourceAssetInput,
} from "@/lib/migration/lions-media-plan";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

const ASSET_NAMES: LionsKnownAssetName[] = [
  "crest.png",
  "crest-white.png",
  "491417483_17927675355024475_5496002634953332765_n.jpg",
  "491499458_17927675328024475_7356353145949999522_n.jpg",
  "490753204_17927675316024475_6690706346505779685_n.jpg",
  "491452867_17927675298024475_4413570856070124753_n.jpg",
  "491413366_17927675394024475_4053105668658067411_n.jpg",
  "blue-jersey-transparent.png",
  "red-jersey-transparent.png",
  "white-jersey-transparent.png",
];

async function png(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 12,
      channels: 4,
      background: { r: 27, g: 41, b: 88, alpha: 0.75 },
    },
  })
    .png()
    .toBuffer();
}

async function jpg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 18,
      height: 24,
      channels: 3,
      background: { r: 173, g: 50, b: 52 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function assets(): Promise<LionsSourceAssetInput[]> {
  const graphic = await png();
  const photo = await jpg();
  return ASSET_NAMES.map((name) => ({
    name,
    bytes: name.endsWith(".jpg") ? photo : graphic,
  }));
}

async function plan() {
  return buildLionsMediaImportPlan({
    sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
    sourceBucket: LIONS_SOURCE_BUCKET,
    sourcePrefix: LIONS_SOURCE_PREFIX,
    destinationEnvironment: "staging",
    destinationTenantId: TENANT_ID,
    dryRun: true,
    confirmedDestinationEnvironment: "staging",
    generatedAt: "2026-07-29T00:00:00.000Z",
    assets: await assets(),
  });
}

describe("LionsFC media import dry-run plan", () => {
  it("inventories the supplied assets without planning hosted mutations", async () => {
    const result = await plan();

    expect(result).toMatchObject({
      kind: "lions-fc-media-import-dry-run-plan",
      dryRunOnly: true,
      source: {
        projectRef: "ydvggllbrswfchgjhjhr",
        bucket: "assets",
        prefix: "onzioMockupsAssets",
        readOnly: true,
      },
      destination: {
        environment: "staging",
        tenantId: TENANT_ID,
        bucket: "onzio-media",
        hostedMutations: 0,
      },
      safeguards: {
        requiresExplicitSource: true,
        requiresExplicitDestination: true,
        requiresDryRun: true,
        rejectsSupabaseImageTransformations: true,
        rejectsCustomSupabaseImageLoader: true,
        usesUuidVersionedPaths: true,
        exposesSecrets: false,
      },
      summary: {
        suppliedAssetCount: 10,
        plannedMediaAssetCount: 10,
        readyContentLinkCount: 13,
        blockedContentLinkCount: 0,
        checksumMismatches: 0,
        hostedMutations: 0,
      },
    });
    expect(result.planDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain("/storage/v1/render/image/");
    expect(JSON.stringify(result)).not.toContain("supabase-image-loader");
  });

  it("uses deterministic tenant-scoped paths and records content schema gaps", async () => {
    const first = await plan();
    const second = await buildLionsMediaImportPlan({
      sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
      sourceBucket: LIONS_SOURCE_BUCKET,
      sourcePrefix: LIONS_SOURCE_PREFIX,
      destinationEnvironment: "staging",
      destinationTenantId: TENANT_ID,
      dryRun: true,
      confirmedDestinationEnvironment: "staging",
      generatedAt: "2026-07-29T00:01:00.000Z",
      assets: await assets(),
    });

    expect(second.planDigest).toBe(first.planDigest);
    expect(second.assets).toEqual(first.assets);
    expect(first.assets.every((asset) => asset.destinationPath.startsWith(`${TENANT_ID}/`))).toBe(true);
    expect(first.assets.every((asset) => asset.destinationBucket === "onzio-media")).toBe(true);
    expect(first.assets.find((asset) => asset.sourcePath.endsWith("crest.png"))?.contentLinks).toEqual([
      expect.objectContaining({
        status: "ready",
        table: "site_branding",
        fields: expect.objectContaining({
          club_logo_asset_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    ]);
    expect(
      first.assets.find((asset) => asset.sourcePath.endsWith("crest-white.png"))
        ?.contentLinks,
    ).toEqual([
      expect.objectContaining({
        status: "ready",
        table: "site_branding",
        fields: expect.objectContaining({
          inverse_logo_asset_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        }),
      }),
    ]);
    expect(
      first.assets.find((asset) =>
        asset.sourcePath.endsWith("red-jersey-transparent.png"),
      )?.contentLinks,
    ).toEqual([
      expect.objectContaining({
        status: "ready",
        table: "shop_kit_photos",
        fields: expect.objectContaining({ kit_variant: "third" }),
      }),
      expect.objectContaining({
        status: "ready",
        table: "shop_carousel_photos",
        fields: expect.objectContaining({ kit_variant: "third" }),
      }),
    ]);
    expect(
      first.assets.find((asset) =>
        asset.sourcePath.endsWith("white-jersey-transparent.png"),
      )?.contentLinks,
    ).toEqual([
      expect.objectContaining({
        status: "ready",
        table: "shop_kit_photos",
        fields: expect.objectContaining({ kit_variant: "away" }),
      }),
      expect.objectContaining({
        status: "ready",
        table: "shop_carousel_photos",
        fields: expect.objectContaining({ kit_variant: "away" }),
      }),
    ]);
  });

  it("fails closed without explicit source, dry-run mode, and destination confirmation", async () => {
    const sourceAssets = await assets();
    await expect(
      buildLionsMediaImportPlan({
        sourceProjectRef: "ioalthwsdrlzrubomrow",
        sourceBucket: LIONS_SOURCE_BUCKET,
        sourcePrefix: LIONS_SOURCE_PREFIX,
        destinationEnvironment: "staging",
        destinationTenantId: TENANT_ID,
        dryRun: true,
        confirmedDestinationEnvironment: "staging",
        assets: sourceAssets,
      }),
    ).rejects.toThrow(/Unexpected Lions source/);

    await expect(
      buildLionsMediaImportPlan({
        sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
        sourceBucket: LIONS_SOURCE_BUCKET,
        sourcePrefix: LIONS_SOURCE_PREFIX,
        destinationEnvironment: "staging",
        destinationTenantId: TENANT_ID,
        dryRun: false,
        confirmedDestinationEnvironment: "staging",
        assets: sourceAssets,
      }),
    ).rejects.toThrow(/dry-run mode only/);

    await expect(
      buildLionsMediaImportPlan({
        sourceProjectRef: LIONS_SOURCE_PROJECT_REF,
        sourceBucket: LIONS_SOURCE_BUCKET,
        sourcePrefix: LIONS_SOURCE_PREFIX,
        destinationEnvironment: "production",
        destinationTenantId: TENANT_ID,
        dryRun: true,
        confirmedDestinationEnvironment: "staging",
        assets: sourceAssets,
      }),
    ).rejects.toThrow(/confirmation does not match/);
  });
});
