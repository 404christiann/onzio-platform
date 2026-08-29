import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { requireFreshClubSession } from "@/lib/auth-session";
import {
  ADMIN_THEME_COOKIE_NAME,
  resolveAdminTheme,
} from "@/lib/admin-theme";
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

  const cookieStore = await cookies();
  const initialTheme = resolveAdminTheme(
    cookieStore.get(ADMIN_THEME_COOKIE_NAME)?.value,
  );

  return (
    <AdminThemeProvider initialTheme={initialTheme}>
      <AdminShell>{children}</AdminShell>
    </AdminThemeProvider>
  );
}
