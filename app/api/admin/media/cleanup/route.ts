import { NextResponse } from "next/server";
import { ContractError } from "@/lib/contract-error";
import { cleanupMediaRequestSchema } from "@/lib/media-api-contract";
import { retirePublishedMedia } from "@/lib/media-processing";
import { requireMediaRouteAuthorization } from "@/lib/media-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = cleanupMediaRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_MEDIA_REQUEST" } },
      { status: 400 },
    );
  }

  try {
    // Branding is available to every tier and supplies the common AAL2,
    // membership, and active-lifecycle gate. The asset lookup below remains
    // club-scoped and RLS-protected.
    const { supabase, user, club } = await requireMediaRouteAuthorization(
      request,
      "branding",
    );
    const { data: asset, error } = await supabase
      .schema("onzio")
      .from("media_assets")
      .select("id, club_id")
      .eq("id", parsed.data.assetId)
      .eq("club_id", club.id)
      .maybeSingle();
    if (error || !asset) throw new ContractError("MEDIA_ASSET_NOT_FOUND");

    const result = await retirePublishedMedia({
      clubId: club.id,
      actorId: user.id,
      assetId: parsed.data.assetId,
    });
    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const code =
      error instanceof ContractError ? error.code : "MEDIA_CLEANUP_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401 : 400;
    return NextResponse.json({ error: { code } }, { status });
  }
}
