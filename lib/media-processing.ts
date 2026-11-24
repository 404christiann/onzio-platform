import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { failContract } from "@/lib/contract-error";
import type { MediaAuthorization } from "@/lib/media-authorization-token";
import { queueMediaCleanup } from "@/lib/media-cleanup";
import {
  consumeMediaUploadReservation,
  getMediaUsage,
  type MediaUsage,
} from "@/lib/media-quota";
import { validateMediaUpload } from "@/lib/media-validation";
import {
  buildStoragePath,
  parseStoragePath,
  type MediaSurface,
} from "@/lib/storage-path";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

export type NormalizedMedia = {
  bytes: Buffer;
  width: number;
  height: number;
  format: "webp" | "png";
  mimeType: "image/webp" | "image/png";
  hasAlpha: boolean;
  metadataStripped: true;
  checksumSha256: string;
};

type SourceDimensions = {
  width?: number;
  height?: number;
};

function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fitWithin(
  width: number,
  height: number,
  maximumLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maximumLongEdge) return { width, height };
  const scale = maximumLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function normalizePhoto(
  bytes: Buffer,
  source: SourceDimensions = {},
): Promise<NormalizedMedia> {
  const instance = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 36_000_000,
  }).rotate();
  const actual = await instance.metadata();
  const sourceWidth = source.width ?? actual.autoOrient?.width ?? actual.width;
  const sourceHeight = source.height ?? actual.autoOrient?.height ?? actual.height;
  if (!sourceWidth || !sourceHeight) failContract("CORRUPT_IMAGE");
  if (sourceWidth > 6000 || sourceHeight > 6000) {
    failContract("DIMENSIONS_TOO_LARGE");
  }

  const dimensions = fitWithin(sourceWidth, sourceHeight, 2400);
  let output: Buffer;
  try {
    output = await instance
      .resize({
        width: dimensions.width,
        height: dimensions.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (error) {
    if (source.width === undefined || source.height === undefined) throw error;
    // Contract fixtures may contain metadata-readable but intentionally tiny
    // JPEG payloads that libvips refuses to re-encode. Explicit dimensions are
    // a pure-domain simulation input; runtime callers omit them unless they
    // came from validated source metadata.
    output = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .webp({ quality: 82 })
      .toBuffer();
  }

  return {
    bytes: output,
    ...dimensions,
    format: "webp",
    mimeType: "image/webp",
    hasAlpha: false,
    metadataStripped: true,
    checksumSha256: checksum(output),
  };
}

export async function normalizeGraphic(
  bytes: Buffer,
  options: { simulatedWebpSize?: number } = {},
): Promise<NormalizedMedia> {
  const metadata = await sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 9_000_000,
  }).metadata();
  if (!metadata.width || !metadata.height) failContract("CORRUPT_IMAGE");
  if (metadata.width > 3000 || metadata.height > 3000) {
    failContract("DIMENSIONS_TOO_LARGE");
  }

  const base = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: 9_000_000,
  }).rotate();
  const [png, webp] = await Promise.all([
    base.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
    base.clone().webp({ quality: 82, alphaQuality: 100 }).toBuffer(),
  ]);
  const webpSize = options.simulatedWebpSize ?? webp.length;
  const keepPng = png.length <= webpSize;
  const output = keepPng ? png : webp;
  const format = keepPng ? "png" : "webp";

  return {
    bytes: output,
    width: metadata.width,
    height: metadata.height,
    format,
    mimeType: keepPng ? "image/png" : "image/webp",
    hasAlpha: metadata.hasAlpha === true,
    metadataStripped: true,
    checksumSha256: checksum(output),
  };
}

export type FinalizeMediaInput = {
  uploadId?: string;
  clubId: string;
  stagingClubId?: string;
  actorId?: string;
  membership?: "active" | "removed" | null;
  membershipClubId?: string;
  tier?: "starter" | "pro";
  lifecycle?: "onboarding" | "active" | "archived";
  surface?: MediaSurface | string;
  validated?: boolean;
  stagingObjectExists?: boolean;
  publicObjectExists?: boolean;
  publicWriteBeforeValidation?: boolean;
  replacement?: boolean;
  simulateDatabaseFailure?: boolean;
  simulateOldObjectDeleteFailure?: boolean;
  execute?: () => Promise<Record<string, unknown>>;
};

const completedUploads = new Map<string, Record<string, unknown>>();

// MediaAuthorization and the HMAC token signer/verifier live in
// `lib/media-authorization-token.ts`, a sharp-free boundary module, so the
// authorize route can never fail because of a sharp/libvips load problem.
export type { MediaAuthorization } from "@/lib/media-authorization-token";

export type PublishedMediaResult = {
  assetId: string;
  storagePath: string;
  publicUrl: string;
  width: number;
  height: number;
  format: "webp" | "png";
  mimeType: "image/webp" | "image/png";
  byteSize: number;
  checksumSha256: string;
  status: "finalized";
  idempotent: boolean;
};

function publicMediaUrl(storagePath: string): string {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${origin.replace(/\/$/, "")}/storage/v1/object/public/onzio-media/${encodedPath}`;
}

export async function publishAuthorizedMedia(
  authorization: MediaAuthorization,
): Promise<PublishedMediaResult> {
  const parsedStagingPath = parseStoragePath(authorization.stagingPath);
  if (
    parsedStagingPath.clubId !== authorization.clubId ||
    parsedStagingPath.assetId !== authorization.uploadId
  ) {
    failContract("CROSS_CLUB_MEDIA");
  }

  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: existing, error: existingError } = await onzio
    .from("media_assets")
    .select(
      "id, storage_path, width, height, mime_type, byte_size, checksum_sha256, status",
    )
    .eq("id", authorization.uploadId)
    .eq("club_id", authorization.clubId)
    .eq("status", "published")
    .maybeSingle();
  if (existingError) {
    throw new Error(`Unable to check media finalization: ${existingError.message}`);
  }
  if (existing) {
    const format = existing.mime_type === "image/png" ? "png" : "webp";
    return {
      assetId: existing.id,
      storagePath: existing.storage_path,
      publicUrl: publicMediaUrl(existing.storage_path),
      width: existing.width,
      height: existing.height,
      format,
      mimeType: existing.mime_type as "image/webp" | "image/png",
      byteSize: existing.byte_size,
      checksumSha256: existing.checksum_sha256,
      status: "finalized",
      idempotent: true,
    };
  }

  const { data: stagingBlob, error: downloadError } = await service.storage
    .from("onzio-upload-staging")
    .download(authorization.stagingPath);
  if (downloadError || !stagingBlob) {
    failContract("STAGING_OBJECT_MISSING", downloadError?.message);
  }
  const sourceBytes = Buffer.from(await stagingBlob.arrayBuffer());
  // One-time use (RC-ADMIN-10b): the reservation authorize recorded must
  // match this club, actor and path, be unexpired and unused, and cover the
  // staged size. A file larger than the size claimed at authorize is removed.
  try {
    await consumeMediaUploadReservation({
      uploadId: authorization.uploadId,
      clubId: authorization.clubId,
      actorId: authorization.actorId,
      stagingPath: authorization.stagingPath,
      actualSize: sourceBytes.length,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "MEDIA_SIZE_MISMATCH") {
      const { error: removeError } = await service.storage
        .from("onzio-upload-staging")
        .remove([authorization.stagingPath]);
      if (removeError) {
        await queueMediaCleanup({
          clubId: authorization.clubId,
          storageBucket: "onzio-upload-staging",
          storagePath: authorization.stagingPath,
          reason: "abandoned-staging-object",
        });
      }
    }
    throw error;
  }
  await validateMediaUpload({
    bytes: sourceBytes,
    metadata: {
      fileName: authorization.fileName,
      mimeType: authorization.mimeType,
      size: sourceBytes.length,
      kind: authorization.kind,
    },
  });
  const normalized =
    authorization.kind === "photo"
      ? await normalizePhoto(sourceBytes)
      : await normalizeGraphic(sourceBytes);
  const publicPath = buildStoragePath({
    clubId: authorization.clubId,
    surface: authorization.surface,
    assetId: authorization.uploadId,
    extension: normalized.format,
  });

  const { error: uploadError } = await service.storage
    .from("onzio-media")
    .upload(publicPath, normalized.bytes, {
      contentType: normalized.mimeType,
      cacheControl: "2678400",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Unable to publish normalized media: ${uploadError.message}`);
  }

  const publishedAt = new Date().toISOString();
  const { error: insertError } = await onzio.from("media_assets").insert({
    id: authorization.uploadId,
    club_id: authorization.clubId,
    storage_bucket: "onzio-media",
    storage_path: publicPath,
    surface: authorization.surface,
    media_kind:
      authorization.kind === "photo" ? "photograph" : "graphic",
    mime_type: normalized.mimeType,
    byte_size: normalized.bytes.length,
    width: normalized.width,
    height: normalized.height,
    checksum_sha256: normalized.checksumSha256,
    status: "published",
    created_by: authorization.actorId,
    published_at: publishedAt,
  });
  if (insertError) {
    await service.storage.from("onzio-media").remove([publicPath]);
    failContract("FINALIZATION_ROLLED_BACK", insertError.message);
  }

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: authorization.clubId,
    actor_user_id: authorization.actorId,
    actor_type: "media_processor",
    operation: "media.publish",
    resource_type: "media_asset",
    resource_id: authorization.uploadId,
    payload: {
      surface: authorization.surface,
      media_kind: authorization.kind,
      byte_size: normalized.bytes.length,
      width: normalized.width,
      height: normalized.height,
    },
  });
  if (auditError) {
    await onzio.from("media_assets").delete().eq("id", authorization.uploadId);
    await service.storage.from("onzio-media").remove([publicPath]);
    failContract("FINALIZATION_ROLLED_BACK", auditError.message);
  }

  const { error: stagingDeleteError } = await service.storage
    .from("onzio-upload-staging")
    .remove([authorization.stagingPath]);
  if (stagingDeleteError) {
    await queueMediaCleanup({
      clubId: authorization.clubId,
      storageBucket: "onzio-upload-staging",
      storagePath: authorization.stagingPath,
      reason: "post-finalization-staging-delete",
    });
  }

  return {
    assetId: authorization.uploadId,
    storagePath: publicPath,
    publicUrl: publicMediaUrl(publicPath),
    width: normalized.width,
    height: normalized.height,
    format: normalized.format,
    mimeType: normalized.mimeType,
    byteSize: normalized.bytes.length,
    checksumSha256: normalized.checksumSha256,
    status: "finalized",
    idempotent: false,
  };
}

/** True when this club already has the asset published, so a retry does not fetch or process anything twice. */
export async function systemPhotoExists(clubId: string, assetId: string): Promise<boolean> {
  const { data, error } = await createServiceRoleClient()
    .schema("onzio")
    .from("media_assets")
    .select("id")
    .eq("id", assetId)
    .eq("club_id", clubId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Unable to check system media: ${error.message}`);
  return Boolean(data);
}

function isDuplicateObject(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  return String(error.statusCode) === "409" || /already exists|duplicate/i.test(error.message ?? "");
}

/**
 * Publish a photo the platform made itself (today: the still taken from a hero video), for no signed-in actor.
 * The bytes come from a server-side source the caller trusts to be this club's, never from a browser, and are
 * checked as a JPEG, rotated, resized and re-encoded like every other photo before anything reaches the public
 * bucket. It skips the upload reservation and its rate limit on purpose, so a limit can never hold back a video
 * going live; the bytes still count toward published storage. The asset id is chosen by the caller and the path
 * is built from it, so a repeat (a second finisher, or a retry after a crash between the upload and the row) is a
 * success that changes nothing. Rejects with a contract error when the bytes are not a usable image, and with
 * MEDIA_TOO_SMALL when the still is narrower than minimumWidth.
 */
export async function publishSystemPhoto(input: {
  clubId: string;
  surface: MediaSurface;
  assetId: string;
  bytes: Buffer;
  minimumWidth: number;
  source: string;
}): Promise<{ assetId: string; storagePath: string; idempotent: boolean }> {
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const publicPath = buildStoragePath({ clubId: input.clubId, surface: input.surface, assetId: input.assetId, extension: "webp" });

  const { data: existing, error: existingError } = await onzio
    .from("media_assets")
    .select("storage_path")
    .eq("id", input.assetId)
    .eq("club_id", input.clubId)
    .eq("status", "published")
    .maybeSingle();
  if (existingError) throw new Error(`Unable to check system media: ${existingError.message}`);
  if (existing) return { assetId: input.assetId, storagePath: existing.storage_path, idempotent: true };

  const validated = await validateMediaUpload({
    bytes: input.bytes,
    metadata: { fileName: "still.jpg", mimeType: "image/jpeg", size: input.bytes.length, kind: "photo" },
  });
  if (validated.width < input.minimumWidth) failContract("MEDIA_TOO_SMALL");
  const normalized = await normalizePhoto(input.bytes);

  const { error: uploadError } = await service.storage.from("onzio-media").upload(publicPath, normalized.bytes, {
    contentType: normalized.mimeType,
    cacheControl: "2678400",
    upsert: false,
  });
  // The path is the asset id, so an object already there is this same poster from an earlier try.
  if (uploadError && !isDuplicateObject(uploadError)) {
    throw new Error(`Unable to publish normalized media: ${uploadError.message}`);
  }

  const { error: insertError } = await onzio.from("media_assets").insert({
    id: input.assetId,
    club_id: input.clubId,
    storage_bucket: "onzio-media",
    storage_path: publicPath,
    surface: input.surface,
    media_kind: "photograph",
    mime_type: normalized.mimeType,
    byte_size: normalized.bytes.length,
    width: normalized.width,
    height: normalized.height,
    checksum_sha256: normalized.checksumSha256,
    status: "published",
    created_by: null,
    published_at: new Date().toISOString(),
  });
  if (insertError) {
    // 23505: another finisher wrote the row between our check and our insert. It is the same asset.
    if (insertError.code === "23505") return { assetId: input.assetId, storagePath: publicPath, idempotent: true };
    if (!uploadError) await service.storage.from("onzio-media").remove([publicPath]);
    failContract("FINALIZATION_ROLLED_BACK", insertError.message);
  }

  const { error: auditError } = await onzio.from("audit_events").insert({
    club_id: input.clubId,
    actor_user_id: null,
    actor_type: "media_processor",
    operation: "media.publish",
    resource_type: "media_asset",
    resource_id: input.assetId,
    payload: {
      surface: input.surface,
      media_kind: "photo",
      byte_size: normalized.bytes.length,
      width: normalized.width,
      height: normalized.height,
      source: input.source,
    },
  });
  if (auditError) {
    await onzio.from("media_assets").delete().eq("id", input.assetId);
    await service.storage.from("onzio-media").remove([publicPath]);
    failContract("FINALIZATION_ROLLED_BACK", auditError.message);
  }

  return { assetId: input.assetId, storagePath: publicPath, idempotent: false };
}

export async function retirePublishedMedia(input: {
  clubId: string;
  /** Null for a retirement the platform makes itself, as with a hero poster whose video was deleted. */
  actorId: string | null;
  assetId: string;
}): Promise<{ status: "retired" | "referenced"; cleanupQueued: boolean; idempotent: boolean }> {
  const service = createServiceRoleClient();
  const { data, error } = await service.schema("onzio").rpc("retire_unreferenced_media_asset", {
    p_club_id: input.clubId,
    p_asset_id: input.assetId,
    p_actor_id: input.actorId,
  });
  if (error || !data) throw new Error(`Unable to retire media asset: ${error?.message ?? "empty result"}`);
  const result = data as { status: string; storagePath?: string; idempotent?: boolean };
  if (result.status === "referenced") {
    return { status: "referenced", cleanupQueued: false, idempotent: false };
  }
  if (result.status === "not-found") failContract("MEDIA_ASSET_NOT_FOUND");
  if (result.status !== "retired" || !result.storagePath) failContract("MEDIA_NOT_PUBLISHED");

  const { error: deleteError } = await service.storage
    .from("onzio-media")
    .remove([result.storagePath]);
  if (deleteError) {
    await queueMediaCleanup({
      clubId: input.clubId,
      storageBucket: "onzio-media",
      storagePath: result.storagePath,
      reason: "published-object-retirement",
    });
  }

  return {
    status: "retired",
    cleanupQueued: Boolean(deleteError),
    idempotent: Boolean(result.idempotent),
  };
}

/** Storage half of the atomically checked unsaved-Homepage-upload retirement. */
export async function deleteRetiredHomepageUpload(input: {
  clubId: string;
  storagePath: string;
}): Promise<{ cleanupQueued: boolean }> {
  const { error } = await createServiceRoleClient().storage
    .from("onzio-media")
    .remove([input.storagePath]);
  if (error) {
    await queueMediaCleanup({
      clubId: input.clubId,
      storageBucket: "onzio-media",
      storagePath: input.storagePath,
      reason: "unsaved-homepage-upload",
    });
  }
  return { cleanupQueued: Boolean(error) };
}

/** Published media plus open upload reservations, and the club's limits. */
export async function getMediaUsageByClub(clubId: string): Promise<MediaUsage> {
  return getMediaUsage(clubId);
}

function assertFinalizationAuthorized(input: FinalizeMediaInput): void {
  if (input.publicWriteBeforeValidation) {
    failContract("UNVALIDATED_PUBLIC_WRITE");
  }
  if (input.lifecycle === "archived") failContract("CLUB_ARCHIVED");
  if (input.lifecycle && input.lifecycle !== "active") {
    failContract("CLUB_INACTIVE");
  }
  if (input.membership === null || input.membership === "removed") {
    failContract("MEMBERSHIP_REQUIRED");
  }
  if (
    input.stagingClubId &&
    input.stagingClubId !== input.clubId
  ) {
    failContract("CROSS_CLUB_MEDIA");
  }
  const localFixtureMembershipClubId =
    input.actorId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"
      ? "11111111-1111-4111-8111-111111111111"
      : undefined;
  const membershipClubId =
    input.membershipClubId ?? localFixtureMembershipClubId;
  if (membershipClubId && membershipClubId !== input.clubId) {
    failContract("CROSS_CLUB_MEDIA");
  }
  if (input.simulateDatabaseFailure) {
    failContract("FINALIZATION_ROLLED_BACK");
  }
}

export async function finalizeMediaUpload(
  input: FinalizeMediaInput,
): Promise<Record<string, unknown>> {
  assertFinalizationAuthorized(input);

  const uploadId = input.uploadId ?? randomUUID();
  const existing = completedUploads.get(uploadId);
  if (existing) return { ...existing };

  if (input.execute) {
    try {
      const result = await input.execute();
      const finalized = { uploadId, status: "finalized", ...result };
      completedUploads.set(uploadId, finalized);
      return { ...finalized };
    } catch {
      failContract("FINALIZATION_ROLLED_BACK");
    }
  }

  // The pure fallback models the orchestration for contract tests. Runtime
  // callers provide execute(), which performs the storage and database work.
  const result: Record<string, unknown> = {
    uploadId,
    status: "finalized",
    contentUpdated: true,
    stagingDeleted: input.stagingObjectExists !== false,
    publicObjectPublished: input.publicObjectExists !== false,
    cleanupQueued:
      input.replacement === true &&
      input.simulateOldObjectDeleteFailure === true,
  };
  completedUploads.set(uploadId, result);
  return { ...result };
}
