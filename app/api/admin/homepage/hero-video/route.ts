import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess, authorizeMutation } from "@/lib/authorization";
import { isBunnyStreamConfigured } from "@/lib/bunny-stream";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import {
  finalizeHeroVideo,
  getHeroVideoState,
  HeroVideoError,
  revertHeroVideo,
  startHeroVideoUpload,
} from "@/lib/hero-video-swap";
import { homepageRendererForClub, resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const guid = z.string().uuid().refine((value) => value === value.toLowerCase());
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), fileName: z.string().min(1).max(200), fileSize: z.number().int(), mimeType: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("finalize"), videoGuid: guid }).strict(),
  z.object({ action: z.literal("revert"), expectedLiveGuid: z.union([guid, z.literal("")]), targetGuid: guid }).strict(),
]);

const messages: Record<string, string> = {
  NOT_AUTHORIZED: "You no longer have permission to change the homepage video.",
  AUTHENTICATION_REQUIRED: "Sign in again to change the homepage video.",
  UNKNOWN_TENANT: "We could not find this club.",
  INVALID_HERO_VIDEO_REQUEST: "Check the video details and try again.",
  HERO_VIDEO_NOT_AVAILABLE: "Hero video replacement is not available for this website design.",
  VIDEO_NOT_CONFIGURED: "Video uploads are not set up yet. Contact Onzio.",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function failure(code: string, status: number, message?: string) {
  return json({ code, message: message ?? messages[code] ?? "We could not complete this request. Try again." }, status);
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
  let payload: z.infer<typeof bodySchema> | undefined;
  if (mutation) {
    let body: unknown;
    try { body = await request.json(); } catch { return failure("INVALID_HERO_VIDEO_REQUEST", 400); }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return failure("INVALID_HERO_VIDEO_REQUEST", 400);
    payload = parsed.data;
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
  const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
  try {
    if (payload) await authorizeMutation({ club, userId, memberships, aal: "aal1", feature: "homepage", payload });
    else await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });
  } catch (error) {
    return failure(error instanceof ContractError ? error.code : "NOT_AUTHORIZED", 403);
  }
  // Same resolver the editor uses; if it cannot answer, the answer is no.
  let replaceable = false;
  try { replaceable = resolveHomepageCapabilities(homepageRendererForClub(club)).heroVideoReplaceable === true; } catch { replaceable = false; }
  if (!replaceable) return failure("HERO_VIDEO_NOT_AVAILABLE", 404);

  try {
    if (!payload) return json(await getHeroVideoState(club.id));
    if (payload.action === "revert") {
      return json(await revertHeroVideo(club.id, { expectedLiveGuid: payload.expectedLiveGuid, targetGuid: payload.targetGuid }));
    }
    if (!isBunnyStreamConfigured()) return failure("VIDEO_NOT_CONFIGURED", 503);
    if (payload.action === "start") {
      return json(await startHeroVideoUpload(club.id, { fileName: payload.fileName, fileSize: payload.fileSize, mimeType: payload.mimeType }));
    }
    const result = await finalizeHeroVideo(club.id, payload.videoGuid);
    return json(result.body, result.httpStatus);
  } catch (error) {
    if (error instanceof HeroVideoError) return failure(error.code, error.status, error.message);
    console.error("hero video request failed", { clubId: club.id, error: error instanceof Error ? error.name : "unknown" });
    return failure("HERO_VIDEO_UNAVAILABLE", 502, "We could not reach the video service. Try again.");
  }
}

export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
