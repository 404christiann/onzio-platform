"use client";

import { useId } from "react";
import styles from "./AdminSwitch.module.css";

export type AdminSwitchProps = {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
};

export function AdminSwitch({
  checked,
  label,
  onCheckedChange,
  disabled = false,
  disabledReason,
  id,
  className,
  "aria-describedby": describedBy,
}: AdminSwitchProps) {
  const reasonId = useId();
  const showReason = disabled && Boolean(disabledReason);
  const description = [describedBy, showReason ? reasonId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={styles.control}>
      <button
        id={id}
        type="button"
        role="switch"
        className={className ? `${styles.track} ${className}` : styles.track}
        aria-label={label}
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        aria-describedby={description || undefined}
        onClick={(event) => {
          if (disabled) {
            event.stopPropagation();
            return;
          }

          onCheckedChange(!checked);
        }}
      >
        <span className={styles.thumb} aria-hidden="true" />
      </button>
      {showReason && (
        <span id={reasonId} className={styles.reason}>
          {disabledReason}
        </span>
      )}
    </span>
  );
}
