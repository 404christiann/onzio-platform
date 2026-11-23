import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFreshClubSession } from "@/lib/auth-session";
import { authorizeAdminAccess } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { PUBLIC_PAGE_KEYS, parsePublicPageVisibility } from "@/lib/public-page-visibility";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// The owner's or an admin's "Visible to visitors" switch for one whole public page. The club comes from the
// verified host and the session, never from the request body; the database re-checks the caller, the key and
// that the club's design (cinematic@2) publishes these pages.

const requestSchema = z.object({ page: z.enum(PUBLIC_PAGE_KEYS), visible: z.boolean() }).strict();

function failure(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const external = new URL(request.url);
  external.host = request.headers.get("host") ?? external.host;
  const origin = request.headers.get("origin");
  if ((origin && origin !== external.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return failure("NOT_AUTHORIZED", 403);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("INVALID_PUBLIC_PAGE_VISIBILITY", 400);

  try {
    const supabase = await createClient();
    const { userId } = await requireFreshClubSession(supabase);
    const club = await getClubContext({ hostname: request.headers.get("host") ?? "", userId });
    const memberships = club.role ? [{ userId, clubId: club.id, role: club.role, status: "active" }] : [];
    await authorizeAdminAccess({ club, userId, memberships, aal: "aal1", capability: "content" });

    const { data, error } = await supabase.schema("onzio").rpc("set_public_page_visibility", {
      p_club_id: club.id,
      p_page_key: parsed.data.page,
      p_visible: parsed.data.visible,
    });
    if (error) {
      if (error.message === "INVALID_PUBLIC_PAGE_VISIBILITY") return failure("INVALID_PUBLIC_PAGE_VISIBILITY", 400);
      if (error.message === "PAGE_UNAVAILABLE") return failure("PAGE_UNAVAILABLE", 404);
      if (error.message === "NOT_AUTHORIZED" || error.code === "42501") return failure("NOT_AUTHORIZED", 403);
      return failure("PUBLIC_PAGE_VISIBILITY_FAILED", 500);
    }
    return NextResponse.json({ visibility: parsePublicPageVisibility(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof ContractError ? error.code : "PUBLIC_PAGE_VISIBILITY_FAILED";
    const status = code === "AUTHENTICATION_REQUIRED" || code === "SESSION_EXPIRED"
      ? 401
      : code === "UNKNOWN_TENANT" || code === "PAGE_UNAVAILABLE"
        ? 404
        : error instanceof ContractError
          ? 403
          : 500;
    return failure(code, status);
  }
}
