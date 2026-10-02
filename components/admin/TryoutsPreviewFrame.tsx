"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A real responsive CSS viewport, isolated from admin styles and navigation. */
export default function TryoutsPreviewFrame({ children, phone, host }: {
  children: ReactNode;
  phone: boolean;
  host: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [available, setAvailable] = useState(0);
  const width = phone ? 390 : 1280;
  const height = phone ? 720 : 760;
  const scale = available ? Math.min(1, available / width) : 1;

  useEffect(() => {
    const element = outer.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let active = true;
    let generation = 0;
    let observer: MutationObserver | undefined;
    const mount = () => {
      observer?.disconnect();
      const doc = element.contentDocument;
      if (!doc) return;
      const syncStyles = () => {
        const current = ++generation;
        const previous = Array.from(doc.head.querySelectorAll("[data-tryouts-preview-styles]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach((node) => {
          const copy = node.cloneNode(true) as HTMLElement;
          copy.dataset.tryoutsPreviewStyles = "true";
          if (copy instanceof HTMLLinkElement) pending.push(new Promise<void>((resolve) => {
            copy.addEventListener("load", () => resolve(), { once: true });
            copy.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(copy);
        });
        // The portal must mount even when a stylesheet link never fires load.
        // The cloned links continue loading inside the frame after mounting.
        if (active) setBody(doc.body);
        void Promise.race([
          Promise.all(pending),
          new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
        ]).then(() => {
          if (active && current === generation) previous.forEach((node) => node.remove());
        });
      };
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      syncStyles();
      observer = new MutationObserver(syncStyles);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    element.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); element.removeEventListener("load", mount); };
  }, []);

  return <div ref={outer} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 font-body text-xs text-muted-foreground">
      <span className="truncate">{host}/tryouts · Editing preview</span>
      <span className="shrink-0">{phone ? "Phone" : "Desktop"}</span>
    </div>
    <div className="relative overflow-hidden" style={{ height: height * scale }}>
      <iframe ref={frame} title="Tryouts page editing preview" srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
        style={{ width, height, position: "absolute", left: phone ? Math.max(0, (available - width * scale) / 2) : 0,
          transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }} />
      {body && createPortal(<div data-tryouts-preview onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("a,button:not([aria-pressed]),form")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }} onSubmitCapture={(event) => event.preventDefault()}>
        <style>{`html { scroll-behavior:auto !important; } body { margin:0; } [data-tryouts-preview] { min-height:100%; } [data-tryouts-preview] a,[data-tryouts-preview] button:not([aria-pressed]) { pointer-events:none; } [data-tryouts-preview] * { animation:none !important; }`}</style>
        {children}
      </div>, body)}
    </div>
  </div>;
}
