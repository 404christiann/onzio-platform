import { NextResponse } from "next/server";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { codeSiteAdminFor } from "@/lib/code-site-admin";
import { ContractError } from "@/lib/contract-error";
import { retirePublishedMedia } from "@/lib/media-processing";
import {
  PROGRAMS_TRYOUTS_MESSAGES as messages,
  programsTryoutsRequestSchema,
  type ProgramsTryoutsRequest,
} from "@/lib/programs-tryouts-contract";
import { createClient } from "@/lib/supabase-server";

// ADMIN-RE-12c: every change the "Programs and tryouts" page makes. The club,
// session and role are resolved here from the host and the signed-in person
// (never from the request), and the RPCs (20261110180000_programs_tryouts_sign_up_state.sql)
// run through the person's own client, so RLS and can_mutate_content check
// again. A club whose website has no Programs page can't change programs here,
// and one without Tryouts can't change tryouts (decision 0005).

export const dynamic = "force-dynamic";

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

function failure(code: string, status: number) {
  return NextResponse.json(
    { error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function databaseFailure(error: { code?: string; message?: string }) {
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  const status = code === "CONTENT_CHANGED" || code === "OPERATION_REUSED" ? 409
    : code === "NOT_AUTHORIZED" ? 403
    : code === "DATABASE_OPERATION_FAILED" ? 500 : 400;
  return failure(code, status);
}

function featureOf(request: ProgramsTryoutsRequest): "programs" | "tryouts" {
  if (request.action === "save-tryout" || request.action === "delete-tryout") return "tryouts";
  if (request.action === "copy") return request.kind === "tryout" ? "tryouts" : "programs";
  return "programs";
}

/** Move up / Move down: swap with the neighbour through the directory save, which checks every row's last save. */
async function moveProgram(rpc: Rpc, onzio: ReturnType<Awaited<ReturnType<typeof createClient>>["schema"]>, clubId: string, request: Extract<ProgramsTryoutsRequest, { action: "move-program" }>) {
  const { data, error } = await onzio
    .from("programs")
    .select("id,updated_at,sort_order,status")
    .eq("club_id", clubId)
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  if (error) return { data: null, error };
  const rows = (data ?? []) as Array<{ id: string; updated_at: string; sort_order: number; status: string }>;
  const at = rows.findIndex((row) => row.id === request.id);
  const to = request.direction === "up" ? at - 1 : at + 1;
  if (at < 0) return { data: null, error: { message: "CONTENT_CHANGED" } };
  if (to < 0 || to >= rows.length) return { data: { moved: false }, error: null };
  const order = [...rows];
  [order[at], order[to]] = [order[to], order[at]];
  return rpc("save_program_directory", {
    p_club_id: clubId,
    p_request: {
      operationId: request.operationId,
      expected: rows.map((row) => ({ id: row.id, updatedAt: row.updated_at })),
      programs: order.map((row, index) => ({ id: row.id, sortOrder: index, status: row.status })),
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const external = new URL(request.url);
  external.host = request.headers.get("host") ?? external.host;
  if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return failure("NOT_AUTHORIZED", 403);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return failure("INVALID_SIGN_UP_PAYLOAD", 400); }
  const parsed = programsTryoutsRequestSchema.safeParse(body);
  if (!parsed.success) return failure("INVALID_SIGN_UP_PAYLOAD", 400);
  const input = parsed.data;

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
  const feature = featureOf(input);
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    await authorizeMutation({ club, userId, memberships, aal: "aal1", feature, payload: input as Record<string, unknown> });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }
  const site = codeSiteAdminFor(club);
  if (!site?.[feature].routeVisible) return failure("SECTION_UNAVAILABLE", 404);
  if (input.action === "copy" && input.kind === "program" && !site.programs.allowCreation) {
    return failure("COPY_UNAVAILABLE", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    const rpc = onzio.rpc.bind(onzio) as unknown as Rpc;
    const { action, operationId } = input;
    const result =
      action === "save-tryout" ? await rpc("save_tryout", { p_club_id: club.id, p_request: { operationId: operationId, id: input.id, expectedUpdatedAt: input.expectedUpdatedAt, tryout: input.tryout } })
      : action === "save-program" ? await rpc("save_program_sign_up", { p_club_id: club.id, p_request: { operationId: operationId, id: input.id, expectedUpdatedAt: input.expectedUpdatedAt, program: input.program } })
      : action === "copy" ? await rpc(input.kind === "program" ? "copy_program" : "copy_tryout", { p_club_id: club.id, p_request: { operationId: operationId, id: input.id } })
      : action === "delete-tryout" ? await rpc("delete_tryout", { p_club_id: club.id, p_request: { operationId: operationId, id: input.id, expectedUpdatedAt: input.expectedUpdatedAt } })
      : await moveProgram(rpc, onzio, club.id, input);
    if (result.error) return databaseFailure(result.error);
    const data = (result.data ?? {}) as Record<string, unknown>;
    if (action === "delete-tryout") {
      const retired = Array.isArray(data.retiredMediaAssetIds) ? (data.retiredMediaAssetIds as string[]) : [];
      delete data.retiredMediaAssetIds;
      // Retirement checks every other reference first and never blocks the answer.
      await Promise.all(retired.map((assetId) => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId })
        .catch((error) => { console.error("tryout media cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}
