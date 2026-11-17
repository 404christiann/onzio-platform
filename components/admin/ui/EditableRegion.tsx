"use client";

import type { KeyboardEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./EditableRegion.module.css";

export type EditableRegionProps = {
  ariaLabel: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
  invalid?: boolean;
  className?: string;
};

export function EditableRegion({
  ariaLabel,
  editLabel,
  onEdit,
  children,
  invalid = false,
  className,
}: EditableRegionProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (!event.repeat) onEdit();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={cn(styles.region, className)}
      data-admin-editable-region=""
      data-invalid={invalid || undefined}
      onClick={onEdit}
      onKeyDown={onKeyDown}
    >
      <div className={styles.content} inert aria-hidden="true">{children}</div>
      <span className={styles.tag} aria-hidden="true">Edit {editLabel}</span>
    </div>
  );
}
