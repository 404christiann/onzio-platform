import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { retirePublishedMedia } from "@/lib/media-processing";
import { shopSaveRequestSchema, shopSurfaceSchema, type ShopSnapshot } from "@/lib/shop-editor/contract";
import { hydrateShopSnapshot } from "@/lib/shop-editor/server";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  CONTENT_CHANGED: "Someone else saved this page. Your changes are still here; review the latest page before saving.",
  DESIGN_CHANGED: "Your website design changed. Your changes are still here; reload this page before saving.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  INVALID_SHOP_PAYLOAD: "Check the Shop fields and try again.",
  INVALID_SHOP_PHOTO: "A Shop photo is no longer available. Your other changes are still here.",
  SECTION_UNAVAILABLE: "This section is not shown by your website design.",
  PAGE_UNAVAILABLE: "This page is not available for your website design.",
  NOT_AUTHORIZED: "You no longer have permission to edit this Shop page.",
};

function failure(code: string, status: number) {
  return NextResponse.json(
    { error: { code, message: messages[code] ?? "We could not complete this request. Your work is still here." } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function databaseFailure(error: { code?: string; message?: string }) {
  if (process.env.NODE_ENV !== "production") console.error("Shop page database error", { code: error.code, message: error.message });
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "SHOP_OPERATION_FAILED";
  return failure(code, ["CONTENT_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"].includes(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "SHOP_OPERATION_FAILED" ? 500 : 400);
}

async function handle(request: Request, mutation: boolean) {
  if (mutation) {
    const origin = request.headers.get("origin");
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return failure("NOT_AUTHORIZED", 403);
    }
  }

  let surface: "home" | "shop";
  let payload: z.infer<typeof shopSaveRequestSchema> | null = null;
  let operationId: string | null = null;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_SHOP_PAYLOAD", 400); }
    const parsed = shopSaveRequestSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_SHOP_PAYLOAD", 400);
    payload = parsed.data;
    surface = payload.surface;
  } else {
    const url = new URL(request.url);
    const parsedSurface = shopSurfaceSchema.safeParse(url.searchParams.get("surface"));
    if (!parsedSurface.success) return failure("INVALID_SHOP_PAYLOAD", 400);
    surface = parsedSurface.data;
    operationId = url.searchParams.get("operationId");
    if (operationId !== null && !z.string().uuid().safeParse(operationId).success) return failure("INVALID_SHOP_PAYLOAD", 400);
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
  if (club.presentationTemplateKey === "editorial@1" && !club.storeEnabled) return failure("PAGE_UNAVAILABLE", 404);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "shop", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    // The migration adds these RPCs. Keep this narrow cast until the shared
    // generated database definitions are refreshed after all page migrations.
    const rpc = onzio.rpc.bind(onzio) as unknown as (name: string, args: Record<string, unknown>) => Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;
    const result = mutation
      ? await rpc("save_shop_page", { p_club_id: club.id, p_request: payload! })
      : await rpc("load_shop_page", { p_club_id: club.id, p_surface: surface, p_operation_id: operationId });
    if (result.error) return databaseFailure(result.error);
    if (!result.data) return failure("SHOP_OPERATION_FAILED", 500);
    const snapshot = result.data as ShopSnapshot & { retiredMediaAssetIds?: unknown };
    if (mutation) {
      const retired = Array.isArray(snapshot.retiredMediaAssetIds) ? snapshot.retiredMediaAssetIds : [];
      delete snapshot.retiredMediaAssetIds;
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId: String(assetId) })
        .catch((error) => { console.error("Shop photo cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json(hydrateShopSnapshot(snapshot), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Shop page load error", error);
    // The operation receipt allows response-loss reconciliation after commit.
    return failure("SHOP_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
