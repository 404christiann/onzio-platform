"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { AdminSwitch } from "../AdminSwitch";
import { KIT_EDIT_PROPS } from "./kitEdit";
import { hasVisibilityControl, type SectionCardItem } from "./SectionCards";
import styles from "./PreviewCards.module.css";

export type PreviewCardItem = SectionCardItem & {
  /** This section has edits that are not saved yet. Shows a dot next to the title. */
  changed?: boolean;
};

export type PreviewCardsProps = {
  /** Rendered in the order given. There is no reordering. */
  sections: readonly PreviewCardItem[];
  /** The section as it looks on the public page. Rendered inert, so it never takes focus or clicks. */
  renderPreview: (id: string) => ReactNode;
  /** The event's currentTarget is the pressed button: pass it to useEditorDialog().openSection so focus returns to it. */
  onEdit: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  /** Natural width the preview is laid out at, in px. Default 780. */
  previewWidth?: number;
  /** transform scale applied to that width. Default .4. The box size is fixed, so changing it never shifts the page. */
  previewScale?: number;
  /** Mount a preview only once its card is near the viewport. Default true. Turn off in render tests. */
  lazy?: boolean;
};

/** Mounts children once the element has been near the viewport. Always true where IntersectionObserver is missing. */
function useNearViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (near || !enabled) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, near]);
  return { ref, near };
}

function PreviewBox({ children, width, scale, lazy }: { children: ReactNode; width: number; scale: number; lazy: boolean }) {
  const { ref, near } = useNearViewport(lazy);
  return (
    <div ref={ref} className={styles.box} aria-hidden="true" inert data-preview-box="">
      {near && (
        <div className={styles.scaled} style={{ "--preview-width": `${width}px`, "--preview-scale": scale } as CSSProperties}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * One card per section with a live mini preview of the section as it looks on
 * the public page. The whole preview is a button named "Edit <title>". The
 * footer holds the title, an unsaved-edits dot, the show/hide switch or the
 * "Always shown" chip, and Edit. The preview box has a fixed size and is
 * scaled with transform and clipped, so loading or editing a preview never
 * moves the page.
 */
export function PreviewCards({
  sections,
  renderPreview,
  onEdit,
  label = "Page sections",
  previewWidth = 780,
  previewScale = 0.4,
  lazy = true,
}: PreviewCardsProps) {
  return (
    <ul className={styles.grid} aria-label={label} data-preview-cards="">
      {sections.map((section) => {
        const controlled = hasVisibilityControl(section);
        const hidden = controlled && section.visible === false;
        return (
          <li key={section.id} className={styles.card} data-hidden={hidden || undefined} data-preview-card={section.id}>
            <div className={styles.previewWrap}>
              <PreviewBox width={previewWidth} scale={previewScale} lazy={lazy}>{renderPreview(section.id)}</PreviewBox>
              <button
                type="button"
                className={`admin-press ${styles.previewButton}`}
                aria-label={`Edit ${section.title}`}
                tabIndex={-1}
                onClick={(event) => onEdit(section.id, event)}
                data-preview-button=""
                {...KIT_EDIT_PROPS}
              />
            </div>
            <div className={styles.foot}>
              <h2 className={styles.title}>
                <span className={styles.titleText}>{section.title}</span>
                {section.changed && (
                  <span className={styles.dot} title="Unsaved edits" data-unsaved-dot="">
                    <span className="sr-only"> (unsaved edits)</span>
                  </span>
                )}
              </h2>
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
                  aria-label={`Edit ${section.title} section`}
                  onClick={(event) => onEdit(section.id, event)}
                  data-preview-edit=""
                  {...KIT_EDIT_PROPS}
                >
                  Edit
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
