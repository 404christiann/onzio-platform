import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { requireFreshClubSession } from "@/lib/auth-session";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  let userId: string;
  try {
    ({ userId } = await requireFreshClubSession(supabase));
  } catch (error) {
    if (error instanceof ContractError && error.code === "SESSION_EXPIRED") {
      await supabase.auth.signOut();
      redirect("/admin/login?error=session_expired");
    }
    redirect("/admin/login");
  }

  const requestHeaders = await headers();
  const club = await getClubContext({
    hostname: requestHeaders.get("host") ?? "",
    userId,
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
