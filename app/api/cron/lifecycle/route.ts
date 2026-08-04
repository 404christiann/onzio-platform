import { NextResponse } from "next/server";
import {
  runBillingLifecycle,
  signalLifecycleHeartbeat,
} from "@/lib/billing-lifecycle";

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
    try {
      await signalLifecycleHeartbeat("failure", "BILLING_LIFECYCLE_FAILED");
    } catch {
      console.error(JSON.stringify({ event: "billing.lifecycle_heartbeat_failed" }));
    }
    return NextResponse.json(
      { error: { code: "BILLING_LIFECYCLE_FAILED" } },
      { status: 500 },
    );
  }
}
