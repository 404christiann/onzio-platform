import { NextResponse } from "next/server";
import { expirePendingRegistrations } from "@/lib/registration-service";

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
    const result = await expirePendingRegistrations();
    const event = { event: "registration.expiry_sweep", ...result };
    if (result.failed > 0) {
      console.error(JSON.stringify(event));
      return NextResponse.json(
        {
          data: result,
          error: { code: "REGISTRATION_EXPIRY_INCOMPLETE" },
        },
        { status: 500 },
      );
    }
    console.log(JSON.stringify(event));
    return NextResponse.json({ data: result, error: null });
  } catch {
    console.error(JSON.stringify({ event: "registration.expiry_sweep_failed" }));
    return NextResponse.json(
      { error: { code: "REGISTRATION_EXPIRY_FAILED" } },
      { status: 500 },
    );
  }
}
