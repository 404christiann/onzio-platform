import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { retirePublishedMedia } from "@/lib/media-processing";
import { programPageSaveRequestSchema, type ProgramPageSnapshot } from "@/lib/program-page-editor/contract";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  CONTENT_CHANGED: "Someone changed this program page. Your edits are still here. Reload and review the latest version before saving.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  INVALID_PROGRAM_PAGE_PAYLOAD: "Review the program fields and try again.",
  INVALID_PROGRAM_MEDIA: "A program image is no longer available. Your other edits are still here.",
  FIELD_UNAVAILABLE: "Program order and visibility are edited in Manage programs.",
  NOT_AUTHORIZED: "You no longer have permission to edit this program page.",
  PAGE_UNAVAILABLE: "This club does not have a public Programs page.",
  DATABASE_OPERATION_FAILED: "We could not confirm the save. Your edits are still here. Try again.",
};

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? "We could not complete this request." } }, { status, headers: { "Cache-Control": "no-store" } });
}

function databaseFailure(error: { code?: string; message?: string }) {
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  const status = ["CONTENT_CHANGED", "OPERATION_REUSED"].includes(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400;
  return failure(code, status);
}

function sameOrigin(request: Request) {
  const external = new URL(request.url);
  external.host = request.headers.get("host") ?? external.host;
  const origin = request.headers.get("origin");
  return (!origin || origin === external.origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}

async function handle(request: Request, mutation: boolean) {
  if (mutation && !sameOrigin(request)) return failure("NOT_AUTHORIZED", 403);
  let payload: z.infer<typeof programPageSaveRequestSchema> | undefined;
  let programId: string | null = null;
  let operationId: string | null = null;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400); }
    const parsed = programPageSaveRequestSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    const url = new URL(request.url);
    programId = url.searchParams.get("programId");
    operationId = url.searchParams.get("operationId");
    if ((programId && !z.string().uuid().safeParse(programId).success) || (operationId && !z.string().uuid().safeParse(operationId).success)) return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400);
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
  if (club.presentationTemplateKey !== "academy@1") return failure("PAGE_UNAVAILABLE", 404);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "programs", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) { return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403); }

  try {
    // The RPC is defined in this package's migration. Generated database types
    // are refreshed once all parallel page migrations have settled.
    const onzio = supabase.schema("onzio") as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: ProgramPageSnapshot | null; error: { code?: string; message?: string } | null }> };
    const result = mutation
      ? await onzio.rpc("save_program_page", { p_club_id: club.id, p_request: payload! })
      : await onzio.rpc("load_program_page", { p_club_id: club.id, p_program_id: programId, p_operation_id: operationId });
    if (result.error) return databaseFailure(result.error);
    if (!result.data) return failure("DATABASE_OPERATION_FAILED", 500);
    if (mutation) {
      const retired = Array.isArray(result.data.retiredMediaAssetIds) ? result.data.retiredMediaAssetIds : [];
      delete result.data.retiredMediaAssetIds;
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId })
        .catch((error) => { console.error("program media cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
