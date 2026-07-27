"use client";

import styles from "@/components/admin/AdminSaveFeedback.module.css";

interface AdminSaveFeedbackProps {
  saving: boolean;
  saved: boolean;
  savingLabel?: string;
  successLabel?: string;
}

export default function AdminSaveFeedback({
  saving,
  saved,
  savingLabel = "Saving changes…",
  successLabel = "Saved successfully",
}: AdminSaveFeedbackProps) {
  if (!saving && !saved) return null;

  if (saving) {
    return (
      <div
        className={`${styles.feedback} ${styles.saving}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.label}>{savingLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.feedback} ${styles.success}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={styles.check} aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7.2l2.45 2.45L11 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={styles.label}>{successLabel}</span>
    </div>
  );
}
