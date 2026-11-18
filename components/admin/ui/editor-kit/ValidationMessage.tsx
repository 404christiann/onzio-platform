import type { ReactNode } from "react";
import { IconWarning } from "@/components/admin/icons";
import styles from "./ValidationMessage.module.css";

export type ValidationMessageProps = {
  children: ReactNode;
  title?: ReactNode;
  /**
   * How a screen reader hears it. "assertive" (role=alert) for a message that
   * appears because of the person's last action, "polite" (role=status) for one
   * that updates while they type, "off" for a message that is simply on the page.
   */
  live?: "assertive" | "polite" | "off";
  id?: string;
  className?: string;
};

/** The yellow warning/validation message: a solid yellow tile with a dark glyph, in light and dark. */
export function ValidationMessage({ children, title, live = "off", id, className }: ValidationMessageProps) {
  return (
    <div
      id={id}
      className={className ? `${styles.message} ${className}` : styles.message}
      role={live === "assertive" ? "alert" : live === "polite" ? "status" : undefined}
      data-validation-message=""
    >
      <span className={styles.tile} aria-hidden="true" data-validation-tile="">
        <IconWarning size={16} />
      </span>
      <div className={styles.text}>
        {title && <p className={styles.title}>{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
