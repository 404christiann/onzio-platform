"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClubContext } from "@/components/ClubContextProvider";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { PageFrame, type PageFrameProps } from "@/components/admin/ui/editor-kit";
import { useUnsavedGuard } from "@/components/admin/ui/useUnsavedGuard";
import styles from "../ClubSettings.module.css";
import rose from "./RoseCity.module.css";

const brandingTab = { id: "branding", label: "Branding" };
const ownerTabs = [brandingTab, { id: "team", label: "Team access" }];

type SaveProps = Pick<PageFrameProps, "state" | "onSave" | "onRetry" | "onDiscard" | "notice">;

/**
 * Rose City's Club settings: the editor-kit page frame with the same two tabs as ClubSettingsFrame. Branding passes
 * the page Save; Team access passes none (it acts straight away). Switching tabs goes through the unsaved guard.
 */
export function RoseCityFrame({ active, children, ...save }: { active: "branding" | "team"; children: ReactNode } & SaveProps) {
  const owner = useClubContext().role === "owner";
  const router = useRouter();
  const requestNavigation = useUnsavedGuard();
  const visiblePanel = active === "branding" || owner;
  return (
    <PageFrame title="Club settings" description="Your logo, footer links and who can sign in." {...save}>
      {visiblePanel ? <AdminTabs
        tabsId="club-settings"
        label="Club settings"
        items={owner ? ownerTabs : [brandingTab]}
        value={active}
        onChange={(id) => {
          if (id === active || (id === "team" && !owner)) return;
          requestNavigation({
            kind: "switch",
            label: id === "team" ? "Team access" : "Branding",
            opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
            continue: () => router.push(id === "team" ? "/admin/members" : "/admin/branding"),
          });
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
        {active === "team" && owner && (
          // A link only: Payments (Stripe checkout and portal) is untouched.
          <section className={rose.card} aria-labelledby="payments-link-heading">
            <div className={rose.payments}>
              <div>
                <h2 id="payments-link-heading">Payments</h2>
                <p>Your Onzio subscription and billing are on the Payments page.</p>
              </div>
              <Link className={rose.paymentsLink} href="/admin/payments">Open Payments</Link>
            </div>
          </section>
        )}
      </div>
      {owner && <div hidden id={`club-settings-panel-${active === "branding" ? "team" : "branding"}`} />}
    </PageFrame>
  );
}
