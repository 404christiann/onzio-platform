import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { NEWS_LIMITS, newsArticleSaveSchema, type NewsArticleSave } from "@/lib/cinematic-news";
import { ContractError } from "@/lib/contract-error";
import { retirePublishedMedia } from "@/lib/media-processing";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  PAGE_UNAVAILABLE: "This website design does not publish News.",
  INVALID_CINEMATIC_NEWS_PAYLOAD: "Review the article fields and the button link.",
  NEWS_COVER_INVALID: "Upload the cover photo again before saving.",
  NEWS_ARTICLE_NOT_FOUND: "This article no longer exists. Reload News.",
  NEWS_LIMIT_REACHED: `News can show ${NEWS_LIMITS.liveArticles} articles at once. Remove one before adding or restoring another.`,
  CINEMATIC_NEWS_CHANGED: "Another editor changed this article. Reload News before saving again.",
  OPERATION_REUSED: "This save could not be confirmed. Check its status before trying again.",
  NOT_AUTHORIZED: "You no longer have permission to edit News.",
  DATABASE_OPERATION_FAILED: "The News save could not be confirmed.",
};
const STATUS: Record<string, number> = { CINEMATIC_NEWS_CHANGED: 409, OPERATION_REUSED: 409, NOT_AUTHORIZED: 403, PAGE_UNAVAILABLE: 404, NEWS_ARTICLE_NOT_FOUND: 404, NEWS_LIMIT_REACHED: 409, DATABASE_OPERATION_FAILED: 500 };

function failure(code: string, status: number) {
  return NextResponse.json({ error: { code, message: messages[code] ?? messages.DATABASE_OPERATION_FAILED } },
    { status, headers: { "Cache-Control": "no-store" } });
}

type Committed = { retiredMediaAssetIds?: unknown };

async function handle(request: Request, mutation: boolean) {
  let payload: NewsArticleSave | null = null;
  let operationId: string | null = null;
  if (mutation) {
    const origin = request.headers.get("origin");
    const external = new URL(request.url);
    external.host = request.headers.get("host") ?? external.host;
    if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") return failure("NOT_AUTHORIZED", 403);
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_CINEMATIC_NEWS_PAYLOAD", 400); }
    const parsed = newsArticleSaveSchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_CINEMATIC_NEWS_PAYLOAD", 400);
    payload = parsed.data;
  } else {
    operationId = new URL(request.url).searchParams.get("operationId");
    if (operationId !== null && !z.uuid().safeParse(operationId).success) return failure("INVALID_CINEMATIC_NEWS_PAYLOAD", 400);
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
    if (mutation) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "news", payload: payload! });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }

  try {
    const onzio = supabase.schema("onzio");
    const rpc = onzio.rpc.bind(onzio) as unknown as (name: string, args: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
    const response = mutation
      ? await rpc("save_cinematic_news_article", { p_club_id: club.id, p_request: payload })
      : await rpc("load_cinematic_news_editor", { p_club_id: club.id, p_operation_id: operationId });
    if (response.error) {
      if (process.env.NODE_ENV !== "production") console.error("News editor database error", response.error);
      const code = [response.error.message, response.error.code].find(value => value && Object.hasOwn(messages, value)) ?? "DATABASE_OPERATION_FAILED";
      return failure(code, STATUS[code] ?? 400);
    }
    if (!response.data) return failure("DATABASE_OPERATION_FAILED", 500);
    const data = response.data as Committed & { operation?: { status: string; receipt?: Committed } };
    const committed = mutation ? data : data.operation?.status === "committed" ? data.operation.receipt : undefined;
    if (committed) {
      const retired = Array.isArray(committed.retiredMediaAssetIds) ? committed.retiredMediaAssetIds : [];
      delete committed.retiredMediaAssetIds;
      // A cover still used elsewhere is kept; cleanup failure never undoes the committed save.
      await Promise.all(retired.map(assetId => retirePublishedMedia({ clubId: club.id, actorId: userId, assetId: String(assetId) })
        .catch(error => { console.error("News cover cleanup failed", { clubId: club.id, assetId, error }); })));
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("News editor request failed", error);
    return failure("DATABASE_OPERATION_FAILED", 500);
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
