import { describe, expect, it } from "vitest";
import { clubs, USER_IDS } from "../fixtures/entities";
import {
  corruptImage,
  mediaMetadata,
  mimeSpoofedExecutable,
  oversizedGraphic,
  oversizedPhoto,
  scriptedSvg,
  validJpeg,
  validTransparentPng,
  validWebp,
} from "../fixtures/media";
import { expectContractError, loadContract } from "../helpers/contract";

type BuildStoragePath = (input: {
  clubId: string;
  surface: string;
  assetId: string;
  extension: string;
}) => string;
type ParseStoragePath = (path: string) => Record<string, string>;
type ValidateMediaUpload = (input: {
  bytes: Buffer;
  metadata: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;
type NormalizePhoto = (
  bytes: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ bytes: Buffer; width: number; height: number; format: string; metadataStripped: boolean }>;
type NormalizeGraphic = (
  bytes: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ bytes: Buffer; format: string; hasAlpha: boolean; metadataStripped: boolean }>;
type GetImageDeliveryMode = (
  kind: string,
) => "unoptimized";
type NextImageDeliveryAttempt = (
  attempt: "raw" | "failed",
) => "raw" | "failed";
type AssertAllowedImageUrl = (url: string) => string;
type FinalizeMediaUpload = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

describe("versioned storage path contract", () => {
  it("builds a tenant/surface/UUID path", async () => {
    const buildStoragePath = await loadContract<BuildStoragePath>(
      "@/lib/storage-path",
      "buildStoragePath",
    );
    expect(
      buildStoragePath({
        clubId: clubs.alpha.id,
        surface: "roster",
        assetId: "44444444-4444-4444-8444-444444444444",
        extension: "webp",
      }),
    ).toBe(
      `${clubs.alpha.id}/roster/44444444-4444-4444-8444-444444444444.webp`,
    );
  });

  it("round-trips a valid path", async () => {
    const parseStoragePath = await loadContract<ParseStoragePath>(
      "@/lib/storage-path",
      "parseStoragePath",
    );
    expect(
      parseStoragePath(
        `${clubs.alpha.id}/branding/44444444-4444-4444-8444-444444444444.png`,
      ),
    ).toEqual({
      clubId: clubs.alpha.id,
      surface: "branding",
      assetId: "44444444-4444-4444-8444-444444444444",
      extension: "png",
    });
  });

  it.each([
    [`${clubs.bravo.id}/roster/not-a-uuid.webp`, "INVALID_ASSET_ID"],
    ["../alpha/roster/file.webp", "INVALID_STORAGE_PATH"],
    [`${clubs.alpha.id}/unknown/file.webp`, "INVALID_MEDIA_SURFACE"],
    [`${clubs.alpha.id}/roster/file.svg`, "UNSUPPORTED_MEDIA_TYPE"],
  ])("rejects unsafe path %s", async (path, code) => {
    const parseStoragePath = await loadContract<ParseStoragePath>(
      "@/lib/storage-path",
      "parseStoragePath",
    );
    await expectContractError(() => parseStoragePath(path), code);
  });
});

describe("media validation contract", () => {
  it.each([
    ["jpeg", validJpeg(), mediaMetadata.photo, "jpeg"],
    [
      "png",
      validTransparentPng(),
      { ...mediaMetadata.logo, mimeType: "image/png" },
      "png",
    ],
    [
      "webp",
      validWebp(),
      { ...mediaMetadata.photo, mimeType: "image/webp", fileName: "photo.webp" },
      "webp",
    ],
  ] as const)(
    "accepts a valid %s fixture",
    async (_label, bytes, metadata, format) => {
      const validateMediaUpload = await loadContract<ValidateMediaUpload>(
        "@/lib/media-validation",
        "validateMediaUpload",
      );
      await expect(
        validateMediaUpload({ bytes, metadata }),
      ).resolves.toMatchObject({ format, safe: true });
    },
  );

  it.each([
    [
      mimeSpoofedExecutable,
      { ...mediaMetadata.photo, mimeType: "image/jpeg" },
      "SIGNATURE_MISMATCH",
    ],
    [
      scriptedSvg,
      { ...mediaMetadata.logo, fileName: "crest.svg", mimeType: "image/svg+xml" },
      "UNSUPPORTED_MEDIA_TYPE",
    ],
    [corruptImage, mediaMetadata.logo, "CORRUPT_IMAGE"],
    [
      oversizedPhoto(),
      { ...mediaMetadata.photo, size: oversizedPhoto().length },
      "FILE_TOO_LARGE",
    ],
    [
      oversizedGraphic(),
      { ...mediaMetadata.logo, size: oversizedGraphic().length },
      "FILE_TOO_LARGE",
    ],
    [
      validTransparentPng(),
      mediaMetadata.decompressionBomb,
      "DIMENSIONS_TOO_LARGE",
    ],
  ] as const)("rejects unsafe media %#", async (bytes, metadata, code) => {
    const validateMediaUpload = await loadContract<ValidateMediaUpload>(
      "@/lib/media-validation",
      "validateMediaUpload",
    );
    await expectContractError(
      () => validateMediaUpload({ bytes, metadata }),
      code,
    );
  });
});

describe("media processing contract", () => {
  it.each([
    [{ width: 4000, height: 3000 }, { width: 2400, height: 1800 }],
    [{ width: 3000, height: 4000 }, { width: 1800, height: 2400 }],
    [{ width: 3000, height: 3000 }, { width: 2400, height: 2400 }],
    [{ width: 800, height: 600 }, { width: 800, height: 600 }],
  ])("normalizes dimensions without upscaling", async (source, expected) => {
    const normalizePhoto = await loadContract<NormalizePhoto>(
      "@/lib/media-processing",
      "normalizePhoto",
    );
    const result = await normalizePhoto(validJpeg(), source);
    expect(result).toMatchObject({
      ...expected,
      format: "webp",
      metadataStripped: true,
    });
  });

  it("preserves transparent graphic alpha", async () => {
    const normalizeGraphic = await loadContract<NormalizeGraphic>(
      "@/lib/media-processing",
      "normalizeGraphic",
    );
    await expect(
      normalizeGraphic(validTransparentPng()),
    ).resolves.toMatchObject({
      hasAlpha: true,
      metadataStripped: true,
    });
  });

  it("retains PNG when graphic conversion is larger", async () => {
    const normalizeGraphic = await loadContract<NormalizeGraphic>(
      "@/lib/media-processing",
      "normalizeGraphic",
    );
    await expect(
      normalizeGraphic(validTransparentPng(), {
        simulatedWebpSize: validTransparentPng().length + 100,
      }),
    ).resolves.toMatchObject({ format: "png" });
  });
});

describe("media finalization and delivery contract", () => {
  it.each([
    ["hero-photo", "unoptimized"],
    ["roster-photo", "unoptimized"],
    ["shop-photo", "unoptimized"],
    ["club-logo", "unoptimized"],
    ["flag", "unoptimized"],
    ["sponsor-logo", "unoptimized"],
    ["opponent-crest", "unoptimized"],
  ] as const)("uses %s delivery for %s", async (kind, expected) => {
    const getImageDeliveryMode = await loadContract<GetImageDeliveryMode>(
      "@/lib/image-delivery",
      "getImageDeliveryMode",
    );
    expect(getImageDeliveryMode(kind)).toBe(expected);
  });

  it("fails closed after the raw normalized origin fails", async () => {
    const nextImageDeliveryAttempt =
      await loadContract<NextImageDeliveryAttempt>(
        "@/lib/image-delivery",
        "nextImageDeliveryAttempt",
      );

    expect(nextImageDeliveryAttempt("raw")).toBe("failed");
    expect(nextImageDeliveryAttempt("failed")).toBe("failed");
  });

  it("rejects Supabase transformation URLs", async () => {
    const assertAllowedImageUrl = await loadContract<AssertAllowedImageUrl>(
      "@/lib/image-delivery",
      "assertAllowedImageUrl",
    );
    await expectContractError(
      () =>
        assertAllowedImageUrl(
          "https://project.supabase.co/storage/v1/render/image/public/onzio-media/file.webp",
        ),
      "SUPABASE_TRANSFORM_FORBIDDEN",
    );
  });

  it("finalizes idempotently after a retry", async () => {
    const finalizeMediaUpload = await loadContract<FinalizeMediaUpload>(
      "@/lib/media-processing",
      "finalizeMediaUpload",
    );
    const input = {
      uploadId: "55555555-5555-4555-8555-555555555555",
      clubId: clubs.alpha.id,
      actorId: USER_IDS.adminAal2,
      stagingObjectExists: true,
      publicObjectExists: true,
    };
    const first = await finalizeMediaUpload(input);
    const second = await finalizeMediaUpload(input);
    expect(second).toEqual(first);
    expect(second).toMatchObject({ status: "finalized" });
  });

  it("preserves the new reference when old-object cleanup fails", async () => {
    const finalizeMediaUpload = await loadContract<FinalizeMediaUpload>(
      "@/lib/media-processing",
      "finalizeMediaUpload",
    );
    await expect(
      finalizeMediaUpload({
        clubId: clubs.alpha.id,
        actorId: USER_IDS.adminAal2,
        replacement: true,
        simulateOldObjectDeleteFailure: true,
      }),
    ).resolves.toMatchObject({
      contentUpdated: true,
      cleanupQueued: true,
    });
  });

  it.each([
    [{ clubId: clubs.bravo.id }, "CROSS_CLUB_MEDIA"],
    [{ membership: null }, "MEMBERSHIP_REQUIRED"],
    [{ lifecycle: "archived" }, "CLUB_ARCHIVED"],
    [{ simulateDatabaseFailure: true }, "FINALIZATION_ROLLED_BACK"],
    [{ publicWriteBeforeValidation: true }, "UNVALIDATED_PUBLIC_WRITE"],
  ] as const)("rejects unsafe finalization %#", async (override, code) => {
    const finalizeMediaUpload = await loadContract<FinalizeMediaUpload>(
      "@/lib/media-processing",
      "finalizeMediaUpload",
    );
    await expectContractError(
      () =>
        finalizeMediaUpload({
          clubId: clubs.alpha.id,
          actorId: USER_IDS.adminAal2,
          membership: "active",
          tier: "pro",
          lifecycle: "active",
          ...override,
        }),
      code,
    );
  });
});
