"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import styles from "./ClubSettings.module.css";

const brandingTab = { id: "branding", label: "Branding" };
const ownerTabs = [brandingTab, { id: "team", label: "Team access" }];
const adminTabs = [brandingTab];

export function ClubSettingsFrame({ active, actions, children }: {
  active: "branding" | "team";
  actions?: ReactNode;
  children: ReactNode;
}) {
  const owner = useClubContext().role === "owner";
  const router = useRouter();
  const requestNavigation = useUnsavedGuard();
  const visiblePanel = active === "branding" || owner;
  return (
    <AdminPage className={styles.page}>
      <AdminPageHeader
        title="Club settings"
        breadcrumb="Club settings"
        description="Your logo, footer and who can sign in."
        actions={actions}
      />
      {visiblePanel ? <AdminTabs
        tabsId="club-settings"
        label="Club settings"
        items={owner ? ownerTabs : adminTabs}
        value={visiblePanel ? active : "branding"}
        onChange={(id) => {
          if (id === active || (id === "team" && !owner)) return;
          const target = {
            kind: "switch" as const,
            label: id === "team" ? "Team access" : "Branding",
            opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
            continue: () => router.push(id === "team" ? "/admin/members" : "/admin/branding"),
          };
          requestNavigation(target);
        }}
      /> : <nav aria-label="Club settings"><Link href="/admin/branding" className={styles.action}>Branding</Link></nav>}
      <div
        className={styles.panels}
        role={visiblePanel ? "tabpanel" : undefined}
        id={visiblePanel ? `club-settings-panel-${active}` : undefined}
        aria-labelledby={visiblePanel ? `club-settings-tab-${active}` : undefined}
        tabIndex={visiblePanel ? 0 : undefined}
      >
        {children}
      </div>
      {owner && <div hidden id={`club-settings-panel-${active === "branding" ? "team" : "branding"}`} />}
    </AdminPage>
  );
}
