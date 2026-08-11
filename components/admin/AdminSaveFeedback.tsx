"use client";

interface AdminSaveFeedbackProps {
  saving: boolean;
  saved: boolean;
  savingLabel?: string;
  successLabel?: string;
}

/**
 * Floating save-status pill for admin editors. Styled with the admin
 * design-token layer (bg-background, border-border, destructive/success
 * accents); its keyframes live in styles/globals.css as
 * `admin-save-feedback-*`.
 */
const BASE_CLASSES =
  "fixed bottom-4 left-4 right-4 z-[300] flex min-h-11 items-center justify-center gap-[0.7rem] rounded-full border border-border bg-background/95 py-[0.65rem] pl-3 pr-4 font-body text-[0.82rem] font-semibold tracking-[0.01em] text-muted-foreground shadow-[0_14px_40px_rgba(0,0,0,0.32)] backdrop-blur-[14px] sm:bottom-5 sm:left-auto sm:right-5 sm:justify-start";

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
        className={`${BASE_CLASSES} border-destructive/30 animate-[admin-save-feedback-enter_180ms_ease-out_both] motion-reduce:animate-none`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className="h-5 w-5 flex-none rounded-full border-2 border-border border-t-destructive animate-[spin_700ms_linear_infinite] motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span className="whitespace-nowrap">{savingLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={`${BASE_CLASSES} border-success/25 animate-[admin-save-feedback-success_3s_ease_both] motion-reduce:animate-none`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-success/15 text-success"
        aria-hidden="true"
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7.2l2.45 2.45L11 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="[stroke-dasharray:16] [stroke-dashoffset:16] animate-[admin-save-feedback-check_280ms_ease-out_80ms_forwards] motion-reduce:animate-none motion-reduce:[stroke-dashoffset:0]"
          />
        </svg>
      </span>
      <span className="whitespace-nowrap">{successLabel}</span>
    </div>
  );
}
