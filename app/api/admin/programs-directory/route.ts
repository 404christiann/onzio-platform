import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { resolveMediaReferences } from "@/lib/media-assets";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ProgramDirectorySnapshot = {
  programs: Record<string, unknown>[];
  operation?: { status: "not-committed" } | { status: "committed"; receipt: ProgramDirectorySnapshot };
};
const programMediaReferences = [
  { assetId: "hero_media_asset_id", url: "hero_media_url" },
  { assetId: "detail_media_asset_id", url: "detail_media_url" },
];

const uuid = z.string().uuid();
const requestSchema = z.object({
  operationId: uuid,
  expected: z.array(z.object({ id: uuid, updatedAt: z.string().datetime({ offset: true }) }).strict()).max(200),
  programs: z.array(z.object({ id: uuid, sortOrder: z.number().int().nonnegative(), status: z.enum(["active", "hidden"]) }).strict()).max(200),
}).strict().superRefine((value, context) => {
  if (value.expected.length !== value.programs.length) context.addIssue({ code: "custom", path: ["programs"], message: "The program list changed." });
  for (const [index, item] of value.programs.entries()) if (item.sortOrder !== index) context.addIssue({ code: "custom", path: ["programs", index], message: "Program order is invalid." });
});

const messages: Record<string, string> = {
  CONTENT_CHANGED: "Someone changed the Programs directory. Your changes are still here. Reload and review the latest version.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  INVALID_PROGRAM_PAGE_PAYLOAD: "Review the program order and visibility before saving.",
  NOT_AUTHORIZED: "You no longer have permission to edit Programs.",
  PAGE_UNAVAILABLE: "This club does not have a public Programs page.",
  DATABASE_OPERATION_FAILED: "We could not confirm the save. Your changes are still here. Try again.",
};
function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? "We could not complete this request." } }, { status, headers: { "Cache-Control": "no-store" } });
}
function databaseFailure(error: { code?: string; message?: string }) {
  const code = [error.message, error.code].find((value) => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
  return failure(code, ["CONTENT_CHANGED", "OPERATION_REUSED"].includes(code) ? 409 : code === "NOT_AUTHORIZED" ? 403 : code === "DATABASE_OPERATION_FAILED" ? 500 : 400);
}
function sameOrigin(request: Request) {
  const external = new URL(request.url);
  external.host = request.headers.get("host") ?? external.host;
  const origin = request.headers.get("origin");
  return (!origin || origin === external.origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
async function handle(request: Request, mutation: boolean) {
  if (mutation && !sameOrigin(request)) return failure("NOT_AUTHORIZED", 403);
  let payload: z.infer<typeof requestSchema> | undefined;
  let operationId: string | null = null;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId && !uuid.safeParse(operationId).success) return failure("INVALID_PROGRAM_PAGE_PAYLOAD", 400);
  }
  const supabase = await createClient();
  let userId: string;
  try { ({ userId } = await requireFreshClubSession(supabase)); }
  catch (error) { const code = error instanceof ContractError ? error.code : "AUTHENTICATION_REQUIRED"; return failure(code, code === "AUTHENTICATION_REQUIRED" ? 401 : 403); }
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
    const onzio = supabase.schema("onzio") as unknown as { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: ProgramDirectorySnapshot | null; error: { code?: string; message?: string } | null }> };
    const result = mutation
      ? await onzio.rpc("save_program_directory", { p_club_id: club.id, p_request: payload! })
      : await onzio.rpc("load_program_directory", { p_club_id: club.id, p_operation_id: operationId });
    if (result.error) return databaseFailure(result.error);
    if (!result.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const receipt = result.data.operation?.status === "committed" ? result.data.operation.receipt : undefined;
    // Hydrate the RPC snapshots themselves so current rows and an older receipt
    // keep their own content and concurrency baselines.
    for (const snapshot of [result.data, ...(receipt ? [receipt] : [])]) {
      snapshot.programs = await resolveMediaReferences(
        snapshot.programs, club.id, programMediaReferences,
        onzio as unknown as Parameters<typeof resolveMediaReferences>[3],
      );
    }
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("DATABASE_OPERATION_FAILED", 500); }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
