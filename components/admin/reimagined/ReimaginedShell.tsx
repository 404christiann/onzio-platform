"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import guided from "@/components/admin/AdminGuided.module.css";
import { useClubContext } from "@/components/ClubContextProvider";
import { useClubBranding } from "@/components/ClubBrandingProvider";
import ResilientNativeImage from "@/components/ResilientNativeImage";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getReimaginedPageTitle } from "@/lib/admin-route-manifest";
import {
  getAdminTab,
  isAdminTabPage,
  tabForPathname,
  type AdminTabId,
  type AdminTabTarget,
} from "@/lib/admin-tabs";
import { createClient } from "@/lib/supabase-browser";
import { AccountMenu } from "./AccountMenu";
import { TAB_ICONS } from "./tabIcons";
import { isPlainClick, TopBar, TopBarActionsProvider, useLeaveCheck, useTopBarTakenOver } from "./TopBar";
import styles from "./frame.module.css";

// ADMIN-RE-24: the frame around every page of the reimagined admin (design:
// admin-plain-search-two-clubs.html). Five tabs that follow the club: a bottom
// tab bar on a phone, a sidebar from 760px. Tabs are real links with
// aria-current; a red dot marks a tab that needs you (never Home). The account
// menu sits on the avatar. It replaces RE-05's top bar and More list. The old
// pages render inside it unchanged, under a page bar with "‹ <tab>". Some of
// them read the sidebar primitive's state (the homepage editor hides its panel
// while the phone menu is open), so the frame still provides it, always
// closed: these tabs never open as a drawer.

export type ShellTab = Readonly<{ id: AdminTabId; label: string; href: `/admin${string}` }>;

const KEEP_CLOSED = () => undefined;
const SHELL_STYLE = {
  "--admin-shell-header-height": "calc(56px + var(--admin-safe-area-top))",
} as React.CSSProperties;

export function ReimaginedShell({
  tabs,
  targets,
  dots,
  children,
}: {
  tabs: readonly ShellTab[];
  targets: readonly AdminTabTarget[];
  dots: readonly AdminTabId[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const club = useClubContext();
  const current = tabForPathname(pathname, targets);
  const onTabPage = isAdminTabPage(pathname);
  const back = useMemo(() => {
    const tab = tabs.find((candidate) => candidate.id === current) ?? getAdminTab("home");
    return { href: tab.href, label: tab.label };
  }, [current, tabs]);

  return (
    <TopBarActionsProvider back={back}>
      <SidebarProvider
        open={false}
        onOpenChange={KEEP_CLOSED}
        className={`admin-portal ${guided.portal} ${styles.frame}`}
        style={SHELL_STYLE}
        data-admin-shell="reimagined"
      >
        <Frame tabs={tabs} current={current} dots={dots} onTabPage={onTabPage} pathname={pathname} club={club}>
          {children}
        </Frame>
      </SidebarProvider>
    </TopBarActionsProvider>
  );
}

function Frame({
  tabs,
  current,
  dots,
  onTabPage,
  pathname,
  club,
  children,
}: {
  tabs: readonly ShellTab[];
  current: AdminTabId;
  dots: readonly AdminTabId[];
  onTabPage: boolean;
  pathname: string;
  club: ReturnType<typeof useClubContext>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { clubLogoUrl } = useClubBranding();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const leave = useLeaveCheck();
  const editing = useTopBarTakenOver();

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

  const crest = (
    <span className={styles.crest} aria-hidden="true">
      {clubLogoUrl ? (
        <ResilientNativeImage src={clubLogoUrl} alt="" />
      ) : (
        <span className={styles.crestInitials}>{initialsOf(club.name)}</span>
      )}
    </span>
  );
  const account = (placement: "side" | "top") => (
    <AccountMenu email={userEmail} role={club.role} onSignOut={handleSignOut} placement={placement} />
  );

  const tabLink = (tab: ShellTab, place: "side" | "bar") => {
    const on = tab.id === current;
    const [Outline, Solid] = TAB_ICONS[tab.id];
    const Icon = on ? Solid : Outline;
    const dot = dots.includes(tab.id);
    return (
      <Link
        key={tab.id}
        href={tab.href}
        aria-current={on && pathname === tab.href ? "page" : on ? "true" : undefined}
        className={`${styles.press} ${place === "side" ? styles.sideLink : styles.barLink}`}
        data-tab={tab.id}
        onClick={(event) => {
          if (isPlainClick(event) && leave(tab.href)) event.preventDefault();
        }}
      >
        <span className={styles.tabIcon}>
          <Icon aria-hidden="true" />
          {dot && place === "bar" ? <span className={styles.dot} /> : null}
        </span>
        <span className={styles.tabLabel}>{tab.label}</span>
        {dot ? <span className={place === "side" ? styles.sideDot : styles.srOnly}>needs you</span> : null}
      </Link>
    );
  };

  return (
    <>
      <aside className={styles.side}>
        <div className={styles.sideTop}>
          {crest}
          <span className={styles.clubText}>
            <b className={styles.clubName} title={club.name}>
              {club.name}
            </b>
            <small>Club admin</small>
          </span>
        </div>
        <nav aria-label="Club admin" className={styles.sideNav}>
          {tabs.map((tab) => tabLink(tab, "side"))}
        </nav>
        <div className={styles.sideFoot}>{account("side")}</div>
      </aside>

      <div className={styles.column}>
        <header className={styles.top}>
          {crest}
          <span className={styles.clubText}>
            <b className={styles.clubName} title={club.name} data-testid="admin-shell-club-name">
              {club.name}
            </b>
            <small>Club admin</small>
          </span>
          {account("top")}
        </header>
        {onTabPage ? null : <TopBar title={getReimaginedPageTitle(pathname)} />}
        <main
          className={styles.main}
          data-bare={onTabPage || undefined}
          data-editing={editing || undefined}
        >
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

      <nav aria-label="Club admin" className={styles.tabBar} data-count={tabs.length} hidden={editing}>
        {tabs.map((tab) => tabLink(tab, "bar"))}
      </nav>
    </>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C"
  );
}
