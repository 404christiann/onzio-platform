import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { chickFilASaveSchema } from "@/lib/chick-fil-a-content";
import { stadiumSaveSchema } from "@/lib/stadium-content";
import { robinsonSaveSchema } from "@/lib/cinematic-robinson-content";
import { retirePublishedMedia } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";
import type { VisitorPageSnapshot } from "@/lib/visitor-page-editor";

const pages = {
  "chick-fil-a": { schema: chickFilASaveSchema, load: "load_chick_fil_a_editor", save: "save_chick_fil_a_editor" },
  stadium: { schema: stadiumSaveSchema, load: "load_stadium_editor", save: "save_stadium_editor" },
  robinson: { schema: robinsonSaveSchema, load: "load_robinson_editor", save: "save_robinson_editor" },
} as const;
const messages: Record<string, string> = {
  INVALID_VISITOR_PAYLOAD: "Review the page fields and image framing.",
  INVALID_VISITOR_MEDIA: "Choose an available image for this club.",
  MEDIA_NOT_PUBLISHED: "This image is no longer available. Choose it again.",
  VISITOR_PAGE_CHANGED: "Someone changed this page. Your draft is still here. Reload the latest page before saving.",
  DESIGN_CHANGED: "The website design changed. Reload the page before saving.",
  OPERATION_REUSED: "This save could not be confirmed. Retry the original save.",
  NOT_AUTHORIZED: "You no longer have permission to edit this page.",
  PAGE_UNAVAILABLE: "This design does not publish this page.",
  DATABASE_OPERATION_FAILED: "We could not confirm the save. Your draft is still here.",
};
function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleVisitorPageRequest(request: Request, page: string, mutation: boolean) {
  if (!Object.hasOwn(pages, page)) return failure("PAGE_UNAVAILABLE", 404);
  const config = pages[page as keyof typeof pages];
  if (mutation) {
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    const origin = request.headers.get("origin");
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") return failure("NOT_AUTHORIZED", 403);
  }
  let payload: z.infer<typeof chickFilASaveSchema> | z.infer<typeof stadiumSaveSchema> | z.infer<typeof robinsonSaveSchema> | undefined;
  const operationId = new URL(request.url).searchParams.get("operationId");
  if (mutation) {
    try {
      const raw = await request.text();
      if (raw.length > 2000000) return failure("INVALID_VISITOR_PAYLOAD", 400);
      const parsed = config.schema.safeParse(JSON.parse(raw));
      if (!parsed.success) return failure("INVALID_VISITOR_PAYLOAD", 400);
      payload = parsed.data;
    } catch { return failure("INVALID_VISITOR_PAYLOAD", 400); }
  } else if (operationId !== null && !z.uuid().safeParse(operationId).success) return failure("INVALID_VISITOR_PAYLOAD", 400);
  const client = await createClient();
  let userId: string;
  try { ({ userId } = await requireFreshClubSession(client)); }
  catch (error) { return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403); }
  let club;
  try { club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId }); }
  catch { return failure("NOT_AUTHORIZED", 403); }
  if (!club) return failure("NOT_AUTHORIZED", 403);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "homepage", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch { return failure("NOT_AUTHORIZED", 403); }
  try {
    const db = client.schema("onzio");
    const result = payload ? await db.rpc(config.save, { p_club_id: club.id, p_request: payload }) : await db.rpc(config.load, { p_club_id: club.id, p_operation_id: operationId ?? undefined });
    if (result.error) {
      const code = Object.hasOwn(messages, result.error.message) ? result.error.message : "DATABASE_OPERATION_FAILED";
      return failure(code, ["VISITOR_PAGE_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"].includes(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
    }
    if (!result.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const data = result.data as unknown as VisitorPageSnapshot<unknown>;
    const committed = payload ? data : data.operation?.status === "committed" ? data.operation.receipt : null;
    if (committed) {
      let pending = false;
      await Promise.all((committed.retiredMediaAssetIds ?? []).map(assetId => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId }).then(r => { if (r.cleanupQueued) pending = true; }).catch(() => { pending = true; })));
      committed.cleanupPending = pending;
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("DATABASE_OPERATION_FAILED", 500); }
}
