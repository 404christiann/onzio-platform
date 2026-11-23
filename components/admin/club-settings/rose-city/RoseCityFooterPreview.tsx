"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import CinematicAvenirFonts from "@/components/cinematic/CinematicAvenirFonts";
import { usePreviewLinkGuard } from "@/components/admin/ui/editor-kit/previewLinkGuard";
import "@/components/cinematic/cinematic.css";
import styles from "./RoseCityFooterPreview.module.css";

/**
 * The public footer's sizes are viewport units scoped under `.cinematic-site` (cinematic.css: logo 5.8vw, crest 5.5vw,
 * icons 2vw). The preview lays the real footer out in an iframe this wide, so those rules resolve exactly as they do on
 * a 1440px desktop, then scales the result down. No size is restated here, so the preview cannot drift from the site.
 */
export const FOOTER_PREVIEW_VIEWPORT = 1440;
/** The frame's fixed height at 1440px, reserved before anything loads: the desktop footer with a typical logo. */
export const FOOTER_PREVIEW_HEIGHT = 264;

/** Fits the footer inside the fixed frame: full width when it is the usual height, shrunk and centred when a tall logo makes it taller. */
export function fitFooterPreview(boxWidth: number, footerHeight: number) {
  const boxHeight = (boxWidth * FOOTER_PREVIEW_HEIGHT) / FOOTER_PREVIEW_VIEWPORT;
  const scale = Math.min(boxWidth / FOOTER_PREVIEW_VIEWPORT, footerHeight > 0 ? boxHeight / footerHeight : Infinity);
  return { scale, boxHeight, x: (boxWidth - FOOTER_PREVIEW_VIEWPORT * scale) / 2, y: Math.max(0, (boxHeight - footerHeight * scale) / 2) };
}

const FRAME_CSS = `html{overflow:hidden}body{margin:0;background:#fff}*{animation:none!important;transition:none!important}a{pointer-events:none}`;
const IMAGE_WAIT_MS = 3000;

/**
 * The real public footer (passed as children) at desktop size, in a fixed frame that never moves the dialog.
 * `loading` holds the frame back while the footer's own content (its footer logo) is still on the way.
 */
export function RoseCityFooterPreview({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const root = useRef<HTMLDivElement>(null);
  usePreviewLinkGuard(frame);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [footerHeight, setFooterHeight] = useState(FOOTER_PREVIEW_HEIGHT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => setBoxWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Copy the admin's stylesheets (cinematic.css among them) into the frame, and keep them in step.
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let active = true;
    let generation = 0;
    let observer: MutationObserver | undefined;
    const mount = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc?.documentElement || !doc.head || !doc.body) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      const sync = () => {
        const current = ++generation;
        const previous = Array.from(doc.head.querySelectorAll("[data-footer-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.footerPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise(resolve => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        // A stylesheet that never answers must not keep the preview hidden for good.
        const stalled = new Promise<void>(resolve => window.setTimeout(resolve, IMAGE_WAIT_MS));
        void Promise.race([Promise.all(pending), stalled]).then(() => {
          // Only the newest sync, on the frame's current document, mounts the footer.
          if (!active || current !== generation || doc !== iframe.contentDocument) return;
          previous.forEach(node => node.remove());
          setBody(doc.body);
        });
      };
      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    iframe.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); iframe.removeEventListener("load", mount); };
  }, []);

  // Follow the footer's real height (a tall logo makes it taller), and show it once its images settle.
  useEffect(() => {
    const node = root.current;
    const view = body?.ownerDocument.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!node || !view || loading) return;
    const update = () => { const height = Math.ceil(node.getBoundingClientRect().height); if (height > 0) setFooterHeight(height); };
    update();
    const observer = new view.ResizeObserver(update);
    observer.observe(node);
    const images = Array.from(node.querySelectorAll("img"));
    const settled = images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }));
    let active = true;
    const timeout = view.setTimeout(() => { if (active) setReady(true); }, IMAGE_WAIT_MS);
    void Promise.all(settled).then(() => { if (active) setReady(true); });
    return () => { active = false; observer.disconnect(); view.clearTimeout(timeout); };
  }, [body, loading]);

  const fit = fitFooterPreview(boxWidth, footerHeight);
  return (
    <div
      ref={box}
      className={styles.box}
      style={{ aspectRatio: `${FOOTER_PREVIEW_VIEWPORT} / ${FOOTER_PREVIEW_HEIGHT}` }}
      data-footer-preview=""
      data-ready={ready || undefined}
    >
      <iframe
        ref={frame}
        title="Website footer preview"
        tabIndex={-1}
        aria-hidden="true"
        className={styles.frame}
        style={{
          width: FOOTER_PREVIEW_VIEWPORT,
          height: Math.max(footerHeight, FOOTER_PREVIEW_HEIGHT),
          transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
        } as CSSProperties}
        srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
      />
      {body && createPortal(
        <div ref={root} className="cinematic-site" data-footer-preview-root="" style={{ display: "flow-root" }}>
          <style>{FRAME_CSS}</style>
          <CinematicAvenirFonts />
          {!loading && children}
        </div>,
        body,
      )}
    </div>
  );
}
