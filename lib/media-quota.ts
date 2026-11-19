import { ContractError } from "@/lib/contract-error";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// RC-ADMIN-10b: the per-club media quota and upload rate limit. The check and
// the reservation happen in one database call under a per-club lock
// (onzio.reserve_media_upload), so parallel uploads cannot all pass the same
// count. Sharp-free, so the authorize route can import it.

export type MediaUploadReservationInput = {
  clubId: string;
  actorId: string;
  uploadId: string;
  surface: string;
  kind: "photo" | "graphic";
  stagingPath: string;
  claimedSize: number;
};

export class MediaRateLimitedError extends ContractError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("MEDIA_RATE_LIMITED");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const QUOTA_FAILURES: Record<string, { status: number; message: string }> = {
  MEDIA_QUOTA_BYTES_EXCEEDED: {
    status: 409,
    message:
      "Your club has used all of its media storage. Remove images you no longer use, or ask Onzio for more space.",
  },
  MEDIA_QUOTA_FILES_EXCEEDED: {
    status: 409,
    message:
      "Your club has reached its image limit. Remove images you no longer use, or ask Onzio for a higher limit.",
  },
  MEDIA_RATE_LIMITED: {
    status: 429,
    message: "Too many uploads in a short time.",
  },
  MEDIA_QUOTA_UNAVAILABLE: {
    status: 503,
    message:
      "The upload limit could not be checked, so the upload was stopped. Try again in a moment.",
  },
};

function waitPhrase(seconds: number): string {
  if (seconds < 90) return "in a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `in about ${minutes} minutes`;
  return `in about ${Math.ceil(minutes / 60)} hours`;
}

/** The HTTP answer for a quota failure, or null when the error is something else. */
export function describeMediaQuotaFailure(error: unknown): {
  code: string;
  status: number;
  message: string;
  retryAfterSeconds?: number;
} | null {
  if (!(error instanceof ContractError)) return null;
  const failure = QUOTA_FAILURES[error.code];
  if (!failure) return null;
  if (error instanceof MediaRateLimitedError) {
    return {
      code: error.code,
      status: failure.status,
      message: `${failure.message} Try again ${waitPhrase(error.retryAfterSeconds)}.`,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  return { code: error.code, ...failure };
}

/** Reserve one upload, or throw the quota code. Any database failure stops the upload. */
export async function reserveMediaUpload(
  input: MediaUploadReservationInput,
): Promise<{ expiresAt: number }> {
  let result: { data: unknown; error: { message: string } | null };
  try {
    result = await createServiceRoleClient()
      .schema("onzio")
      .rpc("reserve_media_upload", {
        p_club_id: input.clubId,
        p_actor_id: input.actorId,
        p_upload_id: input.uploadId,
        p_surface: input.surface,
        p_kind: input.kind,
        p_staging_path: input.stagingPath,
        p_claimed_size: input.claimedSize,
      });
  } catch (error) {
    throw new ContractError(
      "MEDIA_QUOTA_UNAVAILABLE",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (result.error) {
    throw new ContractError("MEDIA_QUOTA_UNAVAILABLE", result.error.message);
  }
  const data = result.data as {
    status?: string;
    expiresAt?: number;
    retryAfterSeconds?: number;
  } | null;
  switch (data?.status) {
    case "reserved":
      if (typeof data.expiresAt !== "number") break;
      return { expiresAt: data.expiresAt };
    case "bytes":
      throw new ContractError("MEDIA_QUOTA_BYTES_EXCEEDED");
    case "files":
      throw new ContractError("MEDIA_QUOTA_FILES_EXCEEDED");
    case "rate":
      throw new MediaRateLimitedError(Math.max(1, Number(data.retryAfterSeconds) || 60));
  }
  throw new ContractError("MEDIA_QUOTA_UNAVAILABLE", "Unexpected reservation result");
}

const CONSUME_FAILURES: Record<string, string> = {
  missing: "MEDIA_RESERVATION_MISSING",
  mismatch: "CROSS_CLUB_MEDIA",
  used: "MEDIA_RESERVATION_USED",
  expired: "UPLOAD_AUTHORIZATION_EXPIRED",
  "too-large": "MEDIA_SIZE_MISMATCH",
};

export const MEDIA_RESERVATION_MESSAGES: Record<string, string> = {
  MEDIA_RESERVATION_MISSING:
    "This upload was not prepared by the admin, so it was not saved. Upload the file again.",
  MEDIA_RESERVATION_USED:
    "This upload was already used. Upload the file again.",
  MEDIA_SIZE_MISMATCH:
    "The uploaded file is larger than the file that was prepared. Upload it again.",
  UPLOAD_AUTHORIZATION_EXPIRED:
    "The upload took too long and expired. Upload the file again.",
};

/** Use the upload's reservation once; throws the contract code when it cannot be used. */
export async function consumeMediaUploadReservation(input: {
  uploadId: string;
  clubId: string;
  actorId: string;
  stagingPath: string;
  actualSize: number;
}): Promise<void> {
  const { data, error } = await createServiceRoleClient()
    .schema("onzio")
    .rpc("consume_media_upload_reservation", {
      p_upload_id: input.uploadId,
      p_club_id: input.clubId,
      p_actor_id: input.actorId,
      p_staging_path: input.stagingPath,
      p_actual_size: input.actualSize,
    });
  if (error) throw new Error(`Unable to use the upload reservation: ${error.message}`);
  const status = (data as { status?: string } | null)?.status;
  if (status === "consumed") return;
  throw new ContractError(CONSUME_FAILURES[status ?? ""] ?? "MEDIA_RESERVATION_MISSING");
}

export type MediaUsage = {
  publishedAssets: number;
  publishedBytes: number;
  openReservations: number;
  openBytes: number;
  uploadsLastHour: number;
  uploadsLastDay: number;
  limits: {
    maxBytes: number;
    maxAssets: number;
    maxUploadsPerHour: number;
    maxUploadsPerDay: number;
    maxOpenReservations: number;
  };
};

export async function getMediaUsage(clubId: string): Promise<MediaUsage> {
  const { data, error } = await createServiceRoleClient()
    .schema("onzio")
    .rpc("media_usage", { p_club_id: clubId });
  if (error || !data) {
    throw new Error(`Unable to read media usage: ${error?.message ?? "empty result"}`);
  }
  return data as MediaUsage;
}
