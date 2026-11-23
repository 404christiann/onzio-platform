"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { AdminSwitch } from "../AdminSwitch";
import { Shimmer } from "../Shimmer";
import { resolveEditTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import { editTargetHitAt, watchEditTargetStamps, type EditTargetStamp } from "./editTargets";
import { useFitPreviewScale } from "./fitPreviewScale";
import { KIT_EDIT_PROPS } from "./kitEdit";
import { SCOPED_PREVIEW_ATTRIBUTES, scopePreviewIds } from "./scopePreviewIds";
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
  /**
   * The event's currentTarget is the pressed button: pass it to useEditorDialog().openSection so focus returns to it.
   * `target` is the field under the pointer when the preview itself was clicked with a mouse or touch (only with `stamps`):
   * call useEditorDialog().focusField(target) after openSection. The footer Edit button and the keyboard pass none.
   */
  onEdit: (id: string, event: MouseEvent<HTMLButtonElement>, target?: EditTargetId) => void;
  /**
   * Opt in to click-to-field: the edit targets to stamp on the public nodes inside one section's preview (this admin
   * preview only; the public site never gets them). Re-applied whenever the preview's content or these stamps change.
   * Without it the cards behave and render exactly as before.
   */
  stamps?: (sectionId: string) => readonly EditTargetStamp[];
  label?: string;
  /** Natural width the preview is laid out at, in px. Default 780. */
  previewWidth?: number;
  /**
   * transform scale used until the box has been measured (and where ResizeObserver is missing). Default .4. After that
   * the preview is scaled so its full width fits the card: a fixed scale clipped the right side of every section in
   * cards narrower than width × scale (Robinson's .46 × 780 = 359px in a ~306px card at 1280). Only the transform
   * changes; the box size is fixed, so this never shifts the page.
   */
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

function PreviewBox({ children, width, scale: fallbackScale, lazy, stamps }: { children: ReactNode; width: number; scale: number; lazy: boolean; stamps?: readonly EditTargetStamp[] }) {
  const { ref, near } = useNearViewport(lazy);
  const scale = useFitPreviewScale(ref, width, fallbackScale);
  const scope = `pv${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  // The public components hardcode ids; one preview per card would repeat them across the admin page.
  useEffect(() => {
    const node = ref.current;
    if (!node || !near) return;
    scopePreviewIds(node, scope);
    const observer = new MutationObserver(() => scopePreviewIds(node, scope));
    observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: SCOPED_PREVIEW_ATTRIBUTES });
    return () => observer.disconnect();
  }, [ref, near, scope]);
  const scaledRef = useRef<HTMLDivElement>(null);
  // Click-to-field: card previews are inert, non-iframe divs, so the stamps go straight onto their nodes.
  useEffect(() => {
    const node = scaledRef.current;
    return node && near && stamps ? watchEditTargetStamps(node, stamps) : undefined;
  }, [near, stamps]);
  return (
    <div ref={ref} className={styles.box} aria-hidden="true" inert data-preview-box="" data-preview-mounted={near}>
      {/* Placeholder under the preview: shown until it mounts, and while a consumer marks its mounted content data-preview-settling="true" until it settles (see the CSS). */}
      <Shimmer className={styles.placeholder} data-preview-placeholder="" />
      {near && (
        <div ref={scaledRef} className={styles.scaled} style={{ "--preview-width": `${width}px`, "--preview-scale": scale } as CSSProperties}>
          {children}
        </div>
      )}
    </div>
  );
}

/** The declared field under a viewport point inside a card's preview, or null (a field of another section is ignored). */
function fieldUnder(button: HTMLElement, sectionId: string, x: number, y: number) {
  const wrap = button.parentElement;
  const hit = wrap ? editTargetHitAt(wrap, x, y) : null;
  return hit && resolveEditTarget(hit.id)?.section === sectionId ? hit : null;
}

/** The hover outline is moved directly (no React state), so moving the mouse never re-renders the cards. */
function showFieldHover(button: HTMLElement, sectionId: string, x: number, y: number) {
  const clip = button.parentElement?.querySelector<HTMLElement>(":scope > [data-field-hover-clip]");
  const outline = clip?.firstElementChild as HTMLElement | null | undefined;
  if (!clip || !outline) return;
  const hit = fieldUnder(button, sectionId, x, y);
  if (!hit) { outline.hidden = true; delete outline.dataset.target; return; }
  const box = clip.getBoundingClientRect();
  outline.style.left = `${hit.rect.left - box.left}px`;
  outline.style.top = `${hit.rect.top - box.top}px`;
  outline.style.width = `${hit.rect.width}px`;
  outline.style.height = `${hit.rect.height}px`;
  outline.dataset.target = hit.id;
  outline.hidden = false;
}

function hideFieldHover(button: HTMLElement) {
  const outline = button.parentElement?.querySelector<HTMLElement>(":scope > [data-field-hover-clip] > [data-field-hover]");
  if (outline) { outline.hidden = true; delete outline.dataset.target; }
}

/**
 * One card per section with a live mini preview of the section as it looks on
 * the public page. The whole preview is a button named "Edit <title>". The
 * footer holds the title, an unsaved-edits dot, the show/hide switch or the
 * "Always shown" chip, and Edit. The preview box has a fixed size and is
 * scaled with transform and clipped, so loading or editing a preview never
 * moves the page. Until a preview mounts (lazy) or settles (a consumer that hides
 * its content and sets data-preview-settling="true", like Stadium's SettledPreview), the box
 * shows the kit's shimmer instead of an empty white box.
 */
export function PreviewCards({
  sections,
  renderPreview,
  onEdit,
  label = "Page sections",
  previewWidth = 780,
  previewScale = 0.4,
  lazy = true,
  stamps,
}: PreviewCardsProps) {
  return (
    <ul className={styles.grid} aria-label={label} data-preview-cards="">
      {sections.map((section) => {
        const controlled = hasVisibilityControl(section);
        const hidden = controlled && section.visible === false;
        return (
          <li key={section.id} className={styles.card} data-hidden={hidden || undefined} data-preview-card={section.id}>
            <div className={styles.previewWrap}>
              <PreviewBox width={previewWidth} scale={previewScale} lazy={lazy} stamps={stamps?.(section.id)}>{renderPreview(section.id)}</PreviewBox>
              <button
                type="button"
                className={`admin-press ${styles.previewButton}`}
                aria-label={`Edit ${section.title}`}
                tabIndex={-1}
                // A pointer click opens the field under the pointer; Enter or Space (detail 0) opens the section, as before.
                onClick={(event) => stamps
                  ? onEdit(section.id, event, event.detail > 0 ? fieldUnder(event.currentTarget, section.id, event.clientX, event.clientY)?.id : undefined)
                  : onEdit(section.id, event)}
                onPointerMove={stamps ? (event) => { if (event.pointerType === "mouse") showFieldHover(event.currentTarget, section.id, event.clientX, event.clientY); } : undefined}
                onPointerLeave={stamps ? (event) => hideFieldHover(event.currentTarget) : undefined}
                data-preview-button=""
                {...KIT_EDIT_PROPS}
              />
              {stamps && <span className={styles.fieldHoverClip} data-field-hover-clip="" aria-hidden="true"><span className={styles.fieldHover} data-field-hover="" hidden /></span>}
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
