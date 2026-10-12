"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./stats-workspace.module.css";

export function StatsScopeSwitchDialog({ open, currentLabel, busy, error, onCancel, onDiscard, onSaveAndSwitch }: { open: boolean; currentLabel: string; busy: boolean; error?: string | null; onCancel: () => void; onDiscard: () => void; onSaveAndSwitch: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const element = dialog.current; if (!element || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { if (element.open) element.close(); previous?.focus({ preventScroll: true }); };
  }, [open]);
  return <dialog ref={dialog} className={styles.scopeDialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}><h2 id={title}>Save before switching?</h2><p>Your changes to {currentLabel} are still here. Save them, discard them, or keep editing.</p>{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.dialogActions}><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" disabled={busy} onClick={onDiscard}>Discard changes</button><button type="button" disabled={busy} onClick={onSaveAndSwitch} className={styles.primary}>{busy ? "Saving…" : "Save & switch"}</button></div></dialog>;
}
