import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Tenant requests are rewritten to /_clubs/{slug}/club-logo by middleware.
// Reaching this compatibility route means tenant resolution was bypassed.
export async function GET() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
