import { NextResponse } from "next/server";
import { runTelemetryRollup } from "@/lib/telemetry/rollup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One database call: it rebuilds the last 3 club-local days of rollups for every club with events in them.
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
    const result = await runTelemetryRollup();
    console.log(JSON.stringify({ event: "telemetry.rollup_run", ...result }));
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "telemetry.rollup_failed" }));
    return NextResponse.json(
      { error: { code: "TELEMETRY_ROLLUP_FAILED" } },
      { status: 500 },
    );
  }
}
