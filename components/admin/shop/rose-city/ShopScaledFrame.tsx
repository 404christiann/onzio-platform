"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EDIT_TARGET_ATTRIBUTE, EDIT_TARGET_SELECTOR, resolveEditTarget, type EditTargetId } from "@/lib/admin-edit-targets";
import { watchEditTargetStamps, type EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import styles from "./ShopScaledFrame.module.css";

export type ShopFrameTarget = "copy" | "cta" | "photos" | "photoRows" | "editions" | "purchase" | "details" | "attributes" | "sizeChart" | "map" | "sponsors" | string;

const LABELS: Record<string, string> = {
  copy: "Edit kit text", cta: "Edit kit text", photos: "Edit kit photos", photoRows: "Edit photo row", editions: "Edit jersey options",
  purchase: "Edit purchase details", details: "Edit jersey details", attributes: "Edit care line", sizeChart: "Edit size chart", map: "Edit route map", sponsors: "Edit partner strip",
};

/** Mounts the frame only once the box has been near the viewport, so five frames do not all load at once. */
function useNearViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return { ref, near };
}

/**
 * A fixed-size box that shows part of the real public Shop page. The page is laid out in an
 * iframe `naturalWidth` px wide (so the public page's own phone and desktop breakpoints apply),
 * then scaled with a transform to the box width. The box keeps one aspect ratio, so nothing
 * around it moves while the preview loads or while edits change its height. Inside, only the
 * parts named by `css` show; a click on a part reports its data-shop-editor-target.
 *
 * Click to field (UI-PREVIEW-CLICK-SHOP): `stamps` put a data-edit-target on the nodes inside the frame that show one field
 * (once, then again whenever the page inside changes). A pointer click reads the field under the pointer with the browser's own
 * hit test (`closest("[data-edit-target]")`: the frame is same-origin, already catches clicks, and stamped nodes take pointer
 * events) and reports it with the part. A click with no field under it, and anything that is not a pointer click, reports the
 * part alone, as before. The preview never follows links, takes focus or reads out to a screen reader: the buttons beside
 * it do that job.
 */
export function ShopScaledFrame({ naturalWidth, naturalHeight, css, onSelect, children, label, stamps }: {
  naturalWidth: number; naturalHeight: number; css: string; onSelect: (target: ShopFrameTarget, field?: EditTargetId) => void; children: ReactNode; label: string;
  stamps?: readonly EditTargetStamp[];
}) {
  const { ref: box, near } = useNearViewport();
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  // The skeleton-shaped box (naturalHeight) holds until the page inside is measured; after that the box is as tall as the page.
  const [measured, setMeasured] = useState<number | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => { if (element.clientWidth) setScale(element.clientWidth / naturalWidth); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box, naturalWidth]);

  useEffect(() => {
    const iframe = frame.current;
    if (!near || !iframe) return;
    let observer: MutationObserver | undefined;
    let active = true;
    const mount = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      setBody(doc.body);
      const sync = () => {
        const old = Array.from(doc.head.querySelectorAll("[data-shop-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(style => {
          const clone = style.cloneNode(true) as HTMLElement;
          clone.dataset.shopPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise(resolve => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        void Promise.all(pending).then(() => { if (active) old.forEach(node => node.remove()); });
      };
      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    iframe.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); iframe.removeEventListener("load", mount); };
  }, [near]);

  // Name each part for the hover chip and keep everything inside out of the tab order.
  useEffect(() => {
    if (!body) return;
    const decorate = () => {
      body.querySelectorAll<HTMLElement>("[data-shop-editor-target]").forEach(target => {
        target.dataset.editLabel = LABELS[target.dataset.shopEditorTarget ?? ""] ?? "Edit";
      });
      body.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[tabindex]").forEach(element => { element.tabIndex = -1; });
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [body]);

  // Put each field's id on the public node that shows it. Only this admin preview does; the public components gain nothing.
  useEffect(() => (body && stamps ? watchEditTargetStamps(body, stamps) : undefined), [body, stamps]);

  // Measure the real height of the preview, and follow it as edits change it, so nothing is ever clipped.
  useEffect(() => {
    if (!body) return;
    const node = root.current;
    const view = body.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    if (!node || !view) return;
    const update = () => { const height = Math.ceil(node.getBoundingClientRect().height); if (height > 0) setMeasured(height); };
    update();
    const observer = new view.ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [body]);

  const height = measured ?? naturalHeight;
  const ready = scale !== null && body !== null && measured !== null;
  return <div ref={box} className={styles.box} style={{ aspectRatio: `${naturalWidth} / ${height}` }} data-shop-scaled-frame="" data-ready={ready || undefined}>
    {near && <iframe
      ref={frame}
      title={label}
      tabIndex={-1}
      aria-hidden="true"
      className={styles.frame}
      style={{ width: naturalWidth, height, transform: `scale(${scale ?? 1})` }}
      srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
    />}
    {body && createPortal(
      <div
        ref={root}
        data-shop-editor-preview="true"
        style={{ display: "flow-root" }}
        aria-hidden="true"
        onClickCapture={event => {
          const target = event.target as HTMLElement;
          if (target.closest("a")) { event.preventDefault(); }
          const hotspot = target.closest<HTMLElement>("[data-shop-editor-target]");
          // Only a pointer click names a field (detail 0 is the keyboard or a script); an undeclared id names none.
          const field = event.detail > 0 ? resolveEditTarget(target.closest(EDIT_TARGET_SELECTOR)?.getAttribute(EDIT_TARGET_ATTRIBUTE))?.id : undefined;
          if (hotspot || field) onSelect(hotspot?.dataset.shopEditorTarget ?? "copy", field);
        }}
        onSubmitCapture={event => event.preventDefault()}
      >
        <style>{`
          html { scroll-behavior:auto !important; overflow:hidden; }
          body { margin:0; background:#fff; }
          a, button { pointer-events:none; }
          [data-shop-editor-target] { cursor:pointer; pointer-events:auto; position:relative; }
          [data-edit-target] { cursor:pointer; pointer-events:auto; }
          [data-shop-editor-target]:hover { outline:3px solid #0a63d6; outline-offset:-3px; }
          [data-edit-target]:hover { outline:3px solid #0a63d6; outline-offset:2px; }
          [data-shop-editor-target]:has([data-edit-target]:hover) { outline:none; }
          [data-shop-editor-target]:has([data-edit-target]:hover)::after { display:none; }
          [data-shop-editor-target]:hover::after { content:attr(data-edit-label); position:absolute; top:10px; right:10px; z-index:30; padding:6px 14px; border-radius:99px; background:#0a63d6; color:#fff; font:600 15px system-ui,sans-serif; pointer-events:none; }
          .shop-feature .shop-copy [data-shop-editor-target]:hover::after { top:0; }
          * { animation:none !important; transition:none !important; }
          ${css}
        `}</style>
        {children}
      </div>, body,
    )}
  </div>;
}
