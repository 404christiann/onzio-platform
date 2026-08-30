import { createHash } from "node:crypto";
import { normalizeGraphic, normalizePhoto } from "@/lib/media-processing";
import { validateMediaUpload, type MediaKind } from "@/lib/media-validation";
import { buildStoragePath, isUuid, type MediaSurface } from "@/lib/storage-path";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";

export const LIONS_SOURCE_PROJECT_REF = "ydvggllbrswfchgjhjhr";
export const LIONS_SOURCE_BUCKET = "assets";
export const LIONS_SOURCE_PREFIX = "onzioMockupsAssets";

export type LionsDestinationEnvironment = "local" | "staging" | "production";

export type LionsKnownAssetName =
  | "crest.png"
  | "crest-white.png"
  | "491417483_17927675355024475_5496002634953332765_n.jpg"
  | "491499458_17927675328024475_7356353145949999522_n.jpg"
  | "490753204_17927675316024475_6690706346505779685_n.jpg"
  | "491452867_17927675298024475_4413570856070124753_n.jpg"
  | "491413366_17927675394024475_4053105668658067411_n.jpg"
  | "blue-jersey-transparent.png"
  | "red-jersey-transparent.png"
  | "white-jersey-transparent.png";

export type LionsSourceAssetInput = {
  name: LionsKnownAssetName;
  bytes: Buffer;
};

export type LionsPlannedContentLink =
  | {
      status: "ready";
      table: "site_branding";
      operation: "upsert";
      fields: {
        club_logo_path?: string;
        club_logo_asset_id?: string;
        inverse_logo_path?: string;
        inverse_logo_asset_id?: string;
      };
    }
  | {
      status: "ready";
      table: "homepage_slideshow_photos";
      operation: "insert";
      fields: {
        url: string;
        media_asset_id: string;
        alt: string;
        sort_order: number;
      };
    }
  | {
      status: "ready";
      table: "shop_kit_photos";
      operation: "insert";
      fields: {
        surface: "home" | "shop";
        kit_variant: "home" | "third" | "away";
        url: string;
        media_asset_id: string;
        sort_order: number;
      };
    }
  | {
      status: "ready";
      table: "shop_carousel_photos";
      operation: "insert";
      fields: {
        kit_variant: "home" | "third" | "away";
        url: string;
        media_asset_id: string;
        sort_order: number;
      };
    }
  | {
      status: "blocked";
      reason: "no supported secondary branding asset field exists";
      requiredDecision: string;
    };

export type LionsPlannedMediaAsset = {
  assetId: string;
  sourceProjectRef: string;
  sourceBucket: string;
  sourcePrefix: string;
  sourcePath: string;
  sourcePublicUrl: string;
  sourceByteSize: number;
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceWidth: number;
  sourceHeight: number;
  sourceHasAlpha: boolean;
  sourceChecksumSha256: string;
  destinationEnvironment: LionsDestinationEnvironment;
  destinationClubId: string;
  destinationBucket: "onzio-media";
  destinationPath: string;
  surface: MediaSurface;
  mediaKind: "photograph" | "graphic";
  normalizedMimeType: "image/webp" | "image/png";
  normalizedByteSize: number;
  normalizedWidth: number;
  normalizedHeight: number;
  normalizedChecksumSha256: string;
  dryRunOnly: true;
  plannedActions: readonly [
    "download-source-object",
    "validate-signature-and-dimensions",
    "normalize-image",
    "upload-normalized-object",
    "insert-media-asset",
  ];
  contentLinks: LionsPlannedContentLink[];
};

export type LionsMediaImportPlan = {
  formatVersion: 1;
  kind: "lions-fc-media-import-dry-run-plan";
  dryRunOnly: true;
  generatedAt: string;
  source: {
    projectRef: string;
    bucket: string;
    prefix: string;
    publicOrigin: string;
    readOnly: true;
  };
  destination: {
    environment: LionsDestinationEnvironment;
    tenantId: string;
    bucket: "onzio-media";
    hostedMutations: 0;
  };
  safeguards: {
    requiresExplicitSource: true;
    requiresExplicitDestination: true;
    requiresDryRun: true;
    rejectsSupabaseImageTransformations: true;
    rejectsCustomSupabaseImageLoader: true;
    rejectsSvgAndExecutableInput: true;
    usesUuidVersionedPaths: true;
    exposesSecrets: false;
  };
  assets: LionsPlannedMediaAsset[];
  summary: {
    suppliedAssetCount: number;
    plannedMediaAssetCount: number;
    readyContentLinkCount: number;
    blockedContentLinkCount: number;
    sourceByteTotal: number;
    normalizedByteTotal: number;
    checksumMismatches: 0;
    hostedMutations: 0;
  };
  gaps: string[];
  idempotency: {
    assetIdSeed: string;
    conflictStrategy: "existing matching media_assets row is reused; mismatched existing row fails closed";
    retrySafeBecause: string[];
  };
  planDigest: string;
};

type AssetRole = {
  surface: MediaSurface;
  kind: MediaKind;
  mediaKind: "photograph" | "graphic";
  links: (asset: {
    assetId: string;
    destinationPath: string;
  }) => LionsPlannedContentLink[];
};

const ASSET_ROLES: Record<LionsKnownAssetName, AssetRole> = {
  "crest.png": {
    surface: "branding",
    kind: "graphic",
    mediaKind: "graphic",
    links: (asset) => [
      {
        status: "ready",
        table: "site_branding",
        operation: "upsert",
        fields: {
          club_logo_path: asset.destinationPath,
          club_logo_asset_id: asset.assetId,
        },
      },
    ],
  },
  "crest-white.png": {
    surface: "branding",
    kind: "graphic",
    mediaKind: "graphic",
    links: (asset) => [
      {
        status: "ready",
        table: "site_branding",
        operation: "upsert",
        fields: {
          inverse_logo_path: asset.destinationPath,
          inverse_logo_asset_id: asset.assetId,
        },
      },
    ],
  },
  "491417483_17927675355024475_5496002634953332765_n.jpg": homepagePhoto(
    0,
    "Lions Football Club captain wearing the navy first-team kit",
  ),
  "491499458_17927675328024475_7356353145949999522_n.jpg": homepagePhoto(
    1,
    "Lions Football Club player portrait in navy kit",
  ),
  "490753204_17927675316024475_6690706346505779685_n.jpg": homepagePhoto(
    2,
    "Lions Football Club player portrait on match day",
  ),
  "491452867_17927675298024475_4413570856070124753_n.jpg": homepagePhoto(
    3,
    "Lions Football Club player portrait in red-accented kit",
  ),
  "491413366_17927675394024475_4053105668658067411_n.jpg": homepagePhoto(
    4,
    "Lions Football Club player portrait in first-team kit",
  ),
  "blue-jersey-transparent.png": kitGraphic("home", 0),
  "red-jersey-transparent.png": kitGraphic("third", 1),
  "white-jersey-transparent.png": kitGraphic("away", 2),
};

function homepagePhoto(sortOrder: number, alt: string): AssetRole {
  return {
    surface: "homepage",
    kind: "photo",
    mediaKind: "photograph",
    links: (asset) => [
      {
        status: "ready",
        table: "homepage_slideshow_photos",
        operation: "insert",
        fields: {
          url: asset.destinationPath,
          media_asset_id: asset.assetId,
          alt,
          sort_order: sortOrder,
        },
      },
    ],
  };
}

function kitGraphic(
  kitVariant: "home" | "third" | "away",
  sortOrder: number,
): AssetRole {
  return {
    surface: "shop",
    kind: "graphic",
    mediaKind: "graphic",
    links: (asset) => [
      {
        status: "ready",
        table: "shop_kit_photos",
        operation: "insert",
        fields: {
          surface: "shop",
          kit_variant: kitVariant,
          url: asset.destinationPath,
          media_asset_id: asset.assetId,
          sort_order: 0,
        },
      },
      {
        status: "ready",
        table: "shop_carousel_photos",
        operation: "insert",
        fields: {
          kit_variant: kitVariant,
          url: asset.destinationPath,
          media_asset_id: asset.assetId,
          sort_order: sortOrder,
        },
      },
    ],
  };
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function publicSourceUrl(projectRef: string, bucket: string, path: string): string {
  return `https://${projectRef}.supabase.co/storage/v1/object/public/${bucket}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function assertExplicitOptions(input: {
  sourceProjectRef: string;
  sourceBucket: string;
  sourcePrefix: string;
  destinationEnvironment: LionsDestinationEnvironment;
  destinationTenantId: string;
  dryRun: boolean;
  confirmedDestinationEnvironment: string;
}) {
  if (
    input.sourceProjectRef !== LIONS_SOURCE_PROJECT_REF ||
    input.sourceBucket !== LIONS_SOURCE_BUCKET ||
    input.sourcePrefix !== LIONS_SOURCE_PREFIX
  ) {
    throw new Error("Unexpected Lions source. Refusing to plan against an implicit or unknown Storage prefix.");
  }
  if (!input.dryRun) {
    throw new Error("Lions media import planning currently supports dry-run mode only.");
  }
  if (input.confirmedDestinationEnvironment !== input.destinationEnvironment) {
    throw new Error("Destination environment confirmation does not match.");
  }
  if (!isUuid(input.destinationTenantId)) {
    throw new Error("Destination Lions tenant ID must be an explicit UUID.");
  }
}

export async function buildLionsMediaImportPlan(input: {
  sourceProjectRef: string;
  sourceBucket: string;
  sourcePrefix: string;
  destinationEnvironment: LionsDestinationEnvironment;
  destinationTenantId: string;
  dryRun: boolean;
  confirmedDestinationEnvironment: string;
  generatedAt?: string;
  assets: LionsSourceAssetInput[];
}): Promise<LionsMediaImportPlan> {
  assertExplicitOptions(input);
  const seen = new Set<string>();
  const missing = new Set(Object.keys(ASSET_ROLES));
  const plannedAssets: LionsPlannedMediaAsset[] = [];

  for (const asset of input.assets) {
    if (!ASSET_ROLES[asset.name]) {
      throw new Error(`Unexpected Lions asset ${asset.name}.`);
    }
    if (seen.has(asset.name)) {
      throw new Error(`Duplicate Lions asset ${asset.name}.`);
    }
    seen.add(asset.name);
    missing.delete(asset.name);
    const role = ASSET_ROLES[asset.name];
    const sourcePath = `${input.sourcePrefix}/${asset.name}`;
    const sourceChecksumSha256 = sha256(asset.bytes);
    const validated = await validateMediaUpload({
      bytes: asset.bytes,
      metadata: {
        fileName: asset.name,
        mimeType: asset.name.endsWith(".jpg") ? "image/jpeg" : "image/png",
        size: asset.bytes.length,
        kind: role.kind,
      },
    });
    const normalized =
      role.kind === "photo"
        ? await normalizePhoto(asset.bytes)
        : await normalizeGraphic(asset.bytes);
    const assetId = deterministicUuid(
      [
        "onzio:lions-fc-media",
        input.destinationEnvironment,
        input.destinationTenantId.toLowerCase(),
        input.sourceProjectRef,
        input.sourceBucket,
        sourcePath,
        sourceChecksumSha256,
      ].join(":"),
    );
    const destinationPath = buildStoragePath({
      clubId: input.destinationTenantId,
      surface: role.surface,
      assetId,
      extension: normalized.format,
    });
    plannedAssets.push({
      assetId,
      sourceProjectRef: input.sourceProjectRef,
      sourceBucket: input.sourceBucket,
      sourcePrefix: input.sourcePrefix,
      sourcePath,
      sourcePublicUrl: publicSourceUrl(
        input.sourceProjectRef,
        input.sourceBucket,
        sourcePath,
      ),
      sourceByteSize: asset.bytes.length,
      sourceMimeType: validated.mimeType,
      sourceWidth: validated.width,
      sourceHeight: validated.height,
      sourceHasAlpha: validated.hasAlpha,
      sourceChecksumSha256,
      destinationEnvironment: input.destinationEnvironment,
      destinationClubId: input.destinationTenantId.toLowerCase(),
      destinationBucket: "onzio-media",
      destinationPath,
      surface: role.surface,
      mediaKind: role.mediaKind,
      normalizedMimeType: normalized.mimeType,
      normalizedByteSize: normalized.bytes.length,
      normalizedWidth: normalized.width,
      normalizedHeight: normalized.height,
      normalizedChecksumSha256: normalized.checksumSha256,
      dryRunOnly: true,
      plannedActions: [
        "download-source-object",
        "validate-signature-and-dimensions",
        "normalize-image",
        "upload-normalized-object",
        "insert-media-asset",
      ],
      contentLinks: role.links({ assetId, destinationPath }),
    });
  }

  if (missing.size > 0) {
    throw new Error(`Missing Lions assets: ${[...missing].sort().join(", ")}`);
  }

  plannedAssets.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );
  const blockedContentLinkCount = plannedAssets.reduce(
    (total, asset) =>
      total + asset.contentLinks.filter((link) => link.status === "blocked").length,
    0,
  );
  const readyContentLinkCount = plannedAssets.reduce(
    (total, asset) =>
      total + asset.contentLinks.filter((link) => link.status === "ready").length,
    0,
  );
  const base = {
    formatVersion: 1 as const,
    kind: "lions-fc-media-import-dry-run-plan" as const,
    dryRunOnly: true as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: {
      projectRef: input.sourceProjectRef,
      bucket: input.sourceBucket,
      prefix: input.sourcePrefix,
      publicOrigin: `https://${input.sourceProjectRef}.supabase.co`,
      readOnly: true as const,
    },
    destination: {
      environment: input.destinationEnvironment,
      tenantId: input.destinationTenantId.toLowerCase(),
      bucket: "onzio-media" as const,
      hostedMutations: 0 as const,
    },
    safeguards: {
      requiresExplicitSource: true as const,
      requiresExplicitDestination: true as const,
      requiresDryRun: true as const,
      rejectsSupabaseImageTransformations: true as const,
      rejectsCustomSupabaseImageLoader: true as const,
      rejectsSvgAndExecutableInput: true as const,
      usesUuidVersionedPaths: true as const,
      exposesSecrets: false as const,
    },
    assets: plannedAssets,
    summary: {
      suppliedAssetCount: input.assets.length,
      plannedMediaAssetCount: plannedAssets.length,
      readyContentLinkCount,
      blockedContentLinkCount,
      sourceByteTotal: plannedAssets.reduce(
        (total, asset) => total + asset.sourceByteSize,
        0,
      ),
      normalizedByteTotal: plannedAssets.reduce(
        (total, asset) => total + asset.normalizedByteSize,
        0,
      ),
      checksumMismatches: 0 as const,
      hostedMutations: 0 as const,
    },
    gaps: [
      "publishAuthorizedMedia creates media_assets but does not link assets to content tables; importer needs an explicit transactional linking layer.",
    ],
    idempotency: {
      assetIdSeed:
        "destinationEnvironment + destinationTenantId + sourceProjectRef + sourceBucket + sourcePath + sourceChecksumSha256",
      conflictStrategy:
        "existing matching media_assets row is reused; mismatched existing row fails closed" as const,
      retrySafeBecause: [
        "source inspection is read-only",
        "published object paths include deterministic UUIDs and never overwrite in place",
        "each media_assets row is keyed by the planned asset UUID",
        "content links are planned separately from media publication",
      ],
    },
    planDigest: "",
  };

  return {
    ...base,
    planDigest: sha256(
      stableJson({ ...base, generatedAt: undefined, planDigest: undefined }),
    ),
  };
}
