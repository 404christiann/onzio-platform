import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { authorizeMediaRequestSchema } from "@/lib/media-api-contract";
import {
  createMediaAuthorizationToken,
  type MediaAuthorization,
} from "@/lib/media-processing";
import { requireMediaRouteAuthorization } from "@/lib/media-route-auth";
import { buildStoragePath } from "@/lib/storage-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const code =
    error instanceof ContractError ? error.code : "MEDIA_AUTH_FAILED";
  const status = code === "AUTHENTICATION_REQUIRED" ? 401 : 403;
  return NextResponse.json({ error: { code } }, { status });
}

export async function POST(request: Request) {
  const parsed = authorizeMediaRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MEDIA_REQUEST",
          message: parsed.error.message,
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
      throw new Error(signedUploadError?.message ?? "Signed upload failed");
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
