import { NextResponse } from "next/server";
import { runBillingDriftAlert } from "@/lib/billing-drift";
import {
  runBillingLifecycle,
  signalLifecycleHeartbeat,
} from "@/lib/billing-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
    // Inside the try so a crash here pings `/fail` instead of going silent. The drift alert
    // never throws in practice and must not change the response, so it runs first and alone.
    await runBillingDriftAlert();
    const result = await runBillingLifecycle();
    const event = { event: "billing.lifecycle", ...result };
    if (result.divergences > 0) {
      console.error(JSON.stringify(event));
      await signalLifecycleHeartbeat("failure", "RECONCILIATION_DIVERGENCE");
      return NextResponse.json(
        { data: result, error: { code: "RECONCILIATION_DIVERGENCE" } },
        { status: 500 },
      );
    }

    await signalLifecycleHeartbeat("success", "BILLING_LIFECYCLE_CLEAN");
    console.log(JSON.stringify(event));
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "billing.lifecycle_failed" }));
    await signalLifecycleHeartbeat("failure", "BILLING_LIFECYCLE_FAILED");
    return NextResponse.json(
      { error: { code: "BILLING_LIFECYCLE_FAILED" } },
      { status: 500 },
    );
  }
}
