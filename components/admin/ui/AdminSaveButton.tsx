"use client";

import type { ReactNode, Ref } from "react";
import { IconCheck } from "@/components/admin/icons";
import type { SaveState } from "./useSaveState";
import styles from "./AdminSaveButton.module.css";

type SaveAction = {
  state: SaveState;
  onSave: () => void;
};

type AdminSaveButtonProps = SaveAction & {
  className?: string;
  id?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function AdminSaveButton({
  state,
  onSave,
  className,
  id,
  ref,
}: AdminSaveButtonProps) {
  const canSave = state === "dirty";

  return (
    <>
      <button
        ref={ref}
        id={id}
        type="button"
        className={`admin-press ${styles.button}${className ? ` ${className}` : ""}`}
        data-admin-save-button=""
        data-state={state}
        aria-disabled={!canSave}
        aria-busy={state === "saving" || undefined}
        onClick={(event) => {
          if (!canSave) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          onSave();
        }}
      >
        <span
          className={styles.label}
          data-admin-save-label="idle"
          aria-hidden={state === "saving" || state === "saved"}
        >
          Save changes
        </span>
        <span
          className={styles.label}
          data-admin-save-label="saving"
          aria-hidden={state !== "saving"}
        >
          Saving…
        </span>
        <span
          className={styles.label}
          data-admin-save-label="saved"
          aria-hidden={state !== "saved"}
        >
          <IconCheck className={styles.check} size={16} data-admin-save-check="" />
          Saved
        </span>
      </button>
      <span className="sr-only" role="status" data-admin-save-announcement="">
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
      </span>
    </>
  );
}

type AdminSaveActionsProps = SaveAction & {
  stackOnMobile?: boolean;
  children?: ReactNode;
  className?: string;
};

export function AdminSaveActions({
  state,
  onSave,
  stackOnMobile = false,
  children,
  className,
}: AdminSaveActionsProps) {
  return (
    <div
      className={className ? `${styles.actions} ${className}` : styles.actions}
      data-stack-on-mobile={stackOnMobile || undefined}
    >
      <span className={styles.status} role="status" data-admin-save-status="">
        {state === "dirty" && "Unsaved changes"}
      </span>
      <div className={styles.buttons}>
        <AdminSaveButton state={state} onSave={onSave} />
        {children}
      </div>
    </div>
  );
}
