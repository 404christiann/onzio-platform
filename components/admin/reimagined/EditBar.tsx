"use client";

import Link from "next/link";
import { ChevronLeft, IconEdit, IconSuccess } from "@/components/admin/icons";
import { isPlainClick, TopBarTakeover, useTabBack } from "./TopBar";
import styles from "./reimagined.module.css";

// ADMIN-RE-09: the reimagined edit bar over the homepage editor (design:
// cd-desktop, cd-phone). It takes over the shell's page bar: "‹ Website" (the
// tab it sits under, ADMIN-RE-24), "You're editing your site", what is not
// saved yet, and Save, which confirms on itself with the hold-aware saved
// label. The editor owns saving and leaving; this only shows the state and
// calls back. The back link is a real link, so a new tab still works; a plain
// click goes through onHome, which asks first when there are unsaved changes.

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
  onHome: (href: string) => void;
}) {
  const back = useTabBack();
  const status = unsaved.length
    ? { long: `Not saved yet: ${unsaved.join(", ")}`, short: "Not saved yet" }
    : state === "saved"
      ? null
      : { long: "Nothing to save yet", short: null };
  return (
    <TopBarTakeover>
      <div className={styles.editBar} data-testid="admin-edit-bar">
        <div className={styles.editBarLead}>
          <Link
            href={back.href}
            className={styles.back}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              onHome(back.href);
            }}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            {back.label}
          </Link>
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
