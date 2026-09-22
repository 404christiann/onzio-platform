import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { homepageSaveRequestSchema } from "@/lib/homepage-editor/contract";
import { hydrateHomepageSnapshot } from "@/lib/homepage-editor/server";
import { retirePublishedMedia } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  CONTENT_CHANGED: "Someone saved changes to this homepage. Your changes are still here. Review the latest version before saving again.",
  DESIGN_CHANGED: "Your website design changed. Your changes are still here. Reload the preview before saving again.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to save this homepage.",
  INVALID_HOMEPAGE_PAYLOAD: "Check the homepage fields and try again.",
  SECTION_UNAVAILABLE: "This part is not available in your website design.",
  FIELD_UNAVAILABLE: "This field is not available in your website design.",
  INVALID_PHOTO: "A photo is no longer available. Your other changes are still here.",
  VIDEO_SOURCE_REQUIRED: "Onzio needs to set up the video before you can show it.",
  INVALID_HOMEPAGE_DESIGN: "We could not load your website design. Try again.",
  DATABASE_OPERATION_FAILED: "We could not confirm the homepage changes. Your work is still here. Try again.",
};

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? "We could not complete this request. Try again." } }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function databaseFailure(error: { code?: string; message?: string }) {
  // Postgres SQLSTATE is separate from our fixed exception message. Do not
  // return raw SQL errors, table names, or user input to the browser.
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  const status = ["CONTENT_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"].includes(code) ? 409
    : code === "NOT_AUTHORIZED" ? 403
      : ["DATABASE_OPERATION_FAILED", "INVALID_HOMEPAGE_DESIGN"].includes(code) ? 500 : 400;
  return failure(code, status);
}

async function handle(request: Request, mutation: boolean) {
  if (mutation) {
    const origin = request.headers.get("origin");
    // Next can expose an internal localhost URL for a tenant subdomain. Use
    // the actual Host, which getClubContext verifies before any mutation.
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure("NOT_AUTHORIZED", 403);
    }
  }
  let payload;
  let operationId: string | null = null;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_HOMEPAGE_PAYLOAD", 400); }
    const parsed = homepageSaveRequestSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_HOMEPAGE_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.string().uuid().safeParse(operationId).success) return failure("INVALID_HOMEPAGE_PAYLOAD", 400);
  }

  const supabase = await createClient();
  let userId: string;
  try { ({ userId } = await requireFreshClubSession(supabase)); }
  catch (error) {
    const code = error instanceof ContractError ? error.code : "AUTHENTICATION_REQUIRED";
    return failure(code, code === "AUTHENTICATION_REQUIRED" ? 401 : 403);
  }
  let club;
  try { club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId }); }
  catch { return failure("UNKNOWN_TENANT", 404); }
  if (!club) return failure("UNKNOWN_TENANT", 404);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "homepage", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    const result = mutation
      ? await onzio.rpc("save_homepage", { p_club_id: club.id, p_request: payload! })
      : await onzio.rpc("load_homepage", { p_club_id: club.id, p_operation_id: operationId });
    if (result.error) return databaseFailure(result.error);
    if (!result.data) return failure("DATABASE_OPERATION_FAILED", 500);
    if (mutation) {
      const data = result.data as { retiredMediaAssetIds?: unknown };
      const retired = Array.isArray(data.retiredMediaAssetIds) ? data.retiredMediaAssetIds : [];
      delete data.retiredMediaAssetIds;
      // The save already committed. A photo that stopped being referenced is
      // retired best-effort here; its failure must never turn a committed save
      // into a reported failure. Storage-level failures already retry via
      // queueMediaCleanup inside retirePublishedMedia.
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId: String(assetId) })
        .catch((error) => { console.error("homepage photo cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json(hydrateHomepageSnapshot(result.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // A transport error can occur after commit. The operation receipt lets the
    // client reconcile or retry the exact request without a second write.
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
