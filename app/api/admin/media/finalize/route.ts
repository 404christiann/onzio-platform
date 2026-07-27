import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { finalizeMediaRequestSchema } from "@/lib/media-api-contract";
import {
  publishAuthorizedMedia,
  verifyMediaAuthorizationToken,
} from "@/lib/media-processing";
import { requireMediaRouteAuthorization } from "@/lib/media-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = finalizeMediaRequestSchema.safeParse(await request.json());
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
    const authorization = verifyMediaAuthorizationToken(
      parsed.data.authorization,
    );
    const { user, club } = await requireMediaRouteAuthorization(
      request,
      authorization.surface,
    );
    if (
      authorization.clubId !== club.id ||
      authorization.actorId !== user.id
    ) {
      throw new ContractError("CROSS_CLUB_MEDIA");
    }
    const result = await publishAuthorizedMedia(authorization);
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const code =
      error instanceof ContractError
        ? error.code
        : "MEDIA_FINALIZATION_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: { code } }, { status });
  }
}
