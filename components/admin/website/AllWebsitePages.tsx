"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ROUTE_ICONS } from "@/components/admin/adminRouteIcons";
import { PageFrame } from "@/components/admin/ui/editor-kit";
import { useAdminRouteAccess } from "@/components/AdminShell";
import { getWebsiteHubSections, type AdminRouteId } from "@/lib/admin-route-manifest";
import styles from "./AllWebsitePages.module.css";

/** One static line per page. No counts: those would need new reads. */
const DESCRIPTIONS: Partial<Record<AdminRouteId, string>> = {
  homepage: "Hero, results, slideshow and the sections of the front page",
  programs: "Programs visitors can join",
  tryouts: "Tryout dates and sign-up",
  shop: "Kits, store pages and the shop feature",
  about: "The club story and crest page",
  contact: "How visitors reach the club",
  news: "Articles and announcements",
  tickets: "Prices and the purchase link",
  "season-membership": "Benefits and the price table",
  "know-before-you-go": "Match-day tiles and the halftime raffle",
  stadium: "Seating, story and directions",
  "foothill-transit": "The bus route page",
  "chick-fil-a": "Food and beverage offer",
  policies: "Guidelines and the fan code",
  sponsors: "Sponsor logos and links",
  partners: "Partner logos and links",
  "injury-report": "Player availability",
};

export function AllWebsitePages() {
  const access = useAdminRouteAccess();
  const sections = useMemo(() => getWebsiteHubSections(access), [access]);

  return (
    <PageFrame
      title="All website pages"
      breadcrumb={[{ label: "Website" }]}
      description="Everything visitors can see on the site, in the same groups as the menu."
    >
      {sections.length === 0 ? (
        <p className={styles.empty}>There are no website pages to show.</p>
      ) : (
        <div className={styles.groups}>
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`hub-${section.id}`} data-hub-section={section.id}>
              <h2 id={`hub-${section.id}`} className={styles.heading}>{section.label}</h2>
              <ul className={styles.grid}>
                {section.routes.map((route) => {
                  const Icon = ROUTE_ICONS[route.iconKey];
                  return (
                    <li key={route.id}>
                      <Link href={route.href} className={`admin-press ${styles.card}`} data-hub-page={route.id}>
                        <span className={styles.icon}><Icon size={20} aria-hidden="true" /></span>
                        <span className={styles.text}>
                          <span className={styles.name}>{route.label}</span>
                          <span className={styles.description}>{DESCRIPTIONS[route.id] ?? ""}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageFrame>
  );
}
