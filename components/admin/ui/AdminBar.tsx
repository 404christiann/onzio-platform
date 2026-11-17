"use client";

import { useEffect, useState } from "react";

import { ADMIN_MOTION_DURATIONS, ADMIN_MOTION_MAX_BARS } from "@/lib/admin-motion";
import { cn } from "@/lib/utils";

import styles from "./AdminBar.module.css";

export type AdminBarProps = {
  /** A value from zero to one. */
  fraction: number;
  label: string;
  staggerIndex?: number;
  className?: string;
};

export function AdminBar({ fraction, label, staggerIndex = 0, className }: AdminBarProps) {
  const [revealed, setRevealed] = useState(false);
  const [firstReveal, setFirstReveal] = useState(true);
  const value = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const delay = Math.min(ADMIN_MOTION_MAX_BARS - 1, Math.max(0, Math.floor(staggerIndex)))
    * ADMIN_MOTION_DURATIONS.barStagger;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRevealed(true));
    const timer = window.setTimeout(
      () => setFirstReveal(false),
      ADMIN_MOTION_DURATIONS.bars + delay,
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [delay]);

  return (
    <div
      className={cn(styles.track, className)}
      data-admin-bar=""
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={styles.fill}
        data-admin-bar-fill=""
        data-first-reveal={firstReveal}
        style={{
          transform: `scaleX(${revealed ? value : 0})`,
          opacity: revealed ? 1 : 0,
          transitionDelay: firstReveal ? `${delay}ms` : "0ms",
        }}
      />
    </div>
  );
}
