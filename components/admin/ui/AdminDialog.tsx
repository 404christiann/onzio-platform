"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { AdminModal } from "@/components/admin/AdminModal";
import { IconClose } from "@/components/admin/icons";
import styles from "./AdminDialog.module.css";

export type AdminDialogSize = "sm" | "md" | "lg" | "xl";

export type AdminDialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  size?: AdminDialogSize;
  eyebrow?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  dismissOnEscape?: boolean;
  dismissOnBackdrop?: boolean;
  closeLabel?: string;
  initialFocus?: Dialog.Popup.Props["initialFocus"];
  /** Supply the opener ref if it may open the dialog without taking focus. */
  finalFocus?: Dialog.Popup.Props["finalFocus"];
  descriptionId?: string;
};

const phoneQuery = "(max-width: 700px)";

function subscribePhoneViewport(listener: () => void) {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function isPhoneViewport() {
  return window.matchMedia(phoneQuery).matches;
}

function serverPhoneViewport() {
  return false;
}

export function AdminDialog({
  open,
  onClose,
  title,
  children,
  size = "md",
  eyebrow,
  footer,
  busy,
  dismissOnEscape,
  dismissOnBackdrop,
  closeLabel = "Close",
  initialFocus,
  finalFocus,
  descriptionId,
}: AdminDialogProps) {
  const titleId = useId();
  const [popup, setPopup] = useState<HTMLDivElement | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !popup) return;

    const phone = window.matchMedia(phoneQuery);
    const viewport = window.visualViewport;
    let visibilityFrame: number | undefined;

    function updateViewport() {
      if (!popup || !phone.matches) return;

      // iOS keeps the layout viewport tall while the software keyboard
      // reduces and sometimes pans the visual viewport.
      const height = viewport?.height || window.innerHeight;
      const top = Math.max(0, viewport?.offsetTop || 0);
      popup.style.setProperty("--admin-dialog-visible-height", `${height}px`);
      const bottomInset = Math.max(0, window.innerHeight - height - top);
      popup.style.setProperty("--admin-dialog-bottom-inset", `${bottomInset}px`);

      if (visibilityFrame !== undefined) window.cancelAnimationFrame(visibilityFrame);
      visibilityFrame = window.requestAnimationFrame(() => {
        const scroller = body.current;
        const focused = popup.ownerDocument.activeElement;
        if (!scroller || !(focused instanceof HTMLElement) || !scroller.contains(focused)) return;
        if (!focused.matches("input, textarea, select, [contenteditable='true']")) return;

        // Scroll only the body so Safari does not pan the entire sheet.
        const bodyBounds = scroller.getBoundingClientRect();
        const fieldBounds = focused.getBoundingClientRect();
        const topDelta = fieldBounds.top - bodyBounds.top - 8;
        const bottomDelta = fieldBounds.bottom - bodyBounds.bottom + 8;
        if (topDelta < 0) scroller.scrollTop += topDelta;
        else if (bottomDelta > 0) scroller.scrollTop += bottomDelta;
      });
    }

    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      if (visibilityFrame !== undefined) window.cancelAnimationFrame(visibilityFrame);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, [open, popup]);

  return (
    <AdminModal
      ref={setPopup}
      open={open}
      onClose={onClose}
      className={styles.popup}
      backdropClassName={styles.backdrop}
      backdropSlot="admin-dialog-backdrop"
      data-slot="admin-dialog"
      data-size={size}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy || undefined}
      inert={!open}
      busy={busy}
      dismissOnEscape={dismissOnEscape}
      dismissOnBackdrop={dismissOnBackdrop}
      initialFocus={initialFocus}
      finalFocus={finalFocus}
    >
      <header className={styles.header} data-slot="admin-dialog-header">
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <h2 id={titleId} className={styles.title} data-slot="admin-dialog-title">{title}</h2>
        <Dialog.Close
          type="button"
          className={`admin-press ${styles.close}`}
          data-slot="admin-dialog-close"
          aria-label={closeLabel}
          aria-disabled={busy || undefined}
        >
          <IconClose size={18} />
        </Dialog.Close>
      </header>
      <div ref={body} className={styles.body} data-slot="admin-dialog-body">{children}</div>
      {footer}
    </AdminModal>
  );
}

export function AdminDialogSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section} data-slot="admin-dialog-section">
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export function AdminDialogFields({ children }: { children: ReactNode }) {
  return <div className={styles.fields} data-slot="admin-dialog-fields">{children}</div>;
}

type AdminDialogFooterProps = {
  primary: ReactNode;
  children?: ReactNode;
  status?: ReactNode;
  destructive?: ReactNode;
};

export function AdminDialogFooter({ primary, children, status, destructive }: AdminDialogFooterProps) {
  const phone = useSyncExternalStore(subscribePhoneViewport, isPhoneViewport, serverPhoneViewport);
  const primaryAction = <Fragment key="primary">{primary}</Fragment>;
  const secondaryActions = <Fragment key="secondary">{children}</Fragment>;
  const destructiveAction = destructive != null && (
    <div key="destructive" className={styles.destructive}>{destructive}</div>
  );
  const actions = (
    <div key="actions" className={styles.actions}>
      {phone ? [primaryAction, secondaryActions] : [secondaryActions, primaryAction]}
    </div>
  );

  return (
    <footer className={styles.footer} data-slot="admin-dialog-footer">
      {status != null && <div className={styles.status} data-slot="admin-dialog-status">{status}</div>}
      {phone ? [actions, destructiveAction] : [destructiveAction, actions]}
    </footer>
  );
}
