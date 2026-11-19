"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from "react";
import { IconAdd, IconCaretDown, IconCaretUp } from "@/components/admin/icons";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { KIT_EDIT_PROPS } from "@/components/admin/ui/editor-kit";
import { SCOPED_PREVIEW_ATTRIBUTES, scopePreviewIds } from "@/components/admin/ui/editor-kit/scopePreviewIds";
import styles from "./ItemPreviewCards.module.css";

/**
 * One card per list item (a partner, an injury), each showing the item as the public page draws it.
 * Same look as the kit's PreviewCards (fixed preview box, scaled and clipped, 64px footer), plus the
 * move earlier / later buttons a list needs and a final "Add" card. The preview box has a fixed size,
 * so loading or editing a preview never moves the page.
 */

export type ItemCardFlag = { text: string; tone: "needed" | "note" };
export type ItemCardItem = {
  id: string;
  /** What the item is called, for button names ("Foothill Transit"). */
  label: string;
  /** This item's content or position differs from the saved page. */
  changed?: boolean;
  flags?: readonly ItemCardFlag[];
};

export type ItemPreviewCardsProps = {
  items: readonly ItemCardItem[];
  /** The item as it looks on the public page. Rendered inert. */
  renderPreview: (id: string) => ReactNode;
  /** The event's currentTarget is the pressed button: pass it to useEditorDialog().openSection so focus returns to it. */
  onEdit: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  /** Singular noun for button names: "partner", "injury". */
  noun: string;
  label: string;
  disabled: boolean;
  add: { label: string; count: string; disabled: boolean; onAdd: (event: MouseEvent<HTMLButtonElement>) => void; hint?: string };
  /** The scale the public item is drawn at inside the box. Default .72. */
  previewScale?: number;
  lazy?: boolean;
  /** Extra class on the preview content, for the one place a public page's own page-level parts are hidden. */
  previewClassName?: string;
  /** The add card's ref, so focus can return to it after the last item is removed. */
  addRef?: Ref<HTMLButtonElement>;
};

function useNearViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!enabled);
  useEffect(() => {
    if (near || !enabled) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, near]);
  return { ref, near };
}

function PreviewBox({ children, scale, lazy, className }: { children: ReactNode; scale: number; lazy: boolean; className?: string }) {
  const { ref, near } = useNearViewport(lazy);
  const scope = `ic${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  // The public components hardcode ids; one preview per card would repeat them across the admin page.
  useEffect(() => {
    const node = ref.current;
    if (!node || !near) return;
    scopePreviewIds(node, scope);
    const observer = new MutationObserver(() => scopePreviewIds(node, scope));
    observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: SCOPED_PREVIEW_ATTRIBUTES });
    return () => observer.disconnect();
  }, [ref, near, scope]);
  return <div ref={ref} className={styles.box} aria-hidden="true" inert data-preview-box="" data-preview-mounted={near}>
    <Shimmer className={styles.placeholder} data-preview-placeholder="" />
    {near && <div className={`${styles.scaled}${className ? ` ${className}` : ""}`} style={{ "--preview-scale": scale } as CSSProperties}>{children}</div>}
  </div>;
}

export function ItemPreviewCards({ items, renderPreview, onEdit, onMove, noun, label, disabled, add, previewScale = 0.72, lazy = true, previewClassName, addRef }: ItemPreviewCardsProps) {
  const hintId = useId();
  return <ul className={styles.grid} aria-label={label} data-item-cards="">
    {items.map((item, index) => <li key={item.id} className={styles.card} data-item-card={item.id}>
      <div className={styles.previewWrap}>
        <PreviewBox scale={previewScale} lazy={lazy} className={previewClassName}>{renderPreview(item.id)}</PreviewBox>
        <button type="button" className={`admin-press ${styles.previewButton}`} aria-label={`Edit ${item.label}`} tabIndex={-1} disabled={disabled}
          onClick={event => onEdit(item.id, event)} data-preview-button="" {...KIT_EDIT_PROPS} />
      </div>
      <div className={styles.foot}>
        <span className={styles.number}>
          <span>#{index + 1}</span>
          {item.changed && <span className={styles.dot} title="Unsaved edits" data-unsaved-dot=""><span className="sr-only"> (unsaved edits)</span></span>}
          {item.flags?.map(flag => <span key={flag.text} className={styles.flag} data-tone={flag.tone}>{flag.text}</span>)}
        </span>
        <span className={styles.controls}>
          <button type="button" className={`admin-press ${styles.icon}`} aria-label={`Move ${item.label} earlier`} data-move={`${item.id}:-1`}
            disabled={disabled || index === 0} onClick={() => onMove(item.id, -1)}><IconCaretUp size={16} aria-hidden="true" /></button>
          <button type="button" className={`admin-press ${styles.icon}`} aria-label={`Move ${item.label} later`} data-move={`${item.id}:1`}
            disabled={disabled || index === items.length - 1} onClick={() => onMove(item.id, 1)}><IconCaretDown size={16} aria-hidden="true" /></button>
          <button type="button" className={`admin-press ${styles.edit}`} aria-label={`Edit ${item.label} ${noun}`} disabled={disabled}
            onClick={event => onEdit(item.id, event)} data-preview-edit="" {...KIT_EDIT_PROPS}>Edit</button>
        </span>
      </div>
    </li>)}
    <li className={styles.addItem}>
      <button ref={addRef} type="button" className={`admin-press ${styles.add}`} disabled={disabled || add.disabled} onClick={add.onAdd} aria-describedby={add.hint ? hintId : undefined} data-add-item="">
        <IconAdd size={20} aria-hidden="true" />
        <b>{add.label}</b>
        <span>{add.count}</span>
      </button>
      {add.hint && <p id={hintId} className={styles.addHint}>{add.hint}</p>}
    </li>
  </ul>;
}

/** The same grid with fixed boxes and 64px footers, for the loading state. */
export function ItemPreviewCardsSkeleton({ count = 6 }: { count?: number }) {
  return <ul className={styles.grid} aria-hidden="true" data-item-cards-skeleton="">
    {Array.from({ length: count }, (_, index) => <li key={index} className={styles.card}>
      <div className={styles.previewWrap}><Shimmer className={`${styles.box} ${styles.skeletonBox}`} /></div>
      <div className={styles.foot}>
        <Shimmer className={styles.skeletonNumber} />
        <span className={styles.controls}><Shimmer className={styles.skeletonIcon} /><Shimmer className={styles.skeletonIcon} /><Shimmer className={styles.skeletonEdit} /></span>
      </div>
    </li>)}
  </ul>;
}
