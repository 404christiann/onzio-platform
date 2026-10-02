"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A real CSS viewport keeps the public page's phone breakpoints honest. */
export default function ShopPreviewFrame({ children, host, phone, onSelect }: {
  children: ReactNode;
  host: string;
  phone: boolean;
  onSelect: (target: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let observer: MutationObserver | undefined;
    let active = true;
    let generation = 0;
    const mount = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      // Mount the public page as soon as the iframe document exists. A slow or
      // stalled stylesheet must not leave its entire canvas empty.
      setBody(doc.body);
      const sync = () => {
        const current = ++generation;
        const old = Array.from(doc.head.querySelectorAll("[data-shop-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach((style) => {
          const clone = style.cloneNode(true) as HTMLElement;
          clone.dataset.shopPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise((resolve) => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        void Promise.all(pending).then(() => {
          if (!active || current !== generation) return;
          old.forEach((node) => node.remove());
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

  return (
    <div className="min-w-0 rounded-xl border border-border bg-white p-2 sm:p-3">
      <div className={`mx-auto overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${phone ? "max-w-[390px]" : "w-full"}`}>
        <div className="flex min-h-9 items-center gap-3 bg-slate-100 px-3 text-xs text-slate-500">
          <span aria-hidden="true">● ● ●</span><span className="truncate">{host} · Editing preview</span>
        </div>
        <iframe
          ref={frame}
          title={phone ? "Phone Shop page preview" : "Desktop Shop page preview"}
          className="block h-[640px] w-full border-0 bg-white sm:h-[760px]"
          srcDoc="<!doctype html><html lang='en'><head></head><body><div id='shop-preview-loading' role='status' style='padding:24px;color:#64748b;font:14px system-ui,sans-serif'>Preparing page preview…</div></body></html>"
        />
        {body && createPortal(
          <div
            ref={(node) => node?.ownerDocument.getElementById("shop-preview-loading")?.remove()}
            data-shop-editor-preview="true"
            onClickCapture={(event) => {
              const target = event.target as HTMLElement;
              const hotspot = target.closest<HTMLElement>("[data-shop-editor-target]");
              if (hotspot) onSelect(hotspot.dataset.shopEditorTarget ?? "copy");
              // The preview must never send fans to checkout or navigate the
              // admin away. Product tab and Front/Back controls still work.
              if (target.closest("a")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onSubmitCapture={(event) => event.preventDefault()}
          >
            <style>{`
              html { scroll-behavior:auto !important; }
              body { margin:0; }
              [data-shop-editor-target] { cursor:pointer; outline-offset:3px; }
              [data-shop-editor-target]:hover { outline:2px solid #6b5cd6; }
              [data-shop-editor-target]:focus-visible { outline:3px solid #6b5cd6; }
              @media(prefers-reduced-motion:reduce) { [data-shop-editor-preview] * { animation:none !important; transition:none !important; } }
            `}</style>
            {children}
          </div>, body,
        )}
      </div>
    </div>
  );
}
