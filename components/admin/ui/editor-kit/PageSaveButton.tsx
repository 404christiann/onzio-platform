"use client";

import type { Ref } from "react";
import {
  isPageSaveActionable,
  pageSaveAnnouncement,
  pageSaveLabel,
  type PageSaveState,
} from "./pageSaveState";
import styles from "./PageSaveButton.module.css";

export type PageSaveButtonProps = {
  state: PageSaveState;
  /** Runs for dirty and error. Also the fallback for retry. */
  onSave: () => void;
  /** retry: re-send the exact earlier save (the editor's "Retry same save"). Falls back to onSave. */
  onRetry?: () => void;
  /** conflict: open the editor's existing resolution (Load latest and keep my edits / Reload saved page). */
  onConflict?: () => void;
  /** Describes the failure or conflict in prose for assistive tech. */
  describedBy?: string;
  className?: string;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
  /** Render the polite status announcement. Leave on unless the caller already announces. */
  announce?: boolean;
  /** Replaces the plain "Save" wording (clean and dirty only) for a Save that saves one item, for example "Save player". */
  saveLabel?: string;
};

/**
 * The page-frame Save button. Grey when clean, blue when dirty, a ring while
 * saving, green with a drawn check once saved. Retry, error and conflict have
 * their own looks and hand off to the editor's existing flows. It never uses a
 * blanket "everything is saved" wording. AdminSaveButton is untouched and keeps serving the
 * editors that have not moved to the page frame.
 */
export function PageSaveButton({
  state,
  onSave,
  onRetry,
  onConflict,
  describedBy,
  className,
  id,
  ref,
  announce = true,
  saveLabel,
}: PageSaveButtonProps) {
  const actionable = isPageSaveActionable(state);
  const label = saveLabel && (state === "clean" || state === "dirty") ? saveLabel : pageSaveLabel(state);
  const announcement = pageSaveAnnouncement(state);

  function press() {
    if (state === "retry") (onRetry ?? onSave)();
    else if (state === "conflict") (onConflict ?? onSave)();
    else onSave();
  }

  return (
    <>
      <button
        ref={ref}
        id={id}
        type="button"
        className={`admin-press ${styles.button}${className ? ` ${className}` : ""}`}
        data-page-save-button=""
        data-state={state}
        aria-disabled={!actionable}
        aria-busy={state === "saving" || undefined}
        aria-describedby={describedBy}
        onClick={(event) => {
          if (!actionable) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          press();
        }}
      >
        {state === "saving" && <span className={styles.ring} aria-hidden="true" data-page-save-ring="" />}
        {state === "saved" && (
          <svg className={styles.check} viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true" data-page-save-check="">
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
          </svg>
        )}
        <span className={styles.label} data-page-save-label="">{label}</span>
      </button>
      {announce && (
        <span className="sr-only" role="status" data-page-save-announcement="">{announcement}</span>
      )}
    </>
  );
}
