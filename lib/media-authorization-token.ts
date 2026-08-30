// Sharp-free media authorization token boundary.
//
// The authorize route only signs and verifies HMAC tokens; it never touches
// image bytes. Keeping these functions in a module with no `sharp` import
// guarantees a native-binary (libvips) load failure in the serverless runtime
// can never take down upload authorization. This mirrors the Phase 8
// precedent that isolated `lib/media-cleanup.ts` from sharp for the same
// reason.
import { createHmac, timingSafeEqual } from "node:crypto";
import { failContract } from "@/lib/contract-error";
import type { MediaKind } from "@/lib/media-validation";
import { parseStoragePath, type MediaSurface } from "@/lib/storage-path";

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
