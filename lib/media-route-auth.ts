import { authorizeMutation } from "@/lib/authorization";
import { ContractError } from "@/lib/contract-error";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";
import type { MediaSurface } from "@/lib/storage-path";

export async function requireMediaRouteAuthorization(
  request: Request,
  surface: MediaSurface,
) {
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
  await authorizeMutation({
    club,
    userId: user.id,
    memberships,
    aal,
    feature: surface,
    payload: {},
  });

  return { supabase, user, club };
}
