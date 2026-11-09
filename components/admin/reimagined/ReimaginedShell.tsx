"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import guided from "@/components/admin/AdminGuided.module.css";
import { AdminAccountMenu } from "@/components/admin/AdminAccountMenu";
import { useClubContext } from "@/components/ClubContextProvider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getReimaginedPageTitle } from "@/lib/admin-route-manifest";
import { createClient } from "@/lib/supabase-browser";
import { TopBar, TopBarActionsProvider } from "./TopBar";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the shell for clubs whose admin_portal is "reimagined". No
// sidebar: the home is the way around, and every other page has the slim top
// bar back to it. The old pages render inside it unchanged until their slice
// replaces them. Some of those pages read the sidebar's state (the homepage
// editor hides its panel while the phone menu is open), so the shell still
// provides it, always closed: there is no sidebar to open.

const KEEP_CLOSED = () => undefined;
const SHELL_STYLE = {
  "--admin-shell-header-height": "calc(56px + var(--admin-safe-area-top))",
} as React.CSSProperties;

export function ReimaginedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const club = useClubContext();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // The same predicate the home page and the Payments page use.
  const isBillingAuthorized = club.role === "owner" && club.lifecycle !== "archived";

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
      <SidebarProvider
        open={false}
        onOpenChange={KEEP_CLOSED}
        className={`admin-portal ${guided.portal} ${styles.shell} flex-col`}
        style={SHELL_STYLE}
        data-admin-shell="reimagined"
      >
        <TopBar
          home={isHome}
          title={getReimaginedPageTitle(pathname)}
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
      </SidebarProvider>
    </TopBarActionsProvider>
  );
}
