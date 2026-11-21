import { NextResponse } from "next/server";
import { runHeroVideoBackstop } from "@/lib/hero-video-swap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ error: { code: "CRON_AUTHENTICATION_REQUIRED" } }, { status: 401 });
}

/**
 * Daily backstop for hero videos whose admin tab closed before the swap.
 * A new route, not an extension of media-cleanup or media-orphan-sweep:
 * the orphan sweep is dry-run unless its own env says otherwise, and
 * media-cleanup's response is a fixed contract. This cron always does the work.
 * The swap RPCs run through supabase-service-role inside lib/hero-video-swap.ts.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) return unauthorized();

  try {
    const result = await runHeroVideoBackstop();
    if (result.failed > 0) {
      console.error(JSON.stringify({ event: "hero_video.backstop_incomplete", ...result }));
      return NextResponse.json({ data: result, error: { code: "HERO_VIDEO_BACKSTOP_INCOMPLETE" } }, { status: 500 });
    }
    console.log(JSON.stringify({ event: "hero_video.backstop", ...result }));
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "hero_video.backstop_failed" }));
    return NextResponse.json({ error: { code: "HERO_VIDEO_BACKSTOP_FAILED" } }, { status: 500 });
  }
}
