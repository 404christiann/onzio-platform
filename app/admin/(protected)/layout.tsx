import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import {
  ADMIN_THEME_COOKIE_NAME,
  resolveAdminTheme,
} from "@/lib/admin-theme";
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

  // Only used for this layout's own role/lifecycle gate below -- the
  // ancestor app/admin/layout.tsx already resolves club context and mounts
  // ClubContextProvider/ClubBrandingProvider for AdminShell to consume, so
  // this result isn't re-provided here (that would create a second,
  // independent tenant-data source for the same request).
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
