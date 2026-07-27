import { authorizeAdminAccess } from "@/lib/authorization";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export async function requireBillingRouteAuthorization(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ContractError("AUTHENTICATION_REQUIRED");

  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = assurance?.currentLevel === "aal2" ? "aal2" : "aal1";
  const club = await getClubContext({
    hostname: request.headers.get("host") ?? "",
    userId: user.id,
  });
  const memberships = club.role
    ? [
        {
          userId: user.id,
          clubId: club.id,
          role: club.role,
          status: "active",
        },
      ]
    : [];

  await authorizeAdminAccess({
    club,
    userId: user.id,
    memberships,
    aal,
    capability: "billing",
  });

  return { supabase, user, club };
}

