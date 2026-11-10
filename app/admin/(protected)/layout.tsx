import type { Viewport } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { ReimaginedShell } from "@/components/admin/reimagined/ReimaginedShell";
import { requireFreshClubSession } from "@/lib/auth-session";
import { readAdminPortal } from "@/lib/admin-portal";
import { loadAdminHomeData } from "@/lib/admin-home-data";
import { adminAccessFor } from "@/lib/admin-tab-page";
import { getAdminTabDots, getAdminTabTargets, getVisibleAdminTabs } from "@/lib/admin-tabs";
import {
  ADMIN_THEME_COOKIE_NAME,
  resolveAdminTheme,
} from "@/lib/admin-theme";
import { getClubContext } from "@/lib/club-context";
import { ContractError } from "@/lib/contract-error";
import { createClient } from "@/lib/supabase-server";

// App-like viewport behavior is protected-only; public and OTP pages retain
// their existing browser presentation. Zoom remains available.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

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

  // ADMIN-RE-02: fail-safe; any read problem keeps the classic admin.
  const portal = await readAdminPortal(supabase, club.id);

  const cookieStore = await cookies();
  const initialTheme = resolveAdminTheme(
    cookieStore.get(ADMIN_THEME_COOKIE_NAME)?.value,
  );

  // ADMIN-RE-24: the tabs follow the club, and a red dot marks a tab that
  // needs you. Counts are read fail-safe: a failed read shows no dot.
  let shell: React.ComponentProps<typeof ReimaginedShell> | null = null;
  if (portal.portal === "reimagined") {
    const needs = await loadAdminHomeData(supabase, club.id, portal.timeZone).catch(() => null);
    const access = adminAccessFor(club, portal, needs?.hasLiveSignUps ?? false);
    const tabs = getVisibleAdminTabs(access);
    shell = {
      tabs: tabs.map(({ id, label, href }) => ({ id, label, href })),
      targets: getAdminTabTargets(access),
      dots: getAdminTabDots(tabs, needs ?? { gamesNeedingScore: null, newSignUps: null }),
      children: null,
    };
  }

  return (
    <AdminThemeProvider initialTheme={initialTheme}>
      <AdminPortalProvider settings={portal} isOwner={club.role === "owner"}>
        {/* ADMIN-RE-05: the club's admin_portal picks the shell; classic on any doubt. */}
        {shell ? (
          <ReimaginedShell tabs={shell.tabs} targets={shell.targets} dots={shell.dots}>
            {children}
          </ReimaginedShell>
        ) : (
          <AdminShell>{children}</AdminShell>
        )}
      </AdminPortalProvider>
    </AdminThemeProvider>
  );
}
