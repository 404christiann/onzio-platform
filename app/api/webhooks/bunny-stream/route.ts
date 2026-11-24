import { NextResponse } from "next/server";
import { applyBunnyStreamWebhook } from "@/lib/hero-video-swap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Going live now also fetches the video's still and runs it through the image pipeline (RC-HERO-POSTER).
export const maxDuration = 60;

/**
 * Bunny Stream library webhook. The signing secret is BUNNY_STREAM_WEBHOOK_SECRET
 * (the library Read-Only API key). The swap RPCs run through supabase-service-role
 * inside lib/hero-video-swap.ts, which is why this route is on the service-role allowlist.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await applyBunnyStreamWebhook({
    rawBody,
    signature: request.headers.get("x-bunnystream-signature"),
    version: request.headers.get("x-bunnystream-signature-version"),
    algorithm: request.headers.get("x-bunnystream-signature-algorithm"),
  }).catch((error) => {
    console.error("hero video webhook failed", { error: error instanceof Error ? error.name : "unknown" });
    return { httpStatus: 500, body: { error: "WEBHOOK_FAILED" } };
  });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
