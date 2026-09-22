"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A real CSS viewport with a React portal; never loads or navigates the live URL. */
export default function HomepagePreviewFrame({ children, host, playback = false }: { children: ReactNode; host: string; playback?: boolean }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!body || playback) return;
    const originals = new Map<HTMLElement, boolean>();
    const decorations: HTMLElement[] = [];
    const emptyTargets: HTMLElement[] = [];
    const isolateControls = () => {
      body.querySelectorAll<HTMLElement>('[data-homepage-piece] a,[data-homepage-piece] button,[data-homepage-piece] input,video,iframe').forEach(control => {
        if (control.hasAttribute("data-homepage-piece")) return;
        if (!originals.has(control)) originals.set(control, control.inert);
        control.inert = true;
      });
    };
    const isCorners = (node: Node) => node.nodeType === 1 && (node as HTMLElement).classList.contains("hp-piece-corners");
    // The empty-state placeholder is the target's own label, drawn by CSS as
    // ::before. It has to disappear the moment real content arrives or the label
    // stays glued to the front of whatever was just typed. The corner markers we
    // append are our own decoration, so they never count as content.
    const isEmpty = (target: HTMLElement) => {
      if (Array.from(target.children).some(child => !isCorners(child))) return false;
      return !Array.from(target.childNodes).some(node => !isCorners(node) && node.textContent?.trim());
    };
    const decorateTargets = () => {
      body.querySelectorAll<HTMLElement>('[data-homepage-piece]').forEach(target => {
        if (isEmpty(target)) {
          target.dataset.homepagePieceEmpty = "true";
          if (!emptyTargets.includes(target)) emptyTargets.push(target);
        } else {
          delete target.dataset.homepagePieceEmpty;
        }
        if (!Array.from(target.children).some(child => child.classList.contains("hp-piece-corners"))) {
          const corners = body.ownerDocument.createElement("span");
          corners.className = "hp-piece-corners";
          corners.setAttribute("aria-hidden", "true");
          corners.innerHTML = "<i></i><i></i><i></i><i></i>";
          target.appendChild(corners);
          decorations.push(corners);
        }
      });
    };
    isolateControls();
    decorateTargets();
    const observer = new MutationObserver(() => { isolateControls(); decorateTargets(); });
    observer.observe(body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); decorations.forEach(decoration => decoration.remove()); emptyTargets.forEach(target => delete target.dataset.homepagePieceEmpty); originals.forEach((inert, control) => { control.inert = inert; }); };
  }, [body, playback]);
  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let observer: MutationObserver | undefined;
    let active = true;
    let styleGeneration = 0;
    const mount = () => {
      observer?.disconnect();
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.documentElement.lang = "en";
      // Only root font classes; admin theme attributes never cross the frame.
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      const syncStyles = () => {
        const generation = ++styleGeneration;
        const pending: Promise<void>[] = [];
        const previousStyles = Array.from(doc.head.querySelectorAll("[data-preview-styles]"));
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.previewStyles = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise<void>(resolve => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        // Mount public components only after the copied CSS is available.
        // fonts.ready alone can resolve before a stylesheet starts loading.
        void Promise.all(pending).then(() => {
          if (active && generation === styleGeneration) {
            previousStyles.forEach(node => node.remove());
            setBody(doc.body);
          }
        });
      };
      syncStyles();
      observer = new MutationObserver(syncStyles);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    frame.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); frame.removeEventListener("load", mount); };
  }, []);
  return <div className="hp-browser">
    <div className="hp-browser-chrome"><span aria-hidden="true">● ● ●</span><span>{host} · Homepage preview</span></div>
    <iframe ref={iframe} title="Homepage preview" className="hp-preview-frame" srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>" />
    {body && createPortal(<div data-homepage-preview="true" data-playback={playback} onClickCapture={event => {
      const target = event.target as HTMLElement;
      const blocked = target.closest(playback ? "a,form" : "a,button,iframe");
      if (blocked) event.preventDefault();
      // Stop Next Link/router handlers too: preventDefault alone does not stop
      // React handlers in portal descendants from navigating the parent app.
      if (target.closest("a") && (playback || !target.closest("[data-homepage-piece]"))) event.stopPropagation();
    }} onSubmitCapture={event => event.preventDefault()}>
      <style>{`
        html { scroll-behavior: auto !important; }
        body { margin: 0; }
        [data-homepage-preview][data-playback="false"] video,[data-homepage-preview][data-playback="false"] iframe { pointer-events:none; }
        [data-homepage-preview][data-playback="false"] [data-homepage-shared] { display:none !important; }
        [data-homepage-piece] { cursor:pointer; outline-offset:5px; position:relative; min-height:44px; min-width:44px; }
        /* Selection button semantics must not pick up Academy CTA typography. */
        [data-homepage-preview] [data-font-pack="academy"] [data-homepage-piece].font-display:not(a):not(button) { font-family:var(--font-display); }
        [data-homepage-piece] { outline:1px solid #b8b1d4; outline-offset:4px; }
        [data-homepage-piece]:focus-visible { outline:2px dashed #a855f7; }
        [data-homepage-piece][aria-pressed="true"] { outline:2px solid #a855f7; outline-offset:5px; }
        [data-homepage-piece] > .hp-piece-corners { display:none; position:absolute; z-index:3; inset:-10px; pointer-events:none; }
        [data-homepage-piece][aria-pressed="true"] > .hp-piece-corners { display:block; }
        .hp-piece-corners i { position:absolute; width:10px; height:10px; border:2px solid #a855f7; border-radius:50%; background:#fff; }
        .hp-piece-corners i:nth-child(1) { left:0; top:0; } .hp-piece-corners i:nth-child(2) { right:0; top:0; } .hp-piece-corners i:nth-child(3) { left:0; bottom:0; } .hp-piece-corners i:nth-child(4) { right:0; bottom:0; }
        [data-homepage-piece]:empty { min-height:44px; }
        [data-homepage-piece][data-homepage-piece-empty="true"]::before { content:attr(aria-label); font:600 11px system-ui; opacity:.94; }
        [data-homepage-preview][data-playback="false"] * { animation:none !important; transition:none !important; }
        @media(prefers-reduced-motion:reduce) { [data-homepage-preview] * { animation:none !important; transition:none !important; } }
      `}</style>
      {children}
    </div>, body)}
  </div>;
}
