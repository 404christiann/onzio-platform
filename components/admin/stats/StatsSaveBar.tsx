"use client";

import { useEffect, useRef } from "react";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import styles from "./stats-workspace.module.css";

export function StatsSaveBar({ label, saving, disabled, dirtyCount, onSave, contextLabel }: { label: string; saving: boolean; disabled: boolean; dirtyCount: number; onSave: () => void; contextLabel: string }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current; if (!element) return;
    const viewport = window.visualViewport;
    const update = () => element.style.setProperty("--stats-actions-bottom", `${Math.max(0, innerHeight - (viewport?.height || innerHeight) - (viewport?.offsetTop || 0))}px`);
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  return <div className={styles.saveBar} data-stats-actions ref={bar}><div className={styles.saveCopy}><strong>{dirtyCount ? `${dirtyCount} player${dirtyCount === 1 ? "" : "s"} with unsaved changes` : "All changes saved"}</strong><small>{contextLabel}</small></div><button type="button" disabled={disabled} onClick={onSave} className={styles.primary}>{saving && <AdminLoadingDots className="mr-2" />}{saving ? "Saving…" : label}</button></div>;
}
