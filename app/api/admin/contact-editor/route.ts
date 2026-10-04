import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { contactEditorSaveSchema, type ContactEditorSnapshot } from "@/lib/contact-page-editor/contract";
import { retirePublishedMedia } from "@/lib/media-processing";
import { fetchContactContent } from "@/lib/queries";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  PAGE_UNAVAILABLE: "This website design does not publish a Contact page.",
  INVALID_CONTACT_PAYLOAD: "Review the Contact fields and try again.",
  INVALID_CONTACT_MEDIA: "This Contact image is unavailable. Choose another image.",
  CONTACT_CHANGED: "Someone changed Contact details. Your draft is still here. Review the latest page before saving again.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to save this Contact page.",
  DATABASE_OPERATION_FAILED: "We could not confirm the Contact save. Your draft is still here.",
};

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } });
}

function databaseFailure(error: { code?: string; message?: string }) {
  if (process.env.NODE_ENV !== "production") console.error("Contact editor database error", { code: error.code, message: error.message });
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  return failure(code, code === "CONTACT_CHANGED" || code === "OPERATION_REUSED" ? 409 :
    code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 :
    code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
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
    try { body = await request.json(); } catch { return failure("INVALID_CONTACT_PAYLOAD", 400); }
    const parsed = contactEditorSaveSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_CONTACT_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.string().uuid().safeParse(operationId).success) {
      return failure("INVALID_CONTACT_PAYLOAD", 400);
    }
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
  if (club.presentationTemplateKey !== "academy@1" && club.presentationTemplateKey !== "editorial@1") {
    return failure("PAGE_UNAVAILABLE", 404);
  }
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "contact", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    const rpc = onzio.rpc.bind(onzio) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const response = mutation
      ? await rpc("save_contact_editor", { p_club_id: club.id, p_request: payload })
      : await rpc("load_contact_editor", { p_club_id: club.id, p_operation_id: operationId });
    if (response.error) return databaseFailure(response.error);
    if (!response.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const data = response.data as ContactEditorSnapshot;
    const committed = mutation ? data : data.operation?.status === "committed" ? data.operation.receipt : null;
    if (committed) {
      const retired = committed.retiredMediaAssetIds ?? [];
      delete committed.retiredMediaAssetIds;
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId })
        .catch((error) => console.error("Contact image cleanup failed", { clubId: club.id, assetId, error }))));
    }
    if (!mutation) {
      const content = await fetchContactContent(club.id, onzio as Parameters<typeof fetchContactContent>[1]);
      data.heroMediaUrl = content.page?.heroMediaUrl ?? "";
      data.socialLinks = content.socialLinks;
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Contact editor request failed", error);
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
