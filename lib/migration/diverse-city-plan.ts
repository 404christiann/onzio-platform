import { createHash } from "node:crypto";
import { normalizeGraphic, normalizePhoto } from "@/lib/media-processing";
import { validateMediaUpload, type MediaKind } from "@/lib/media-validation";
import { deterministicUuid } from "@/lib/migration/rose-city-plan";
import { buildStoragePath, type MediaSurface } from "@/lib/storage-path";

export const DIVERSE_CITY_SOURCE_COMMIT =
  "5bbdfa33d59163b218bbd33745f9cfd4a66d379f";
export const DIVERSE_CITY_PLAN_GENERATED_AT = "2026-08-01T00:00:00.000Z";
export const DIVERSE_CITY_LOCAL_TENANT_ID = deterministicUuid(
  "onzio:diverse-city:local:tenant",
);

export type DiverseCityKnownAssetPath =
  | "media/about-team-lineup.webp"
  | "media/crest.png"
  | "media/hero.webp"
  | "media/programs/mens-teams-detail.webp"
  | "media/programs/mens-teams-hero.webp"
  | "media/programs/special-kickers-hero.webp"
  | "media/programs/special-olympics-hero.webp"
  | "media/shop/back_jersey.png"
  | "media/shop/front_jersey.png"
  | "media/sponsors/elsas-bakery.webp";

export type DiverseCitySourceAssetInput = {
  path: DiverseCityKnownAssetPath;
  bytes: Buffer;
};

export type DiverseCityPlannedAsset = {
  assetId: string;
  sourcePath: DiverseCityKnownAssetPath;
  sourceByteSize: number;
  sourceMimeType: "image/png" | "image/webp";
  sourceWidth: number;
  sourceHeight: number;
  sourceHasAlpha: boolean;
  sourceChecksumSha256: string;
  destinationBucket: "onzio-media";
  destinationPath: string;
  surface: MediaSurface;
  mediaKind: "photograph" | "graphic";
  normalizedMimeType: "image/webp" | "image/png";
  normalizedByteSize: number;
  normalizedWidth: number;
  normalizedHeight: number;
  normalizedChecksumSha256: string;
};

export type DiverseCityImportPlan = {
  formatVersion: 1;
  kind: "diverse-city-local-import-plan";
  dryRunOnly: true;
  generatedAt: string;
  approval: {
    approver: "Christian Alcala";
    approvedAt: "2026-08-01";
    decisions: ["DCFC-D102", "DCFC-D106", "DCFC-D114"];
    rightsAndCurrentFactsConfirmed: true;
  };
  source: {
    snapshotCommit: string;
    immutable: true;
    readOnly: true;
  };
  destination: {
    environment: "local";
    tenantId: string;
    bucket: "onzio-media";
    hostedMutations: 0;
  };
  safeguards: {
    loopbackOnly: true;
    rejectsHostedCredentials: true;
    rejectsSvgExecutableAndVideoInput: true;
    rejectsRuntimeImageTransformations: true;
    deterministicTenantScopedPaths: true;
    sourceDeletionAllowed: false;
  };
  assets: DiverseCityPlannedAsset[];
  content: {
    programs: 4;
    tryouts: 0;
    players: 0;
    staff: 0;
    matches: 0;
    standings: 0;
    sponsorOpportunityRows: 0;
    temporaryExternalUrls: 0;
    verticalStoryVisible: false;
  };
  summary: {
    retainedAssetCount: 10;
    excludedAssetCount: 32;
    sourceByteTotal: number;
    normalizedByteTotal: number;
    hostedMutations: 0;
  };
  planDigest: string;
};

type AssetRole = {
  surface: MediaSurface;
  kind: MediaKind;
  mediaKind: "photograph" | "graphic";
};

const ASSET_ROLES: Record<DiverseCityKnownAssetPath, AssetRole> = {
  "media/about-team-lineup.webp": {
    surface: "about",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/crest.png": {
    surface: "branding",
    kind: "graphic",
    mediaKind: "graphic",
  },
  "media/hero.webp": {
    surface: "programs",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/programs/mens-teams-detail.webp": {
    surface: "programs",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/programs/mens-teams-hero.webp": {
    surface: "programs",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/programs/special-kickers-hero.webp": {
    surface: "programs",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/programs/special-olympics-hero.webp": {
    surface: "programs",
    kind: "photo",
    mediaKind: "photograph",
  },
  "media/shop/back_jersey.png": {
    surface: "shop",
    kind: "graphic",
    mediaKind: "graphic",
  },
  "media/shop/front_jersey.png": {
    surface: "shop",
    kind: "graphic",
    mediaKind: "graphic",
  },
  "media/sponsors/elsas-bakery.webp": {
    surface: "branding",
    kind: "graphic",
    mediaKind: "graphic",
  },
};

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

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeInput(input: {
  sourceCommit: string;
  destinationEnvironment: string;
  destinationTenantId: string;
  confirmedDestinationEnvironment: string;
  dryRun: boolean;
}) {
  if (input.sourceCommit !== DIVERSE_CITY_SOURCE_COMMIT) {
    throw new Error("Diverse City planning requires the approved source commit.");
  }
  if (
    input.destinationEnvironment !== "local" ||
    input.confirmedDestinationEnvironment !== "local"
  ) {
    throw new Error("DCFC-403 permits loopback local planning only.");
  }
  if (input.destinationTenantId !== DIVERSE_CITY_LOCAL_TENANT_ID) {
    throw new Error("Diverse City local tenant ID does not match the locked plan.");
  }
  if (!input.dryRun) {
    throw new Error("Diverse City planning requires dry-run mode.");
  }
}

export async function buildDiverseCityImportPlan(input: {
  sourceCommit: string;
  destinationEnvironment: string;
  destinationTenantId: string;
  confirmedDestinationEnvironment: string;
  dryRun: boolean;
  generatedAt?: string;
  assets: DiverseCitySourceAssetInput[];
}): Promise<DiverseCityImportPlan> {
  assertSafeInput(input);
  const missing = new Set(Object.keys(ASSET_ROLES));
  const seen = new Set<string>();
  const assets: DiverseCityPlannedAsset[] = [];

  for (const source of input.assets) {
    const role = ASSET_ROLES[source.path];
    if (!role) throw new Error(`Unexpected Diverse City asset ${source.path}.`);
    if (seen.has(source.path)) {
      throw new Error(`Duplicate Diverse City asset ${source.path}.`);
    }
    seen.add(source.path);
    missing.delete(source.path);
    const sourceChecksumSha256 = sha256(source.bytes);
    const sourceMimeType = source.path.endsWith(".png")
      ? "image/png" as const
      : "image/webp" as const;
    const validated = await validateMediaUpload({
      bytes: source.bytes,
      metadata: {
        fileName: source.path.split("/").at(-1) ?? source.path,
        mimeType: sourceMimeType,
        size: source.bytes.length,
        kind: role.kind,
      },
    });
    const normalized = role.kind === "photo"
      ? await normalizePhoto(source.bytes)
      : await normalizeGraphic(source.bytes);
    const assetId = deterministicUuid(
      [
        "onzio:diverse-city:local-media",
        input.destinationTenantId,
        source.path,
        sourceChecksumSha256,
      ].join(":"),
    );
    assets.push({
      assetId,
      sourcePath: source.path,
      sourceByteSize: source.bytes.length,
      sourceMimeType: validated.mimeType as "image/png" | "image/webp",
      sourceWidth: validated.width,
      sourceHeight: validated.height,
      sourceHasAlpha: validated.hasAlpha,
      sourceChecksumSha256,
      destinationBucket: "onzio-media",
      destinationPath: buildStoragePath({
        clubId: input.destinationTenantId,
        surface: role.surface,
        assetId,
        extension: normalized.format,
      }),
      surface: role.surface,
      mediaKind: role.mediaKind,
      normalizedMimeType: normalized.mimeType,
      normalizedByteSize: normalized.bytes.length,
      normalizedWidth: normalized.width,
      normalizedHeight: normalized.height,
      normalizedChecksumSha256: normalized.checksumSha256,
    });
  }

  if (missing.size > 0) {
    throw new Error(`Missing Diverse City assets: ${[...missing].sort().join(", ")}`);
  }
  assets.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));

  const base = {
    formatVersion: 1 as const,
    kind: "diverse-city-local-import-plan" as const,
    dryRunOnly: true as const,
    generatedAt: input.generatedAt ?? DIVERSE_CITY_PLAN_GENERATED_AT,
    approval: {
      approver: "Christian Alcala" as const,
      approvedAt: "2026-08-01" as const,
      decisions: ["DCFC-D102", "DCFC-D106", "DCFC-D114"] as [
        "DCFC-D102",
        "DCFC-D106",
        "DCFC-D114",
      ],
      rightsAndCurrentFactsConfirmed: true as const,
    },
    source: {
      snapshotCommit: input.sourceCommit,
      immutable: true as const,
      readOnly: true as const,
    },
    destination: {
      environment: "local" as const,
      tenantId: input.destinationTenantId,
      bucket: "onzio-media" as const,
      hostedMutations: 0 as const,
    },
    safeguards: {
      loopbackOnly: true as const,
      rejectsHostedCredentials: true as const,
      rejectsSvgExecutableAndVideoInput: true as const,
      rejectsRuntimeImageTransformations: true as const,
      deterministicTenantScopedPaths: true as const,
      sourceDeletionAllowed: false as const,
    },
    assets,
    content: {
      programs: 4 as const,
      tryouts: 0 as const,
      players: 0 as const,
      staff: 0 as const,
      matches: 0 as const,
      standings: 0 as const,
      sponsorOpportunityRows: 0 as const,
      temporaryExternalUrls: 0 as const,
      verticalStoryVisible: false as const,
    },
    summary: {
      retainedAssetCount: 10 as const,
      excludedAssetCount: 32 as const,
      sourceByteTotal: assets.reduce((total, asset) => total + asset.sourceByteSize, 0),
      normalizedByteTotal: assets.reduce(
        (total, asset) => total + asset.normalizedByteSize,
        0,
      ),
      hostedMutations: 0 as const,
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
