import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { deleteRetiredHomepageUpload } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ assetId: z.uuid() }).strict();
type Retirement = { status: "retired" | "referenced" | "not-owned" | "not-published"; storagePath?: string };

export async function POST(request: Request) {
  const external = new URL(request.url);
  external.host = request.headers.get("host") ?? external.host;
  const origin = request.headers.get("origin");
  if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: { code: "NOT_AUTHORIZED" } }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { code: "INVALID_MEDIA_REQUEST" } }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_MEDIA_REQUEST" } }, { status: 400 });

  try {
    const supabase = await createClient();
    const { userId } = await requireFreshClubSession(supabase);
    const club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId });
    if (!club) throw new ContractError("UNKNOWN_TENANT");
    const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
    await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "homepage", payload: {} });

    const { data, error } = await supabase.schema("onzio").rpc("retire_unreferenced_homepage_upload", {
      p_club_id: club.id, p_asset_id: parsed.data.assetId,
    });
    if (error || !data) throw new Error("Unable to check Homepage media references");
    const result = data as Retirement;
    if (result.status === "referenced") return NextResponse.json({ data: { status: "referenced" } });
    if (result.status !== "retired" || !result.storagePath) {
      return NextResponse.json({ error: { code: "MEDIA_ASSET_NOT_FOUND" } }, { status: 404 });
    }

    const cleanup = await deleteRetiredHomepageUpload({ clubId: club.id, storagePath: result.storagePath });
    return NextResponse.json({ data: { status: "retired", cleanupQueued: cleanup.cleanupQueued } });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "MEDIA_CLEANUP_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" ? 401
      : code === "MEDIA_CLEANUP_FAILED" ? 500 : 403;
    return NextResponse.json({ error: { code } }, { status });
  }
}
