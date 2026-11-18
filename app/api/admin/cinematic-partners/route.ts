import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { cinematicPartnersSaveSchema, type CinematicPartnersSnapshot } from "@/lib/cinematic-partners-content";
import { ContractError } from "@/lib/contract-error";
import { retirePublishedMedia } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  PAGE_UNAVAILABLE: "This website design does not publish the Partners pages.",
  INVALID_CINEMATIC_PARTNERS_PAYLOAD: "Review the Partners fields, logos and button link.",
  CINEMATIC_PARTNERS_CHANGED: "Another editor changed Partners. Reload the saved pages before saving again.",
  DESIGN_CHANGED: "The website design changed. Reload Partners before saving.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to edit Partners.",
  DATABASE_OPERATION_FAILED: "The Partners save could not be confirmed.",
};
const conflicts = new Set(["CINEMATIC_PARTNERS_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"]);

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } });
}

type Snapshot = CinematicPartnersSnapshot & { operationId?: string };

async function handle(request: Request, mutation: boolean) {
  let payload: z.infer<typeof cinematicPartnersSaveSchema> | null = null;
  let operationId: string | null = null;
  if (mutation) {
    const origin = request.headers.get("origin");
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") return failure("NOT_AUTHORIZED", 403);
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_CINEMATIC_PARTNERS_PAYLOAD", 400); }
    const parsed = cinematicPartnersSaveSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_CINEMATIC_PARTNERS_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.uuid().safeParse(operationId).success) return failure("INVALID_CINEMATIC_PARTNERS_PAYLOAD", 400);
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
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "branding", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    const rpc = onzio.rpc.bind(onzio) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const response = mutation
      ? await rpc("save_cinematic_partners_editor", { p_club_id: club.id, p_request: payload })
      : await rpc("load_cinematic_partners_editor", { p_club_id: club.id, p_operation_id: operationId });
    if (response.error) {
      if (process.env.NODE_ENV !== "production") console.error("Partners editor database error", response.error);
      const code = [response.error.message, response.error.code].find(value => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
      return failure(code, conflicts.has(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
    }
    if (!response.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const snapshot = response.data as Snapshot;
    // A logo another page still uses (Sponsors, Schedule) is kept by the reference-safe retirement.
    const committed = mutation ? snapshot : snapshot.operation?.status === "committed" ? snapshot.operation.receipt : undefined;
    if (committed) {
      const retired = Array.isArray(committed.retiredMediaAssetIds) ? committed.retiredMediaAssetIds : [];
      delete committed.retiredMediaAssetIds;
      await Promise.all(retired.map(assetId => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId: String(assetId) })
        .catch(error => { console.error("Partner logo cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Partners editor request failed", error);
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
