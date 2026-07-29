import { NextResponse } from "next/server";
import { cleanupAbandonedStagingMedia } from "@/lib/media-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const result = await cleanupAbandonedStagingMedia();
    const event = { event: "media.staging_cleanup", ...result };

    if (result.failed > 0) {
      console.error(JSON.stringify(event));
      return NextResponse.json(
        {
          data: result,
          error: { code: "MEDIA_STAGING_CLEANUP_INCOMPLETE" },
        },
        { status: 500 },
      );
    }

    console.log(JSON.stringify(event));
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(
      JSON.stringify({ event: "media.staging_cleanup_failed" }),
    );
    return NextResponse.json(
      { error: { code: "MEDIA_STAGING_CLEANUP_FAILED" } },
      { status: 500 },
    );
  }
}
