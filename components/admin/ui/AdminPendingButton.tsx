"use client";

import type { VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import styles from "./AdminPendingButton.module.css";

type AdminPendingButtonProps = Omit<
  ComponentPropsWithRef<"button">,
  "children" | "aria-busy" | "aria-disabled"
> &
  VariantProps<typeof buttonVariants> & {
    label: string;
    pendingLabel: string;
    pending: boolean;
  };

export function AdminPendingButton({
  label,
  pendingLabel,
  pending,
  variant,
  size = "lg",
  type = "button",
  className,
  onClick,
  ...props
}: AdminPendingButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cn(buttonVariants({ variant, size }), styles.button, className)}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        onClick?.(event);
      }}
    >
      <span className={styles.labels}>
        <span
          className={styles.label}
          data-admin-pending-label="idle"
          aria-hidden={pending}
        >
          <span className={styles.text}>{label}</span>
        </span>
        <span
          className={styles.label}
          data-admin-pending-label="pending"
          aria-hidden={!pending}
        >
          <span className={styles.ring} data-admin-pending-ring="" aria-hidden="true" />
          <span className={styles.text}>{pendingLabel}</span>
        </span>
      </span>
    </button>
  );
}
