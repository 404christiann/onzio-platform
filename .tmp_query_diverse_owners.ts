import { config } from "dotenv";
import { createServiceRoleClient } from "./lib/supabase-service-role";

async function main() {
  config({ path: ".env.local" });

  const service = createServiceRoleClient().schema("onzio");

  const { data: clubs, error: clubsError } = await service
    .from("clubs")
    .select("id,slug,name");

  if (clubsError) {
    console.error("clubs_query_failed", clubsError.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ totalClubs: clubs?.length ?? 0, clubs: (clubs ?? []).map((c) => ({ id: c.id, slug: c.slug })) }, null, 2));

  const targetId = "d88bf71b-9820-49ae-9dc0-7556b0813885";
  const { data: target, error: targetError } = await service
    .from("clubs")
    .select("id,slug,name,lifecycle")
    .eq("id", targetId)
    .maybeSingle();

  if (targetError) {
    console.error("target_query_error", targetError.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ target }, null, 2));

  if (target) {
    const { data: owners, error: ownersError } = await service
      .from("club_members")
      .select("user_id")
      .eq("club_id", target.id)
      .eq("role", "owner")
      .eq("status", "active");

    if (ownersError) {
      console.error("owners_error", ownersError.message);
      process.exit(1);
    }

    const authAdmin = createServiceRoleClient();
    const ownerEmails = [] as { userId: string; email: string | undefined }[];
    for (const owner of owners ?? []) {
      const userLookup = await authAdmin.auth.admin.getUserById(owner.user_id);
      ownerEmails.push({ userId: owner.user_id, email: userLookup.data.user?.email });
    }

    console.log(JSON.stringify({ ownerEmails }, null, 2));
  }
}

void main();
