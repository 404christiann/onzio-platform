"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { PREVIEW_LINK_SELECTOR, usePreviewLinkGuard } from "@/components/admin/ui/editor-kit/previewLinkGuard";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import type { PieceId } from "@/lib/homepage-editor/model";
import { preparePreviewDocument } from "./preview-document";

const DECORATIONS = ["hp-piece-corners", "hp-piece-tag"];
const isDecoration = (node: Node) => node.nodeType === 1 && DECORATIONS.some(name => (node as HTMLElement).classList.contains(name));

/**
 * A real CSS viewport with a React portal; never loads or navigates the live URL.
 * `tags` (the reimagined admin, ADMIN-RE-09) adds a "Click to change" tag on
 * hover and a "Changed" tag on the pieces listed in `tags.changed`.
 * `label` names the previewed page (cinematic@2 editors reuse this frame).
 */
export default function HomepagePreviewFrame({ children, host, playback = false, label = "Homepage", tags, classic = false, loading = false, theme = "light" }: { children: ReactNode; host: string; playback?: boolean; label?: string; tags?: { changed: readonly string[] }; classic?: boolean; loading?: boolean; theme?: "light" | "dark" }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  usePreviewLinkGuard(iframe);
  const preview = useHomepagePreview();
  const [body, setBody] = useState<HTMLElement | null>(null);
  const tagsOn = !!tags;
  const delayed = useDelayedLoading(loading || !body);
  const initialDocument = useRef(classic ? classicLoadingDocument(theme) : "<!doctype html><html lang='en'><head></head><body></body></html>");
  useEffect(() => {
    const placeholder = iframe.current?.contentDocument?.getElementById("homepage-frame-loading");
    if (!placeholder || !classic) return;
    const root = placeholder.ownerDocument.documentElement;
    root.style.setProperty("--hp-frame-background", theme === "dark" ? "#111827" : "#fff");
    root.style.setProperty("--hp-frame-block", theme === "dark" ? "#273448" : "#e7ebf0");
    root.style.setProperty("--hp-frame-shine", theme === "dark" ? "#ffffff12" : "#ffffffa0");
    placeholder.dataset.theme = theme;
    placeholder.dataset.phase = delayed.phase;
    placeholder.hidden = delayed.phase === "content";
    placeholder.setAttribute("aria-hidden", String(delayed.showContent));
    if (body && delayed.showContent) body.style.background = "white";
  }, [body, classic, delayed.phase, delayed.showContent, theme]);
  const changedKey = tags ? tags.changed.join(" ") : "";
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
    // The empty-state placeholder is the target's own label, drawn by CSS as
    // ::before. It has to disappear the moment real content arrives or the label
    // stays glued to the front of whatever was just typed. The corner markers and
    // tags we append are our own decoration, so they never count as content.
    const isEmpty = (target: HTMLElement) => {
      if (Array.from(target.children).some(child => !isDecoration(child))) return false;
      return !Array.from(target.childNodes).some(node => !isDecoration(node) && node.textContent?.trim());
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
    if (!body || playback || !tagsOn) return;
    const changed = new Set(changedKey.split(" ").filter(Boolean));
    const tagged: HTMLElement[] = [];
    const decorations: HTMLElement[] = [];
    const tagTargets = () => {
      body.querySelectorAll<HTMLElement>("[data-homepage-piece]").forEach(target => {
        if (changed.has(target.dataset.homepagePiece ?? "")) target.dataset.homepagePieceChanged = "true";
        else delete target.dataset.homepagePieceChanged;
        if (!tagged.includes(target)) tagged.push(target);
        if (Array.from(target.children).some(child => child.classList.contains("hp-piece-tag"))) return;
        const tag = body.ownerDocument.createElement("span");
        tag.className = "hp-piece-tag";
        tag.setAttribute("aria-hidden", "true");
        tag.innerHTML = '<span data-tag="hint">Click to change</span><span data-tag="changed">Changed</span>';
        target.appendChild(tag);
        decorations.push(tag);
      });
    };
    tagTargets();
    const observer = new MutationObserver(tagTargets);
    observer.observe(body, { childList: true, subtree: true });
    return () => { observer.disconnect(); decorations.forEach(tag => tag.remove()); tagged.forEach(target => delete target.dataset.homepagePieceChanged); };
  }, [body, playback, tagsOn, changedKey]);
  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let observer: MutationObserver | undefined;
    let unprepare: (() => void) | undefined;
    let active = true;
    let styleGeneration = 0;
    const mount = () => {
      observer?.disconnect();
      const doc = frame.contentDocument;
      // A hidden iframe can expose its document before Chrome creates the
      // srcDoc roots. Its load event retries mounting once they are available.
      if (!doc?.documentElement || !doc.head || !doc.body) return;
      doc.documentElement.lang = "en";
      // Only root font classes; admin theme attributes never cross the frame.
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      // Scaled and clipped, the frame would leave lazy pictures unloaded and entrance effects unplayed (preview-document.ts).
      unprepare?.();
      unprepare = preparePreviewDocument(doc);
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
    return () => { active = false; observer?.disconnect(); unprepare?.(); frame.removeEventListener("load", mount); };
  }, []);
  return <div className="hp-browser" data-classic={classic || undefined} aria-busy={classic ? loading || !delayed.showContent : undefined}>
    <div className="hp-browser-chrome"><span aria-hidden="true">● ● ●</span><span>{host} · {label} preview</span></div>
    <iframe ref={iframe} title={label + " preview"} className="hp-preview-frame" srcDoc={initialDocument.current} />
    {body && createPortal(<div style={classic && !delayed.showContent ? { display: "none" } : undefined} data-homepage-preview="true" data-playback={playback} data-homepage-tags={tagsOn || undefined} onClickCapture={event => {
      if (playback) return;
      const target = event.target as HTMLElement;
      // The shared link guard (usePreviewLinkGuard) cancels every link click and halts it before React's bubble phase, where a
      // piece's own onClick selects it. So a click on a link inside a piece selects that piece here, in the capture phase
      // (innermost piece, as the bubbling onClick would). Other clicks still reach the piece's onClick.
      if (target.closest(PREVIEW_LINK_SELECTOR)) {
        const piece = target.closest<HTMLElement>("[data-homepage-piece]")?.dataset.homepagePiece;
        if (piece) preview?.select(piece as PieceId);
      }
      if (target.closest("button,iframe")) event.preventDefault();
    }}>
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
        [data-homepage-piece] > .hp-piece-tag { display:none; }
        [data-homepage-tags] [data-homepage-piece] > .hp-piece-tag { position:absolute; z-index:4; left:-6px; bottom:calc(100% + 12px); align-items:center; padding:5px 9px; border-radius:999px; background:#5b21b6; color:#fff; font:600 12px/16px system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:normal; text-transform:none; text-align:left; white-space:nowrap; pointer-events:none; box-shadow:0 4px 12px #1b103a33; }
        [data-homepage-tags] .hp-piece-tag [data-tag="changed"] { display:none; }
        [data-homepage-tags] [data-homepage-piece]:not([aria-pressed="true"]):hover > .hp-piece-tag,
        [data-homepage-tags] [data-homepage-piece]:not([aria-pressed="true"]):focus-visible > .hp-piece-tag,
        [data-homepage-tags] [data-homepage-piece][data-homepage-piece-changed="true"] > .hp-piece-tag { display:inline-flex; }
        [data-homepage-tags] [data-homepage-piece][data-homepage-piece-changed="true"] > .hp-piece-tag { background:#166534; }
        [data-homepage-tags] [data-homepage-piece][data-homepage-piece-changed="true"] > .hp-piece-tag [data-tag="hint"] { display:none; }
        [data-homepage-tags] [data-homepage-piece][data-homepage-piece-changed="true"] > .hp-piece-tag [data-tag="changed"] { display:inline; }
        @media(prefers-reduced-motion:reduce) { [data-homepage-preview] * { animation:none !important; transition:none !important; } }
      `}</style>
      {children}
    </div>, body)}
  </div>;
}

/** Painted inside the isolated viewport, before copied styles or fonts settle. */
function classicLoadingDocument(theme: "light" | "dark") {
  const dark = theme === "dark";
  const background = dark ? "#111827" : "#fff";
  const block = dark ? "#273448" : "#e7ebf0";
  return `<!doctype html><html lang="en"><head><style>
    html{--hp-frame-background:${background};--hp-frame-block:${block};--hp-frame-shine:${dark ? "#ffffff12" : "#ffffffa0"}}html,body{margin:0;background:var(--hp-frame-background)}html:has(#homepage-frame-loading:not([hidden])),body:has(#homepage-frame-loading:not([hidden])){height:100%;overflow:hidden}
    #homepage-frame-loading{position:absolute;inset:0;z-index:10;background:var(--hp-frame-background);opacity:0;animation:hp-skeleton-reveal 1ms 150ms forwards;transition:opacity 160ms ease-out;padding:clamp(24px,5vw,64px);box-sizing:border-box}
    #homepage-frame-loading[data-phase="skeleton"]{opacity:1;animation:none}
    #homepage-frame-loading[data-phase="crossfade"],#homepage-frame-loading[data-phase="content"]{opacity:0;pointer-events:none;animation:none}
    .hp-frame-block{display:block;position:relative;overflow:hidden;background:var(--hp-frame-block);border-radius:8px;height:20px;margin-bottom:18px}
    .hp-frame-block::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,var(--hp-frame-shine),transparent);animation:hp-frame-shimmer 1.6s ease-in-out infinite}
    .hp-frame-eyebrow{width:26%;height:16px;margin-top:6%}.hp-frame-title{width:80%;height:54px}.hp-frame-line{width:65%}.hp-frame-image{margin-top:40px;width:100%;height:280px}.hp-frame-buttons{display:flex;gap:12px}.hp-frame-buttons i{width:140px;height:44px}
    @keyframes hp-skeleton-reveal{to{opacity:1}}@keyframes hp-frame-shimmer{to{transform:translateX(100%)}}
    @media(max-width:500px){.hp-frame-title{height:42px;width:94%}.hp-frame-line{width:92%}.hp-frame-image{height:250px}.hp-frame-buttons i{width:45%}}
    @media(prefers-reduced-motion:reduce){.hp-frame-block::after{animation:none;display:none}#homepage-frame-loading{transition-duration:120ms}}
  </style></head><body><div id="homepage-frame-loading" role="status" aria-label="Loading homepage preview" data-theme="${theme}"><i class="hp-frame-block hp-frame-eyebrow"></i><i class="hp-frame-block hp-frame-title"></i><i class="hp-frame-block hp-frame-title"></i><i class="hp-frame-block hp-frame-line"></i><i class="hp-frame-block hp-frame-line"></i><div class="hp-frame-buttons"><i class="hp-frame-block"></i><i class="hp-frame-block"></i></div><i class="hp-frame-block hp-frame-image"></i></div></body></html>`;
}
