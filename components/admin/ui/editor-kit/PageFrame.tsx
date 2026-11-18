"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconExternalLink } from "@/components/admin/icons";
import { useRegisterPageFrame } from "./pageFrameRegistry";
import { PageSaveButton, type PageSaveButtonProps } from "./PageSaveButton";
import { hasUnsavedEdits, type PageSaveState } from "./pageSaveState";
import styles from "./PageFrame.module.css";

export type PageFrameCrumb = { label: string; href?: `/admin${string}` };

export type PageFrameProps = {
  title: ReactNode;
  /** Crumbs before the title, for example [{ label: "Website", href: "/admin/homepage" }]. The title is the last crumb. */
  breadcrumb?: readonly PageFrameCrumb[];
  /** The public page. Opens in a new tab. */
  openPageHref?: string;
  description?: ReactNode;
  /** Omit state and onSave for a page with nothing to save (a hub or index page): the header then has no Save. */
  state?: PageSaveState;
  onSave?: () => void;
  onRetry?: PageSaveButtonProps["onRetry"];
  onConflict?: PageSaveButtonProps["onConflict"];
  /** Runs when Discard changes is pressed. Open the editor's existing discard confirmation here. */
  onDiscard?: () => void;
  /** Rendered between the header and the content, for example the editor's notice or conflict message. */
  notice?: ReactNode;
  children: ReactNode;
};

/**
 * One header for a page editor: breadcrumb, title, "Open page" and Save. Below
 * 768px Save (and Discard changes) move to a bottom bar that clears the home
 * indicator. The Discard changes link exists only while edits are unsaved.
 */
export function PageFrame({
  title,
  breadcrumb = [],
  openPageHref,
  description,
  state = "clean",
  onSave,
  onRetry,
  onConflict,
  onDiscard,
  notice,
  children,
}: PageFrameProps) {
  useRegisterPageFrame();
  const showDiscard = Boolean(onDiscard) && hasUnsavedEdits(state);

  return (
    <div className={styles.frame} data-page-frame="">
      <header className={styles.header} data-page-frame-header="">
        <div className={styles.heading}>
          <nav aria-label="Breadcrumb" className={styles.crumbs} data-page-frame-breadcrumb="">
            <ol>
              {breadcrumb.map((crumb) => (
                <li key={crumb.label}>
                  {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                </li>
              ))}
              <li aria-current="page"><span>{title}</span></li>
            </ol>
          </nav>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {openPageHref && (
          <Link className={styles.openPage} href={openPageHref} target="_blank" rel="noopener" data-page-frame-open="">
            <IconExternalLink size={16} aria-hidden="true" />
            Open page
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        )}
        {onSave && (
        <div className={styles.saveGroup} data-page-frame-save="">
          {showDiscard && (
            <button type="button" className={`admin-press ${styles.discard}`} data-page-frame-discard="" onClick={onDiscard}>
              Discard changes
            </button>
          )}
          <PageSaveButton state={state} onSave={onSave} onRetry={onRetry} onConflict={onConflict} />
        </div>
        )}
      </header>
      {notice}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
