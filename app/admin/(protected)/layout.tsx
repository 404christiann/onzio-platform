import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { getClubContext } from "@/lib/club-context";
import { createClient } from "@/lib/supabase-server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") {
    redirect("/admin/login?error=mfa_required");
  }

  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId: user.id,
  }).catch(() => null);
  if (
    !club ||
    club.lifecycle === "archived" ||
    (club.role !== "owner" && club.role !== "admin")
  ) {
    redirect("/admin/login?error=not_authorized");
  }

  return <AdminShell>{children}</AdminShell>;
}
