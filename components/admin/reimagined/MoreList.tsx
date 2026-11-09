import Link from "next/link";
import {
  ChevronRight,
  IconAbout,
  IconAnalytics,
  IconBranding,
  IconContact,
  IconDashboard,
  IconHomepage,
  IconMatchStats,
  IconPayments,
  IconPrograms,
  IconRegistrations,
  IconRoster,
  IconSchedule,
  IconSeasons,
  IconSeasonStats,
  IconShop,
  IconSponsors,
  IconStandings,
  IconTeamAccess,
  IconTryouts,
  type AdminIconComponent,
} from "@/components/admin/icons";
import type { AdminMoreRow, AdminRouteIconKey } from "@/lib/admin-route-manifest";
import styles from "./reimagined.module.css";

// ADMIN-RE-05: the quieter pages, in neutral tiles; color stays with the big
// jobs. Each row keeps the icon its page has in the classic admin.
const ROUTE_ICONS: Record<AdminRouteIconKey, AdminIconComponent> = {
  dashboard: IconDashboard,
  homepage: IconHomepage,
  programs: IconPrograms,
  tryouts: IconTryouts,
  shop: IconShop,
  about: IconAbout,
  sponsors: IconSponsors,
  contact: IconContact,
  seasons: IconSeasons,
  roster: IconRoster,
  schedule: IconSchedule,
  "match-stats": IconMatchStats,
  "season-stats": IconSeasonStats,
  standings: IconStandings,
  registrations: IconRegistrations,
  analytics: IconAnalytics,
  branding: IconBranding,
  "team-access": IconTeamAccess,
  payments: IconPayments,
};

export function MoreList({ rows }: { rows: readonly AdminMoreRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.more} aria-labelledby="admin-home-more">
      <h2 id="admin-home-more" className={styles.moreTitle}>
        More
      </h2>
      <ul className={styles.moreList}>
        {rows.map((row) => {
          const Icon = ROUTE_ICONS[row.iconKey];
          return (
            <li key={row.id}>
              <Link href={row.href} className={styles.moreRow} data-more-row={row.id}>
                <span className={styles.moreIcon}>
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
                <span className={styles.moreLabel}>{row.label}</span>
                <ChevronRight className={`size-4 ${styles.moreGo}`} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
