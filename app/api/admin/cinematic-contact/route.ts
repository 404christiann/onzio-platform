import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { cinematicContactSaveSchema, type CinematicContactSnapshot } from "@/lib/cinematic-contact-content";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  PAGE_UNAVAILABLE: "This website design does not publish this Contact page.",
  INVALID_CINEMATIC_CONTACT_PAYLOAD: "Review the Contact fields and destination.",
  CINEMATIC_CONTACT_CHANGED: "Another editor changed Contact. Reload the saved page before saving again.",
  DESIGN_CHANGED: "The website design changed. Reload Contact before saving.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to edit Contact.",
  DATABASE_OPERATION_FAILED: "The Contact save could not be confirmed.",
};

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } });
}

async function handle(request: Request, mutation: boolean) {
  let payload: z.infer<typeof cinematicContactSaveSchema> | null = null;
  let operationId: string | null = null;
  if (mutation) {
    const origin = request.headers.get("origin");
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") return failure("NOT_AUTHORIZED", 403);
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_CINEMATIC_CONTACT_PAYLOAD", 400); }
    const parsed = cinematicContactSaveSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_CINEMATIC_CONTACT_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.uuid().safeParse(operationId).success) return failure("INVALID_CINEMATIC_CONTACT_PAYLOAD", 400);
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
  if (club.presentationTemplateKey !== "cinematic@2") return failure("PAGE_UNAVAILABLE", 404);
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
      ? await rpc("save_cinematic_contact_editor", { p_club_id: club.id, p_request: payload })
      : await rpc("load_cinematic_contact_editor", { p_club_id: club.id, p_operation_id: operationId });
    if (response.error) {
      if (process.env.NODE_ENV !== "production") console.error("Cinematic Contact editor database error", response.error);
      const code = [response.error.message, response.error.code].find(value => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
      return failure(code, code === "CINEMATIC_CONTACT_CHANGED" || code === "DESIGN_CHANGED" || code === "OPERATION_REUSED" ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
    }
    if (!response.data) return failure("DATABASE_OPERATION_FAILED", 500);
    return NextResponse.json(response.data as CinematicContactSnapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Cinematic Contact editor request failed", error);
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
