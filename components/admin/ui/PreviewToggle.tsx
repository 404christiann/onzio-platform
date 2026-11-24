"use client";

import { Monitor, Smartphone } from "lucide-react";

import { currentAdminTab, trackAdminEvent } from "@/lib/admin-analytics";
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
  function choose(size: PreviewSize) {
    trackAdminEvent("admin_preview_clicked", { page: currentAdminTab() });
    onChange(size);
  }

  return (
    <div className={cn(styles.toggle, className)} role="group" aria-label={label} data-admin-preview-toggle="">
      <button
        type="button"
        aria-pressed={value === "desktop"}
        onClick={() => choose("desktop")}
      >
        <Monitor size={15} aria-hidden="true" />
        Desktop
      </button>
      <button
        type="button"
        aria-pressed={value === "phone"}
        onClick={() => choose("phone")}
      >
        <Smartphone size={15} aria-hidden="true" />
        Phone
      </button>
    </div>
  );
}
