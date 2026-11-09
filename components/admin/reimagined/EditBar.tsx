"use client";

import { ChevronLeft, IconEdit, IconSuccess } from "@/components/admin/icons";
import { TopBarTakeover } from "./TopBar";
import styles from "./reimagined.module.css";

// ADMIN-RE-09: the reimagined edit bar over the homepage editor (design:
// cd-desktop, cd-phone). It takes over the shell's top bar: "‹ Home", "You're
// editing your site", what is not saved yet, and Save, which confirms on itself
// with the hold-aware saved label. The editor owns saving and leaving; this
// only shows the state and calls back.

export type EditBarState = "clean" | "dirty" | "saving" | "saved";

export function EditBar({
  state,
  unsaved,
  savedText,
  saveDisabled,
  onSave,
  onHome,
}: {
  state: EditBarState;
  /** Short names of the parts with unsaved changes, e.g. ["Hero"]. */
  unsaved: readonly string[];
  savedText: string;
  saveDisabled: boolean;
  onSave: () => void;
  onHome: () => void;
}) {
  const status = unsaved.length
    ? { long: `Not saved yet: ${unsaved.join(", ")}`, short: "Not saved yet" }
    : state === "saved"
      ? null
      : { long: "Nothing to save yet", short: null };
  return (
    <TopBarTakeover>
      <div className={styles.editBar} data-testid="admin-edit-bar">
        <div className={styles.editBarLead}>
          <button type="button" className={styles.back} onClick={onHome}>
            <ChevronLeft className="size-5" aria-hidden="true" />
            Home
          </button>
          <span className={styles.editBarRule} aria-hidden="true" />
          <IconEdit className={styles.editBarPencil} aria-hidden="true" />
          <h1 className={styles.editBarTitle}>You’re editing your site</h1>
        </div>
        <div className={styles.editBarEnd}>
          {status ? (
            <p className={styles.editBarStatus} role="status" aria-live="off" data-dirty={unsaved.length > 0 || undefined}>
              <span className={styles.editBarLong}>{status.long}</span>
              {status.short ? <span className={styles.editBarShort}>{status.short}</span> : null}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.editBarSave}
            data-state={state}
            disabled={saveDisabled}
            onClick={onSave}
          >
            {state === "saving" ? (
              "Saving…"
            ) : state === "saved" ? (
              <>
                <IconSuccess className="size-4" aria-hidden="true" />
                {savedText}
              </>
            ) : (
              <>
                <span className={styles.editBarLong}>Save homepage</span>
                <span className={styles.editBarShort}>Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </TopBarTakeover>
  );
}
