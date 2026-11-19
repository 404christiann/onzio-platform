import { NextResponse } from "next/server";
import { runMediaOrphanSweep } from "@/lib/media-orphan-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The scan is one database call; enforce adds at most 50 copy/retire/remove rounds
// and a bounded trash purge.
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json(
    { error: { code: "CRON_AUTHENTICATION_REQUIRED" } },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return unauthorized();
  }

  try {
    const result = await runMediaOrphanSweep();
    if (result.failed > 0) {
      console.error(JSON.stringify({ event: "media.orphan_sweep_incomplete", ...result }));
      return NextResponse.json(
        { data: result, error: { code: "MEDIA_ORPHAN_SWEEP_INCOMPLETE" } },
        { status: 500 },
      );
    }
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "media.orphan_sweep_failed" }));
    return NextResponse.json(
      { error: { code: "MEDIA_ORPHAN_SWEEP_FAILED" } },
      { status: 500 },
    );
  }
}
