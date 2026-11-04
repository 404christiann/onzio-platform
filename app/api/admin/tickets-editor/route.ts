import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { ticketsSaveSchema, type TicketsSnapshot } from "@/lib/tickets-content";
import { retirePublishedMedia } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";
const messages: Record<string, string> = { INVALID_TICKETS_PAYLOAD: "Review the page fields and use a full HTTPS purchase link.", INVALID_TICKETS_MEDIA: "Choose an available graphic for this club.", TICKETS_CHANGED: "Someone changed Tickets. Your draft is still here. Reload the latest page before saving.", DESIGN_CHANGED: "The website design changed. Reload the page before saving.", OPERATION_REUSED: "This save could not be confirmed. Retry the original save.", NOT_AUTHORIZED: "You no longer have permission to edit Tickets.", PAGE_UNAVAILABLE: "This design does not publish this Tickets page.", DATABASE_OPERATION_FAILED: "We could not confirm the save. Your draft is still here." };
function failure(code: string, status: number) { return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } }, { status, headers: { "Cache-Control": "no-store" } }); }
async function handle(request: Request, mutation: boolean) {
    if (mutation) {
        const external = new URL(request.url);
        external.host = request.headers.get("host") ?? external.host;
        const origin = request.headers.get("origin");
        if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site")
            return failure("NOT_AUTHORIZED", 403);
    }
    let payload: z.infer<typeof ticketsSaveSchema> | undefined;
    const operationId = new URL(request.url).searchParams.get("operationId");
    if (mutation) {
        try {
            const parsed = ticketsSaveSchema.safeParse(await request.json());
            if (!parsed.success)
                return failure("INVALID_TICKETS_PAYLOAD", 400);
            payload = parsed.data;
        }
        catch {
            return failure("INVALID_TICKETS_PAYLOAD", 400);
        }
    }
    else if (operationId !== null && !z.uuid().safeParse(operationId).success)
        return failure("INVALID_TICKETS_PAYLOAD", 400);
    const client = await createClient();
    let userId: string;
    try {
        ({ userId } = await requireFreshClubSession(client));
    }
    catch (error) {
        return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
    }
    let club;
    try {
        club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId });
    }
    catch {
        return failure("NOT_AUTHORIZED", 403);
    }
    if (!club)
        return failure("NOT_AUTHORIZED", 403);
    const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
    try {
        if (mutation)
            await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "homepage", payload: payload! });
        else
            await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
    }
    catch {
        return failure("NOT_AUTHORIZED", 403);
    }
    try {
        const db = client.schema("onzio");
        const result = payload ? await db.rpc("save_tickets_editor", { p_club_id: club.id, p_request: payload }) : await db.rpc("load_tickets_editor", { p_club_id: club.id, p_operation_id: operationId ?? undefined });
        if (result.error) {
            const code = Object.hasOwn(messages, result.error.message) ? result.error.message : "DATABASE_OPERATION_FAILED";
            return failure(code, ["TICKETS_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"].includes(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "PAGE_UNAVAILABLE" ? 404 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
        }
        if (!result.data)
            return failure("DATABASE_OPERATION_FAILED", 500);
        const data = result.data as unknown as TicketsSnapshot;
        const committed = payload ? data : data.operation?.status === "committed" ? data.operation.receipt : null;
        if (committed) {
            let pending = false;
            await Promise.all((committed.retiredMediaAssetIds ?? []).map(assetId => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId }).then(r => { if (r.cleanupQueued)
                pending = true; }).catch(() => { pending = true; })));
            committed.cleanupPending = pending;
        }
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    }
    catch {
        return failure("DATABASE_OPERATION_FAILED", 500);
    }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
