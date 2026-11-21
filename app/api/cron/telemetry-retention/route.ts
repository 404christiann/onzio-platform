import { NextResponse } from "next/server";
import { runTelemetryRetention } from "@/lib/telemetry/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One database call: it deletes at most 100,000 raw events, 5,000 at a time.
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
    const result = await runTelemetryRetention();
    console.log(JSON.stringify({ event: "telemetry.retention_run", ...result }));
    if (result.moreEventsRemain) {
      // Not a failure: the next daily run continues. It is logged so a persistent backlog is visible.
      console.warn(JSON.stringify({ event: "telemetry.retention_backlog", eventsDeleted: result.eventsDeleted }));
    }
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "telemetry.retention_failed" }));
    return NextResponse.json(
      { error: { code: "TELEMETRY_RETENTION_FAILED" } },
      { status: 500 },
    );
  }
}
