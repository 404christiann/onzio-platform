"use client";

import { useId, useRef, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { AdminDialog, AdminDialogFooter } from "./AdminDialog";
import styles from "./AdminConfirmDialog.module.css";

type DialogFocusProps = Pick<ComponentProps<typeof AdminDialog>, "initialFocus" | "finalFocus">;

export type AdminConfirmDialogProps = DialogFocusProps & {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
};

export function AdminConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  initialFocus,
  finalFocus,
}: AdminConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  return (
    <AdminDialog
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      busy={busy}
      initialFocus={initialFocus ?? cancelRef}
      finalFocus={finalFocus}
      descriptionId={descriptionId}
      footer={(
        <AdminDialogFooter
          primary={(
            <Button
              type="button"
              data-primary=""
              variant={destructive ? null : "default"}
              className={destructive ? `${styles.action} ${styles.destructive}` : styles.action}
              disabled={busy}
              focusableWhenDisabled
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          )}
        >
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            className={styles.action}
            disabled={busy}
            focusableWhenDisabled
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        </AdminDialogFooter>
      )}
    >
      <div id={descriptionId} className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {children}
      </div>
    </AdminDialog>
  );
}
