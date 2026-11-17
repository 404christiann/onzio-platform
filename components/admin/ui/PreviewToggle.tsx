"use client";

import { Monitor, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

import styles from "./PreviewToggle.module.css";

export type PreviewSize = "desktop" | "phone";

export type PreviewToggleProps = {
  value: PreviewSize;
  onChange: (value: PreviewSize) => void;
  label?: string;
  className?: string;
};

export function PreviewToggle({
  value,
  onChange,
  label = "Preview size",
  className,
}: PreviewToggleProps) {
  return (
    <div className={cn(styles.toggle, className)} role="group" aria-label={label} data-admin-preview-toggle="">
      <button
        type="button"
        aria-pressed={value === "desktop"}
        onClick={() => onChange("desktop")}
      >
        <Monitor size={15} aria-hidden="true" />
        Desktop
      </button>
      <button
        type="button"
        aria-pressed={value === "phone"}
        onClick={() => onChange("phone")}
      >
        <Smartphone size={15} aria-hidden="true" />
        Phone
      </button>
    </div>
  );
}
