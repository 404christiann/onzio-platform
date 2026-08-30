import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { authorizeMediaRequestSchema } from "@/lib/media-api-contract";
import {
  createMediaAuthorizationToken,
  type MediaAuthorization,
} from "@/lib/media-authorization-token";
import {
  describeMediaAuthorizationFailure,
  describeMediaRequestValidationFailure,
} from "@/lib/media-diagnostics";
import { requireMediaRouteAuthorization } from "@/lib/media-route-auth";
import { buildStoragePath } from "@/lib/storage-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every failure here used to collapse into a bare `{"error":{"code":
 * "MEDIA_AUTH_FAILED"}}` with no message. That single opaque code covers at
 * least five unrelated causes — an expired session, a lost membership, a club
 * whose lifecycle/public-access state blocks content mutation, a storage RLS
 * denial, and an unreachable Storage service — and it is why this failure has
 * now been diagnosed twice by inference rather than by reading the response.
 *
 * The response now carries the specific code plus a short, non-sensitive
 * `reason`. Nothing new is disclosed: the caller is an authenticated club
 * admin, the values are about their own club, and no identifier, token, path,
 * or internal SQL is included.
 */
function errorResponse(error: unknown) {
  if (error instanceof ContractError) {
    const status = error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403;
    return NextResponse.json(
      { error: { code: error.code, message: error.code } },
      { status },
    );
  }
  const { code, reason } = describeMediaAuthorizationFailure(error);
  return NextResponse.json(
    { error: { code, message: reason, reason } },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MEDIA_REQUEST",
          message: "The upload request body was not valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const parsed = authorizeMediaRequestSchema.safeParse(body);
  if (!parsed.success) {
    // `parsed.error.message` is a JSON dump of Zod issue objects. Admins were
    // being shown that raw array in the upload error banner; say what is wrong
    // with the file instead.
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MEDIA_REQUEST",
          message: describeMediaRequestValidationFailure(
            parsed.error.issues,
            body,
          ),
        },
      },
      { status: 400 },
    );
  }

  try {
    const { supabase, user, club } = await requireMediaRouteAuthorization(
      request,
      parsed.data.surface,
    );
    const maximum =
      parsed.data.kind === "photo" ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
    if (parsed.data.size > maximum) {
      throw new ContractError("FILE_TOO_LARGE");
    }
    if (
      parsed.data.kind === "graphic" &&
      parsed.data.mimeType === "image/jpeg"
    ) {
      throw new ContractError("UNSUPPORTED_MEDIA_TYPE");
    }

    const uploadId = randomUUID();
    const sourceExtension =
      parsed.data.mimeType === "image/jpeg"
        ? "jpg"
        : parsed.data.mimeType === "image/png"
          ? "png"
          : "webp";
    const stagingPath = buildStoragePath({
      clubId: club.id,
      surface: parsed.data.surface,
      assetId: uploadId,
      extension: sourceExtension,
    });
    const { data: signedUpload, error: signedUploadError } =
      await supabase.storage
        .from("onzio-upload-staging")
        .createSignedUploadUrl(stagingPath, { upsert: false });
    if (signedUploadError || !signedUpload) {
      throw signedUploadError ?? new Error("Signed upload failed");
    }

    const authorization: MediaAuthorization = {
      version: 1,
      uploadId,
      clubId: club.id,
      actorId: user.id,
      surface: parsed.data.surface,
      kind: parsed.data.kind,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      claimedSize: parsed.data.size,
      stagingPath,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    return NextResponse.json({
      uploadId,
      path: stagingPath,
      token: signedUpload.token,
      authorization: createMediaAuthorizationToken(authorization),
      expiresAt: authorization.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
