import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import sharp from "sharp";
import { ContractError } from "@/lib/contract-error";
import {
  cleanupAbandonedStagingMedia,
  publishAuthorizedMedia,
  retirePublishedMedia,
  type MediaAuthorization,
} from "@/lib/media-processing";
import { validateMediaUpload } from "@/lib/media-validation";
import { buildStoragePath } from "@/lib/storage-path";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_CONFIRMATION = `phase-7-media:${EXPECTED_PROJECT_REF}`;
const ALPHA_OWNER_EMAIL = "onzio.phase7.alpha.owner@example.com";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingTarget() {
  if (required("ONZIO_PHASE7_CONFIRM") !== EXPECTED_CONFIRMATION) {
    throw new Error(`ONZIO_PHASE7_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
}

function transparentGraphic(width = 8, height = 8): Buffer {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 20;
    image.data[offset + 1] = 90;
    image.data[offset + 2] = 200;
    image.data[offset + 3] = offset === 0 ? 0 : 255;
  }
  return PNG.sync.write(image);
}

async function photograph(): Promise<Buffer> {
  return sharp({
    create: {
      width: 24,
      height: 16,
      channels: 3,
      background: { r: 20, g: 90, b: 200 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function authorization(input: {
  clubId: string;
  actorId: string;
  surface: "branding" | "homepage";
  kind: "graphic" | "photo";
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  bytes: Buffer;
}): MediaAuthorization {
  const uploadId = randomUUID();
  const extension = input.mimeType === "image/png" ? "png" : "jpg";
  return {
    version: 1,
    uploadId,
    clubId: input.clubId,
    actorId: input.actorId,
    surface: input.surface,
    kind: input.kind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    claimedSize: input.bytes.length,
    stagingPath: buildStoragePath({
      clubId: input.clubId,
      surface: input.surface,
      assetId: uploadId,
      extension,
    }),
    expiresAt: Date.now() + 5 * 60_000,
  };
}

async function expectContractCode(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof ContractError && error.code === code) return;
    throw error;
  }
  throw new Error(`Expected ${code}`);
}

async function main() {
  assertStagingTarget();
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: alpha, error: alphaError } = await onzio
    .from("clubs")
    .select("id")
    .eq("slug", "alpha")
    .single();
  if (alphaError) throw alphaError;
  const { data: bravo, error: bravoError } = await onzio
    .from("clubs")
    .select("id")
    .eq("slug", "bravo")
    .single();
  if (bravoError) throw bravoError;
  const { data: users, error: usersError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) throw usersError;
  const actor = users.users.find(
    (user) => user.email?.toLowerCase() === ALPHA_OWNER_EMAIL,
  );
  if (!actor) throw new Error("Synthetic Alpha owner was not found");

  const stagedPaths = new Set<string>();
  const publishedPaths = new Set<string>();
  try {
    const graphicBytes = transparentGraphic();
    const photoBytes = await photograph();
    const valid = [
      authorization({
        clubId: alpha.id,
        actorId: actor.id,
        surface: "branding",
        kind: "graphic",
        fileName: "phase7-crest.png",
        mimeType: "image/png",
        bytes: graphicBytes,
      }),
      authorization({
        clubId: alpha.id,
        actorId: actor.id,
        surface: "homepage",
        kind: "photo",
        fileName: "phase7-photo.jpg",
        mimeType: "image/jpeg",
        bytes: photoBytes,
      }),
    ] as const;

    for (const [index, entry] of valid.entries()) {
      const bytes = index === 0 ? graphicBytes : photoBytes;
      const staged = await service.storage
        .from("onzio-upload-staging")
        .upload(entry.stagingPath, bytes, {
          contentType: entry.mimeType,
          upsert: false,
        });
      if (staged.error) throw staged.error;
      stagedPaths.add(entry.stagingPath);

      const first = await publishAuthorizedMedia(entry);
      const retry = await publishAuthorizedMedia(entry);
      if (!retry.idempotent || retry.assetId !== first.assetId) {
        throw new Error("Hosted media retry was not idempotent");
      }
      if (
        (entry.kind === "photo" && first.format !== "webp") ||
        (entry.kind === "graphic" &&
          first.format !== "png" &&
          first.format !== "webp")
      ) {
        throw new Error(`Unexpected normalized ${entry.kind} format`);
      }
      publishedPaths.add(first.storagePath);
      const retired = await retirePublishedMedia({
        clubId: alpha.id,
        actorId: actor.id,
        assetId: first.assetId,
      });
      if (retired.status !== "retired") {
        throw new Error("Published media was not retired");
      }
      publishedPaths.delete(first.storagePath);
    }

    const spoofedBytes = Buffer.from("MZ\\x90\\x00phase7-executable");
    const spoofed = authorization({
      clubId: alpha.id,
      actorId: actor.id,
      surface: "homepage",
      kind: "photo",
      fileName: "phase7-spoof.jpg",
      mimeType: "image/jpeg",
      bytes: spoofedBytes,
    });
    const spoofedUpload = await service.storage
      .from("onzio-upload-staging")
      .upload(spoofed.stagingPath, spoofedBytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (spoofedUpload.error) throw spoofedUpload.error;
    stagedPaths.add(spoofed.stagingPath);
    await expectContractCode(
      () => publishAuthorizedMedia(spoofed),
      "SIGNATURE_MISMATCH",
    );

    const corruptBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    const corrupt = authorization({
      clubId: alpha.id,
      actorId: actor.id,
      surface: "branding",
      kind: "graphic",
      fileName: "phase7-corrupt.png",
      mimeType: "image/png",
      bytes: corruptBytes,
    });
    const corruptUpload = await service.storage
      .from("onzio-upload-staging")
      .upload(corrupt.stagingPath, corruptBytes, {
        contentType: "image/png",
        upsert: false,
      });
    if (corruptUpload.error) throw corruptUpload.error;
    stagedPaths.add(corrupt.stagingPath);
    await expectContractCode(
      () => publishAuthorizedMedia(corrupt),
      "CORRUPT_IMAGE",
    );

    await expectContractCode(
      () =>
        validateMediaUpload({
          bytes: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>',
          ),
          metadata: {
            fileName: "phase7.svg",
            mimeType: "image/svg+xml",
            size: 62,
            kind: "graphic",
          },
        }),
      "UNSUPPORTED_MEDIA_TYPE",
    );
    await expectContractCode(
      () =>
        validateMediaUpload({
          bytes: graphicBytes,
          metadata: {
            fileName: "phase7-oversized.png",
            mimeType: "image/png",
            size: 5 * 1024 * 1024 + 1,
            kind: "graphic",
          },
        }),
      "FILE_TOO_LARGE",
    );
    const oversizedDimensions = transparentGraphic(3001, 1);
    await expectContractCode(
      () =>
        validateMediaUpload({
          bytes: oversizedDimensions,
          metadata: {
            fileName: "phase7-wide.png",
            mimeType: "image/png",
            size: oversizedDimensions.length,
            kind: "graphic",
          },
        }),
      "DIMENSIONS_TOO_LARGE",
    );

    const crossClub = {
      ...valid[0],
      clubId: bravo.id,
    };
    await expectContractCode(
      () => publishAuthorizedMedia(crossClub),
      "CROSS_CLUB_MEDIA",
    );

    const cleanupClubId = randomUUID();
    const abandonedPath = buildStoragePath({
      clubId: cleanupClubId,
      surface: "homepage",
      assetId: randomUUID(),
      extension: "jpg",
    });
    const abandonedUpload = await service.storage
      .from("onzio-upload-staging")
      .upload(abandonedPath, photoBytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (abandonedUpload.error) throw abandonedUpload.error;
    stagedPaths.add(abandonedPath);
    const abandonedCleanup = await cleanupAbandonedStagingMedia({
      olderThan: new Date(Date.now() + 60_000),
      clubId: cleanupClubId,
    });
    if (abandonedCleanup.removed < 1 || abandonedCleanup.failed !== 0) {
      throw new Error("Abandoned hosted staging media was not cleaned up");
    }
    const abandonedDownload = await service.storage
      .from("onzio-upload-staging")
      .download(abandonedPath);
    if (!abandonedDownload.error) {
      throw new Error("Abandoned hosted staging object still exists");
    }

    console.log(
      JSON.stringify({
        event: "phase7.hosted_media_verified",
        projectRef: EXPECTED_PROJECT_REF,
        photoNormalized: true,
        transparentGraphicNormalized: true,
        retryIdempotent: true,
        retirementCleanup: true,
        abandonedStagingCleanup: true,
        spoofedRejected: true,
        svgRejected: true,
        corruptRejected: true,
        oversizedRejected: true,
        crossClubRejected: true,
      }),
    );
  } finally {
    if (stagedPaths.size > 0) {
      await service.storage
        .from("onzio-upload-staging")
        .remove([...stagedPaths]);
    }
    if (publishedPaths.size > 0) {
      await service.storage.from("onzio-media").remove([...publishedPaths]);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
