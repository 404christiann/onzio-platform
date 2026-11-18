"use client";

import type { MouseEvent, ReactNode } from "react";
import { AdminSwitch } from "../AdminSwitch";
import { KIT_EDIT_PROPS } from "./kitEdit";
import styles from "./SectionCards.module.css";

export type SectionCardItem = {
  id: string;
  title: string;
  /** One short line: what the section holds right now. */
  summary?: ReactNode;
  /** Pass both to show the show/hide switch. Omit both and the card shows "Always shown". */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  /** Hold the switch while the editor is saving or loading. */
  disabled?: boolean;
  /** Names the switch for assistive tech. Defaults to "Show <title> on the page". */
  switchLabel?: string;
};

export type SectionCardsProps = {
  /** Rendered in the order given. There is no reordering. */
  sections: readonly SectionCardItem[];
  /** The event's currentTarget is the Edit button: pass it to useEditorDialog().open so focus returns to it. */
  onEdit: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  /** Aria label of the list. */
  label?: string;
};

export function hasVisibilityControl(section: SectionCardItem): boolean {
  return typeof section.visible === "boolean" && typeof section.onVisibleChange === "function";
}

/** One card per section: title, short summary, Edit, and a show/hide switch or an "Always shown" chip. */
export function SectionCards({ sections, onEdit, label = "Page sections" }: SectionCardsProps) {
  return (
    <ul className={styles.list} aria-label={label} data-section-cards="">
      {sections.map((section) => {
        const controlled = hasVisibilityControl(section);
        const hidden = controlled && section.visible === false;
        return (
          <li key={section.id} className={styles.card} data-hidden={hidden || undefined} data-section-card={section.id}>
            <div className={styles.text}>
              <h2 className={styles.title}>{section.title}</h2>
              {section.summary != null && <p className={styles.summary}>{section.summary}</p>}
            </div>
            <div className={styles.controls}>
              {controlled ? (
                <span className={styles.visibility}>
                  <span className={styles.visibilityText} aria-hidden="true">{section.visible ? "Shown" : "Hidden"}</span>
                  <AdminSwitch
                    checked={Boolean(section.visible)}
                    label={section.switchLabel ?? `Show ${section.title} on the page`}
                    disabled={section.disabled}
                    onCheckedChange={(next) => section.onVisibleChange?.(next)}
                  />
                </span>
              ) : (
                <span className={styles.chip} data-always-shown="">Always shown</span>
              )}
              <button
                type="button"
                className={`admin-press ${styles.edit}`}
                aria-label={`Edit ${section.title}`}
                onClick={(event) => onEdit(section.id, event)}
                {...KIT_EDIT_PROPS}
              >
                Edit
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
