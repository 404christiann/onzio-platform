import { NextResponse } from "next/server";
import { applyBunnyStreamWebhook } from "@/lib/hero-video-swap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bunny Stream library webhook. The signing secret is BUNNY_STREAM_WEBHOOK_SECRET
 * (the library Read-Only API key). The swap RPCs run through supabase-service-role
 * inside lib/hero-video-swap.ts, which is why this route is on the service-role allowlist.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await applyBunnyStreamWebhook({
      rawBody,
      signature: request.headers.get("x-bunnystream-signature"),
      version: request.headers.get("x-bunnystream-signature-version"),
      algorithm: request.headers.get("x-bunnystream-signature-algorithm"),
    });
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch (error) {
    console.error("hero video webhook failed", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "WEBHOOK_FAILED" }, { status: 500 });
  }
}
