import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { tryoutsPageSaveSchema } from "@/lib/tryouts-page-editor/contract";
import { createClient } from "@/lib/supabase-server";
import { resolveMediaReferences } from "@/lib/media-assets";
import { retirePublishedMedia } from "@/lib/media-processing";
import { loadLinkedOpenRegistrationForms } from "@/lib/queries";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  PAGE_UNAVAILABLE: "This website design does not publish a Tryouts page.",
  INVALID_TRYOUTS_PAYLOAD: "Review the Tryouts page fields and try again.",
  TRYOUTS_CHANGED: "Someone changed the Tryouts page. Your draft is still here. Review the latest page before saving again.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to save this Tryouts page.",
  INVALID_TRYOUTS_EVENT: "An event changed or is unavailable. Your draft is still here.",
  DATABASE_OPERATION_FAILED: "We could not confirm the Tryouts page save. Your draft is still here.",
};

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } });
}

function databaseFailure(error: { code?: string; message?: string }) {
  if (process.env.NODE_ENV !== "production") console.error("Tryouts page database error", { code: error.code, message: error.message });
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  return failure(code, code === "TRYOUTS_CHANGED" || code === "OPERATION_REUSED" ? 409 :
    code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
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
  let payload;
  let operationId: string | null = null;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_TRYOUTS_PAYLOAD", 400); }
    const parsed = tryoutsPageSaveSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_TRYOUTS_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.string().uuid().safeParse(operationId).success) return failure("INVALID_TRYOUTS_PAYLOAD", 400);
  }

  const supabase = await createClient();
  let userId: string;
  try { ({ userId } = await requireFreshClubSession(supabase)); }
  catch (error) { const code = error instanceof ContractError ? error.code : "AUTHENTICATION_REQUIRED"; return failure(code, code === "AUTHENTICATION_REQUIRED" ? 401 : 403); }
  let club;
  try { club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId }); }
  catch { return failure("UNKNOWN_TENANT", 404); }
  if (!club) return failure("UNKNOWN_TENANT", 404);
  if (club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1") return failure("PAGE_UNAVAILABLE", 404);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "tryouts", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) { return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403); }

  try {
    const onzio = supabase.schema("onzio");
    // Generated types are updated once all page-editor migrations are settled.
    const rpc = onzio.rpc.bind(onzio) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const result = mutation
      ? await rpc("save_tryouts_page", { p_club_id: club.id, p_request: payload })
      : await rpc("load_tryouts_page", { p_club_id: club.id, p_operation_id: operationId });
    if (result.error) return databaseFailure(result.error);
    if (!result.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const data = result.data as Record<string, unknown>;
    // The receipt preserves assets to retire if the response is lost. A
    // repeat POST or operation-status GET can finish cleanup safely.
    const operation = data.operation as { status?: string; receipt?: Record<string, unknown> } | undefined;
    const committed = mutation ? data : operation?.status === "committed" ? operation.receipt : undefined;
    if (committed) {
      const retired = Array.isArray(committed.retiredMediaAssetIds) ? committed.retiredMediaAssetIds : [];
      delete committed.retiredMediaAssetIds;
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId: String(assetId) })
        .catch((error) => { console.error("Tryouts photo cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    if (Array.isArray(data.events)) {
      try {
        data.events = await resolveMediaReferences(data.events as Record<string, unknown>[], club.id,
          [{ assetId: "hero_media_asset_id", url: "hero_media_url" }],
          onzio as unknown as Parameters<typeof resolveMediaReferences>[3]);
      } catch { /* A transient URL lookup does not invalidate the saved page. */ }
    }
    // Use the same public form hydration as the live route. Include all open
    // club forms so an unsaved change of linked form previews immediately.
    try {
      const { data: openFormIds, error: formsError } = await onzio.from("registration_forms")
        .select("id").eq("club_id", club.id).eq("status", "open").limit(500);
      if (formsError) throw new Error(formsError.message);
      const nativeForms = await loadLinkedOpenRegistrationForms(
        (openFormIds ?? []).map((form) => ({ registration_form_id: form.id })),
        club.id, onzio as Parameters<typeof loadLinkedOpenRegistrationForms>[2]);
      data.registrationForms = Object.fromEntries(nativeForms);
    } catch (error) {
      // Preview enrichment cannot turn a confirmed transaction into a failed
      // Save. Omit the property so the editor retains its loaded form previews.
      // An initial load still fails instead of accepting an incomplete preview.
      if (!committed) throw error;
      if (process.env.NODE_ENV !== "production") console.error("Tryouts registration preview refresh failed", {
        clubId: club.id, message: error instanceof Error ? error.message : "Preview unavailable",
      });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Tryouts page load error", error);
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
