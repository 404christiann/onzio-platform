import { NextResponse } from "next/server";
import { requireBillingRouteAuthorization } from "@/lib/billing-route-auth";

// The sidebar needs only a boolean. The owner decision is derived from the
// verified tenant and current session; no allowlist or tenant input is exposed.
export async function GET(request: Request) {
  try {
    await requireBillingRouteAuthorization(request);
    return NextResponse.json({ isBillingAdmin: true });
  } catch {
    return NextResponse.json({ isBillingAdmin: false });
  }
}

