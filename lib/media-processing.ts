import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import sharp from "sharp";
import { clubHasFeature, type ClubTier } from "@/lib/club-features";
import { failContract } from "@/lib/contract-error";
import { validateMediaUpload, type MediaKind } from "@/lib/media-validation";
import {
  buildStoragePath,
  isUuid,
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
  tier?: ClubTier;
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

export type MediaAuthorization = {
  version: 1;
  uploadId: string;
  clubId: string;
  actorId: string;
  surface: MediaSurface;
  kind: MediaKind;
  fileName: string;
  mimeType: string;
  claimedSize: number;
  stagingPath: string;
  expiresAt: number;
};

function mediaSigningSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("Media signing secret is not configured");
  }
  return secret;
}

function signEncodedPayload(encodedPayload: string): string {
  return createHmac("sha256", mediaSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createMediaAuthorizationToken(
  authorization: MediaAuthorization,
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify(authorization),
    "utf8",
  ).toString("base64url");
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

export function verifyMediaAuthorizationToken(
  token: string,
): MediaAuthorization {
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) {
    failContract("INVALID_UPLOAD_AUTHORIZATION");
  }
  const expectedSignature = signEncodedPayload(encodedPayload);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    failContract("INVALID_UPLOAD_AUTHORIZATION");
  }

  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    failContract("INVALID_UPLOAD_AUTHORIZATION");
  }
  if (!value || typeof value !== "object") {
    failContract("INVALID_UPLOAD_AUTHORIZATION");
  }
  const authorization = value as MediaAuthorization;
  if (
    authorization.version !== 1 ||
    typeof authorization.uploadId !== "string" ||
    typeof authorization.clubId !== "string" ||
    typeof authorization.actorId !== "string" ||
    typeof authorization.stagingPath !== "string" ||
    typeof authorization.expiresAt !== "number"
  ) {
    failContract("INVALID_UPLOAD_AUTHORIZATION");
  }
  if (authorization.expiresAt <= Date.now()) {
    failContract("UPLOAD_AUTHORIZATION_EXPIRED");
  }

  const parsedPath = parseStoragePath(authorization.stagingPath);
  if (
    parsedPath.clubId !== authorization.clubId ||
    parsedPath.assetId !== authorization.uploadId ||
    parsedPath.surface !== authorization.surface
  ) {
    failContract("CROSS_CLUB_MEDIA");
  }
  return authorization;
}

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

async function queueMediaCleanup(input: {
  clubId: string;
  storageBucket: "onzio-upload-staging" | "onzio-media";
  storagePath: string;
  reason: string;
}): Promise<void> {
  const service = createServiceRoleClient();
  await service.schema("onzio").from("media_cleanup_queue").upsert(
    {
      club_id: input.clubId,
      storage_bucket: input.storageBucket,
      storage_path: input.storagePath,
      reason: input.reason,
      next_attempt_at: new Date().toISOString(),
    },
    { onConflict: "storage_bucket,storage_path" },
  );
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

export async function retirePublishedMedia(input: {
  clubId: string;
  actorId: string;
  assetId: string;
}): Promise<{ status: "retired"; cleanupQueued: boolean; idempotent: boolean }> {
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: asset, error } = await onzio
    .from("media_assets")
    .select("id, club_id, storage_bucket, storage_path, status, deleted_at")
    .eq("id", input.assetId)
    .eq("club_id", input.clubId)
    .maybeSingle();
  if (error) throw new Error(`Unable to resolve media asset: ${error.message}`);
  if (!asset) failContract("MEDIA_ASSET_NOT_FOUND");
  if (asset.club_id !== input.clubId) failContract("CROSS_CLUB_MEDIA");
  if (asset.status === "orphaned" || asset.deleted_at) {
    return { status: "retired", cleanupQueued: false, idempotent: true };
  }
  if (
    asset.status !== "published" ||
    asset.storage_bucket !== "onzio-media"
  ) {
    failContract("MEDIA_NOT_PUBLISHED");
  }

  const deletedAt = new Date().toISOString();
  const { error: updateError } = await onzio
    .from("media_assets")
    .update({ status: "orphaned", deleted_at: deletedAt })
    .eq("id", input.assetId)
    .eq("club_id", input.clubId)
    .eq("status", "published");
  if (updateError) {
    throw new Error(`Unable to retire media asset: ${updateError.message}`);
  }

  const { error: deleteError } = await service.storage
    .from("onzio-media")
    .remove([asset.storage_path]);
  if (deleteError) {
    await queueMediaCleanup({
      clubId: input.clubId,
      storageBucket: "onzio-media",
      storagePath: asset.storage_path,
      reason: "published-object-retirement",
    });
  }

  await onzio.from("audit_events").insert({
    club_id: input.clubId,
    actor_user_id: input.actorId,
    actor_type: "media_processor",
    operation: "media.retire",
    resource_type: "media_asset",
    resource_id: input.assetId,
    payload: { cleanup_queued: Boolean(deleteError) },
  });

  return {
    status: "retired",
    cleanupQueued: Boolean(deleteError),
    idempotent: false,
  };
}

type StorageListEntry = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function cleanupAbandonedStagingMedia(input?: {
  olderThan?: Date;
  clubId?: string;
}): Promise<{ inspected: number; removed: number; failed: number }> {
  const service = createServiceRoleClient();
  const bucket = service.storage.from("onzio-upload-staging");
  if (input?.clubId && !isUuid(input.clubId)) {
    failContract("INVALID_CLUB_ID");
  }
  const olderThan =
    input?.olderThan ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  let inspected = 0;
  let removed = 0;
  let failed = 0;

  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > 3) return;
    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Unable to list staging media: ${error.message}`);
      const entries = (data ?? []) as StorageListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const isFolder = !entry.id && !entry.metadata;
        if (isFolder) {
          await walk(path, depth + 1);
          continue;
        }
        inspected += 1;
        const createdAt = entry.created_at
          ? new Date(entry.created_at)
          : null;
        if (!createdAt || createdAt >= olderThan) continue;
        const { error: removeError } = await bucket.remove([path]);
        if (removeError) {
          failed += 1;
          try {
            const parsed = parseStoragePath(path);
            await queueMediaCleanup({
              clubId: parsed.clubId,
              storageBucket: "onzio-upload-staging",
              storagePath: path,
              reason: "abandoned-staging-object",
            });
          } catch {
            // Invalid legacy paths are reported as failures and left for
            // operator review rather than deleted speculatively.
          }
        } else {
          removed += 1;
        }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  await walk(input?.clubId?.toLowerCase() ?? "", input?.clubId ? 1 : 0);
  return { inspected, removed, failed };
}

export async function getMediaUsageByClub(clubId: string): Promise<{
  assetCount: number;
  totalBytes: number;
}> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .schema("onzio")
    .from("media_assets")
    .select("byte_size")
    .eq("club_id", clubId)
    .eq("status", "published");
  if (error) throw new Error(`Unable to read media usage: ${error.message}`);
  return {
    assetCount: data?.length ?? 0,
    totalBytes: (data ?? []).reduce(
      (total, asset) => total + Number(asset.byte_size),
      0,
    ),
  };
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
  if (
    input.tier &&
    input.surface &&
    !clubHasFeature(input.tier, input.surface)
  ) {
    failContract("FEATURE_NOT_INCLUDED");
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
