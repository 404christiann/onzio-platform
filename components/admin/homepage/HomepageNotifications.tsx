"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NotificationError = { message: string } | null;
type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export type HomepageNotification = {
  key: string;
  kind: "saving" | "success" | "warning" | "error";
  icon: string;
  text: string;
  /** Errors and actionable warnings never time out. */
  timed: boolean;
  actionable: boolean;
};

const SUCCESS_LIFETIME_MS = 5000;
const TICK_MS = 250;

/** One notification queue for the whole editor.
 *
 * The presenters below are deliberately stateless: the same notification can be
 * hosted by the editor, the options panel, the mobile toolbar slot or the leave
 * dialog, and those hosts mount and unmount as panels open and close. Holding
 * the timer here means a save's feedback is not replayed by a remount, and the
 * five-second success dismissal really does pause on hover, on focus and while
 * the page is hidden instead of expiring behind the user's back. */
export function useHomepageNotification({
  save,
  error,
  warning,
}: {
  save: SaveState;
  error: NotificationError;
  warning?: string | null;
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  const holds = useRef(0);
  const [held, setHeld] = useState(false);

  // Errors outrank a save in flight; a confirmed save may briefly take the slot
  // from a standing warning, which returns once the success expires.
  const active: HomepageNotification | null = error
    ? { key: `error:${error.message}`, kind: "error", icon: "×", text: error.message, timed: false, actionable: true }
    : save === "saving"
      ? { key: "saving", kind: "saving", icon: "◌", text: "Saving your homepage…", timed: false, actionable: false }
      : save === "saved"
        ? { key: "saved", kind: "success", icon: "✓", text: "Homepage saved.", timed: true, actionable: false }
        : warning
          ? { key: `warning:${warning}`, kind: "warning", icon: "!", text: warning, timed: false, actionable: true }
          : null;

  const key = active?.key ?? null;
  const timed = active?.timed ?? false;

  useEffect(() => {
    if (!timed || !key || dismissedKey === key || expiredKey === key) return;
    let remaining = SUCCESS_LIFETIME_MS;
    const tick = window.setInterval(() => {
      if (held || document.hidden) return;
      remaining -= TICK_MS;
      if (remaining <= 0) {
        window.clearInterval(tick);
        setExpiredKey(key);
      }
    }, TICK_MS);
    return () => window.clearInterval(tick);
  }, [key, timed, held, dismissedKey, expiredKey]);

  useEffect(() => {
    const sync = () => setHeld(holds.current > 0 || document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const hold = useCallback(() => { holds.current += 1; setHeld(true); }, []);
  const release = useCallback(() => {
    holds.current = Math.max(0, holds.current - 1);
    setHeld(holds.current > 0 || document.hidden);
  }, []);
  const dismiss = useCallback(() => { if (key) setDismissedKey(key); }, [key]);

  const visible = active && active.key !== dismissedKey && active.key !== expiredKey ? active : null;
  return { notification: visible, dismiss, hold, release };
}

export default function HomepageNotifications({
  notification,
  onRetry,
  onDismiss,
  onHold,
  onRelease,
  inModal = false,
}: {
  notification: HomepageNotification | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  onHold?: () => void;
  onRelease?: () => void;
  inModal?: boolean;
}) {
  if (!notification) return null;
  const { kind, icon, text, actionable } = notification;
  return (
    <div
      className={`hp-notification hp-notification-${kind}${kind === "error" ? " hp-error" : ""}${inModal ? " hp-notification-modal" : ""}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      data-notification-kind={kind}
      onMouseEnter={onHold}
      onMouseLeave={onRelease}
      onFocusCapture={onHold}
      onBlurCapture={onRelease}
    >
      <span className="hp-notification-icon" aria-hidden="true">{icon}</span>
      <p>{text}</p>
      <div className="hp-notification-actions">
        {actionable && kind === "error" && onRetry ? <button type="button" className="hp-notification-action" onClick={onRetry}>Try saving again</button> : null}
        {onDismiss && kind !== "saving" ? <button type="button" className="hp-notification-dismiss" aria-label="Dismiss notification" onClick={onDismiss}>Dismiss</button> : null}
      </div>
    </div>
  );
}
