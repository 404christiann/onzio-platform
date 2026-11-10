import Link from "next/link";
import { ChevronRight, type AdminIconComponent } from "@/components/admin/icons";
import type { AdminMoreRow } from "@/lib/admin-route-manifest";
import { ROUTE_ICONS } from "./MoreList";
import styles from "./frame.module.css";

// ADMIN-RE-24: a tab's own page. Every tab reads the same way (design:
// admin-plain-search-two-clubs.html): the heading, a status pill, the tab's
// main buttons, then its pages. Server rendered; each page under
// app/admin/(protected)/<tab>/page.tsx loads its data and passes it in.

export type TabPill = Readonly<{ text: string; hue?: "amber" | "blue" | "green" | "coral" }>;

export type TabButton = Readonly<{
  label: string;
  href: string;
  icon: AdminIconComponent;
  kind: "primary" | "secondary";
  /** Opens in a new tab (the public website). */
  external?: true;
  testId?: string;
}>;

export function TabPage({
  tab,
  title,
  subtitle,
  pill,
  buttons = [],
  pages,
  pagesLabel = "Pages",
  children,
}: {
  tab: string;
  title: string;
  subtitle?: string;
  pill?: TabPill | null;
  buttons?: readonly TabButton[];
  pages?: readonly AdminMoreRow[];
  pagesLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.page} data-admin-tab-page={tab}>
      <div className={styles.hello}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {pill || buttons.length ? (
        <div className={styles.lead}>
          {pill ? (
            <span className={styles.pill} data-hue={pill.hue} data-testid="admin-tab-status">
              {pill.text}
            </span>
          ) : null}
          {buttons.length ? (
            <div className={styles.buttons}>
              {buttons.map((button) => (
                <Link
                  key={button.href + button.label}
                  href={button.href}
                  className={`${styles.button} ${styles.press}`}
                  data-kind={button.kind}
                  data-testid={button.testId}
                  {...(button.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  <button.icon aria-hidden="true" />
                  {button.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.split}>
        {pages ? <PageList label={pagesLabel} pages={pages} /> : null}
        {children}
      </div>
    </div>
  );
}

export function PageList({ label, pages }: { label: string; pages: readonly AdminMoreRow[] }) {
  const id = `tab-pages-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={styles.label}>
        {label}
      </h2>
      {pages.length ? (
        <ul className={`${styles.card} ${styles.links}`}>
          {pages.map((row) => {
            const Icon = ROUTE_ICONS[row.iconKey];
            return (
              <li key={row.id}>
                <Link href={row.href} className={`${styles.linkRow} ${styles.press}`} data-tab-row={row.id}>
                  <Icon aria-hidden="true" />
                  <span className={styles.linkLabel} title={row.label}>
                    {row.label}
                  </span>
                  <ChevronRight className={styles.go} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${styles.card} ${styles.empty}`}>Nothing here for you to change.</p>
      )}
    </section>
  );
}
