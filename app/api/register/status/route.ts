import { NextResponse } from "next/server";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { hashRegistrationStatusToken } from "@/lib/registration-status-token";
import { readRegistrationStatus } from "@/lib/registration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const club = await getClubContext({
      hostname: request.headers.get("host") ?? "",
    });
    if (
      club.lifecycle !== "active" ||
      (club.publicAccess !== "live" && club.publicAccess !== "grace")
    ) {
      throw new ContractError("REGISTRATION_NOT_PUBLIC");
    }
    const status = await readRegistrationStatus(
      club.id,
      hashRegistrationStatusToken(token),
    );
    if (!status) return json({ error: "REGISTRATION_NOT_FOUND" }, 404);
    return json({ status });
  } catch (error) {
    const code = error instanceof ContractError
      ? error.code
      : "REGISTRATION_STATUS_FAILED";
    return json({ error: code }, error instanceof ContractError ? 400 : 500);
  }
}
