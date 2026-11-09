"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import guided from "@/components/admin/AdminGuided.module.css";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { useClubContext } from "@/components/ClubContextProvider";
import {
  getReimaginedPageTitle,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-browser";
import { TopBar, TopBarActionsProvider } from "./TopBar";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the shell for clubs whose admin_portal is "reimagined". No
// sidebar: the home is the way around, and every other page has the slim top
// bar back to it. The old pages render inside it unchanged until their slice
// replaces them.

export function ReimaginedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const club = useClubContext();
  const portal = useAdminPortal();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // The same predicates the home page and the Payments page use.
  const isBillingAuthorized = club.role === "owner" && club.lifecycle !== "archived";
  const canMutateContent =
    club.lifecycle === "onboarding" ||
    (club.lifecycle === "active" &&
      (club.kind === "demo" ||
        club.kind === "test" ||
        club.publicAccess === "live" ||
        club.publicAccess === "grace"));

  const accessContext = useMemo<AdminRouteAccessContext>(
    () => ({
      role: club.role,
      presentationTemplateKey: club.presentationTemplateKey,
      isBillingAuthorized,
      canMutateContent,
      storeEnabled: club.storeEnabled,
      adminPortal: portal.portal,
      adminFlags: portal.flags,
    }),
    [
      canMutateContent,
      club.presentationTemplateKey,
      club.role,
      club.storeEnabled,
      isBillingAuthorized,
      portal.flags,
      portal.portal,
    ],
  );

  useEffect(() => {
    void createClient()
      .auth.getUser()
      .then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const isHome = pathname === "/admin";

  return (
    <TopBarActionsProvider>
      <div
        className={`admin-portal ${guided.portal} ${styles.shell}`}
        data-admin-shell="reimagined"
      >
        <TopBar
          home={isHome}
          title={getReimaginedPageTitle(pathname, accessContext)}
          account={<AdminAccountMenu email={userEmail} role={club.role} onSignOut={handleSignOut} />}
        />
        <main className={styles.main}>
          {club.kind === "customer" && club.publicAccess === "grace" ? (
            <div className={`${styles.notice} border border-billing-warning bg-billing-warning-soft text-billing-warning-foreground`}>
              Billing needs attention. You can keep changing your website while it is sorted out.
              {isBillingAuthorized ? (
                <>
                  {" "}
                  <Link href="/admin/payments" className="font-semibold underline underline-offset-2">
                    Review payment details
                  </Link>
                  .
                </>
              ) : null}
            </div>
          ) : null}
          {club.kind === "customer" && club.publicAccess === "suspended" ? (
            <div className={`${styles.notice} border border-destructive/30 bg-destructive/10 text-destructive`}>
              Changes to your website are paused while billing is suspended.
              {isBillingAuthorized ? (
                <>
                  {" "}
                  <Link href="/admin/payments" className="font-semibold underline underline-offset-2">
                    Review payment details
                  </Link>
                  .
                </>
              ) : (
                " Ask a club owner to sort out payment."
              )}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </TopBarActionsProvider>
  );
}
