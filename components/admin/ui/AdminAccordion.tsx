"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import styles from "./AdminAccordion.module.css";

export type AdminAccordionProps = {
  title: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

export function AdminAccordion({
  title,
  open,
  onOpenChange,
  children,
  className,
}: AdminAccordionProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open && body.current?.contains(document.activeElement)) trigger.current?.focus();
  }, [open]);

  return (
    <section className={cn(styles.section, className)} data-admin-accordion="" data-open={open}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
      >
        <span>{title}</span>
        <ChevronDown className={styles.arrow} size={16} aria-hidden="true" />
      </button>
      <div
        ref={body}
        id={id}
        className={styles.body}
        data-admin-accordion-body=""
        inert={!open}
        aria-hidden={!open}
      >
        <div className={styles.bodyInner}>{children}</div>
      </div>
    </section>
  );
}
