import { authorizeAdminAccess } from "@/lib/authorization";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { failContract } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export async function requireBillingRouteAuthorization(request: Request) {
  const supabase = await createClient();
  const { userId, claims } = await requireFreshClubSession(supabase);
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId,
  });
  const memberships = club.role
    ? [
        {
          userId,
          clubId: club.id,
          role: club.role,
          status: "active",
        },
      ]
    : [];

  await authorizeAdminAccess({
    club,
    userId,
    memberships,
    aal: "aal1",
    capability: "billing",
  });

  if (typeof claims.session_id !== "string") {
    failContract("AUTHENTICATION_REQUIRED");
  }

  return {
    supabase,
    user: {
      id: userId,
      email: typeof claims.email === "string" ? claims.email : undefined,
      sessionId: claims.session_id,
    },
    club,
  };
}
