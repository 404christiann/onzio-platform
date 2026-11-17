"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { ADMIN_MOTION_DURATIONS } from "@/lib/admin-motion";

/** A real CSS viewport keeps the public page's phone breakpoints honest. */
export default function ShopPreviewFrame({ children, host, phone, onSelect, classic = false, invalidPhotos = false, loading = false, skeleton }: {
  children: ReactNode;
  host: string;
  phone: boolean;
  onSelect: (target: string, opener?: HTMLElement) => void;
  classic?: boolean;
  invalidPhotos?: boolean;
  loading?: boolean;
  skeleton?: ReactNode;
}) {
  const layered = classic && skeleton !== undefined;
  const hasAuthoredContent = children != null;
  const [layoutReady, setLayoutReady] = useState(!loading);
  const delayed = useDelayedLoading(loading || (classic && !layoutReady));
  const loadingPhase = useRef(delayed.phase);
  loadingPhase.current = delayed.phase;
  useEffect(() => {
    if (!classic) return;
    if (loading) { setLayoutReady(false); return; }
    if (loadingPhase.current !== "skeleton") { setLayoutReady(true); return; }
    const timer = window.setTimeout(() => setLayoutReady(true), ADMIN_MOTION_DURATIONS.skeletonMinimum);
    return () => window.clearTimeout(timer);
  }, [classic, loading]);
  const frame = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const skeletonContent = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(390);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [contentHeight, setContentHeight] = useState(900);
  const [skeletonHeight, setSkeletonHeight] = useState(900);
  const previewWidth = phone ? 390 : 1440;
  const previewHeight = classic ? layered && !hasAuthoredContent ? skeletonHeight : contentHeight : phone ? 844 : 900;
  const showSkeletonLayer = layered && delayed.phase !== "content";
  const carrierHeight = showSkeletonLayer ? Math.max(previewHeight, skeletonHeight) : previewHeight;
  const scale = Math.min(1, availableWidth / previewWidth);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.clientWidth);
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!classic || !body || layered) return;
    const root = body.querySelector<HTMLElement>("[data-shop-editor-preview]");
    if (!root) return;
    const update = () => setContentHeight(Math.max(1, Math.ceil(root.getBoundingClientRect().height)));
    update();
    const resize = new ResizeObserver(update);
    resize.observe(root);
    return () => resize.disconnect();
  }, [classic, body, layered]);

  useLayoutEffect(() => {
    const element = skeletonContent.current;
    if (!showSkeletonLayer || !element) return;
    const update = () => setSkeletonHeight(Math.max(1, element.offsetHeight));
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    return () => resize.disconnect();
  }, [showSkeletonLayer]);

  useLayoutEffect(() => {
    if (!layered || !hasAuthoredContent || !body) return;
    const content = body.querySelector<HTMLElement>("[data-shop-preview-content]");
    if (!content) return;
    const update = () => setContentHeight(Math.max(1, Math.ceil(content.getBoundingClientRect().height)));
    update();
    const resize = new ResizeObserver(update);
    resize.observe(content);
    return () => resize.disconnect();
  }, [layered, hasAuthoredContent, body]);

  useEffect(() => {
    if (!body) return;
    const decorate = () => body.querySelectorAll<HTMLElement>("[data-shop-editor-target]").forEach((target) => {
      if (classic && target.dataset.shopEditorTarget === "cta" && target.parentElement?.closest("[data-shop-editor-target]")) {
        target.removeAttribute("data-shop-editor-target");
        target.tabIndex = -1;
        return;
      }
      const labels: Record<string, string> = { copy: "kit text", kit: "kit text", cta: "kit text", photos: "kit photos", purchase: "purchase details", photoRows: "photo row", fixed: "page copy" };
      const label = labels[target.dataset.shopEditorTarget ?? "copy"] ?? "kit text";
      target.tabIndex = 0;
      if (!target.matches("a,button")) target.setAttribute("role", "button");
      target.setAttribute("aria-label", `Edit ${classic ? label : target.dataset.shopEditorTarget}`);
      if (classic) {
        target.dataset.adminEditableRegion = "";
        target.dataset.editLabel = `Edit ${label}`;
        target.dataset.invalid = String(invalidPhotos && target.dataset.shopEditorTarget === "photos");
      }
    });
    decorate(); const observer = new MutationObserver(decorate); observer.observe(body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [body, classic, invalidPhotos]);

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
      <div className={`mx-auto ${layered ? "overflow-visible" : "overflow-hidden"} rounded-lg border border-slate-200 bg-white shadow-sm ${phone ? "max-w-[390px]" : "w-full"}`}>
        <div className="flex min-h-9 items-center gap-3 bg-slate-100 px-3 text-xs text-slate-600">
          <span aria-hidden="true">● ● ●</span><span className="truncate">{host} · Editing preview</span>
        </div>
        <div ref={viewport} className={"relative w-full " + (layered ? "overflow-visible" : "overflow-hidden")} data-shop-preview-carrier={layered ? "" : undefined} style={{ height: carrierHeight * scale }}><iframe
          ref={frame}
          title={phone ? "Phone Shop page preview" : "Desktop Shop page preview"}
          className={"absolute left-0 top-0 block border-0 bg-white" + (layered ? " rounded-b-lg" : "")}
          style={{ width: previewWidth, height: previewHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}
          srcDoc={`<!doctype html><html lang='en'><head>${classic ? "<style>.relative{position:relative}</style>" : ""}</head><body><div id='shop-preview-loading' role='status' style='padding:24px;color:#64748b;font:14px system-ui,sans-serif'>Preparing page preview…</div></body></html>`}
        />
          {showSkeletonLayer && <div
            data-shop-preview-skeleton-host=""
            data-phase={delayed.phase}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 overflow-hidden rounded-b-lg border border-t-0 border-slate-200 bg-white"
            style={{ left: -1, width: "calc(100% + 2px)", height: skeletonHeight * scale + 1 }}
          >
            <div ref={skeletonContent} data-shop-preview-skeleton="" style={{ width: previewWidth, display: "flow-root", transform: "scale(" + scale + ")", transformOrigin: "top left" }}>{skeleton}</div>
          </div>}
        </div>
        {layered && <style>{`[data-shop-preview-skeleton-host][data-phase="waiting"] { visibility:hidden; }
          [data-shop-preview-skeleton-host][data-phase="crossfade"] { animation:shop-host-conceal 160ms ease-out both; }
          @keyframes shop-host-conceal { from { opacity:1; } to { opacity:0; } }
          @media(prefers-reduced-motion:reduce) { [data-shop-preview-skeleton-host][data-phase="crossfade"] { animation-duration:120ms; } }`}</style>}
        {body && createPortal(
          <div
            ref={(node) => node?.ownerDocument.getElementById("shop-preview-loading")?.remove()}
            data-shop-editor-preview="true"
            data-shop-preview-layered={layered ? "" : undefined}
            style={layered ? { position: "relative" } : undefined}
            data-admin-loading-region={classic ? "" : undefined}
            data-phase={classic ? delayed.phase : undefined}
            aria-busy={classic ? delayed.phase !== "content" : undefined}
            inert={classic && !delayed.showContent ? true : undefined}
            aria-hidden={classic && !delayed.showContent ? true : undefined}
            onClickCapture={(event) => {
              const target = event.target as HTMLElement;
              const hotspot = target.closest<HTMLElement>("[data-shop-editor-target]");
              if (hotspot) {
                hotspot.focus({ preventScroll: true });
                onSelect(hotspot.dataset.shopEditorTarget ?? "copy", hotspot);
              }
              // The preview must never send fans to checkout or navigate the
              // admin away. Product tab and Front/Back controls still work.
              if (target.closest("a")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onKeyDownCapture={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              const hotspot = (event.target as HTMLElement).closest<HTMLElement>("[data-shop-editor-target]");
              if (hotspot) {
                event.preventDefault(); event.stopPropagation();
                if (classic) hotspot.click();
                else onSelect(hotspot.dataset.shopEditorTarget ?? "copy", hotspot);
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
              ${classic ? `
                [data-admin-editable-region] { position:relative; outline:2px solid transparent; outline-offset:-2px; }
                [data-admin-editable-region][data-invalid="true"] { outline-color:#c78300; }
                [data-admin-editable-region][data-invalid="true"]::before { content:"Add at least one photo before saving this kit."; position:absolute; inset:0; z-index:20; display:grid; place-items:center; padding:24px; background:#f1f5f9; color:#475569; font:16px system-ui,sans-serif; text-align:center; }
                [data-admin-editable-region]::after { content:attr(data-edit-label); position:absolute; right:8px; top:8px; z-index:30; padding:5px 10px; border-radius:99px; background:#2563eb; color:white; font:600 13px system-ui,sans-serif; opacity:0; transform:translateY(-2px); transition:opacity 140ms ease-out,transform 140ms ease-out; pointer-events:none; }
                [data-admin-editable-region]:hover::after, [data-admin-editable-region]:focus-visible::after { opacity:1; transform:none; }
                @media(hover:none) { [data-admin-editable-region]::after { opacity:1; transform:none; } }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="waiting"] { opacity:0; }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="skeleton"] [data-shop-editor-target] { background:#e2e8f0 !important; overflow:hidden; }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="skeleton"] :is(p,h1,h2,h3,li,a,dt,dd) { color:transparent !important; border-color:transparent !important; border-radius:6px; background:#cbd5e1 !important; }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="skeleton"] img { visibility:hidden; }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="skeleton"] [data-shop-editor-target]::after { content:""; inset:0; border-radius:0; opacity:1; background:linear-gradient(90deg,transparent,#ffffff55,transparent); transform:translateX(-100%); animation:shop-shimmer 1.6s ease-in-out infinite; }
                [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="crossfade"] { animation:shop-reveal 160ms ease-out both; }
                [data-shop-preview-content] { display:flow-root; }
                [data-shop-preview-layered]:is([data-phase="waiting"],[data-phase="skeleton"]) > [data-shop-preview-content] { visibility:hidden; opacity:0; }
                [data-shop-preview-layered][data-phase="crossfade"] > [data-shop-preview-content] { animation:shop-reveal 160ms ease-out both; }
                @media(prefers-reduced-motion:reduce) { [data-shop-preview-layered][data-phase="crossfade"] > [data-shop-preview-content] { animation:shop-reveal 120ms ease-out both !important; } }
                @keyframes shop-shimmer { to { transform:translateX(100%); } }
                @keyframes shop-reveal { from { opacity:0; } to { opacity:1; } }
                @media(prefers-reduced-motion:reduce) { [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="skeleton"] [data-shop-editor-target]::after { animation:none; transform:none; } [data-admin-loading-region]:not([data-shop-preview-layered])[data-phase="crossfade"] { animation-duration:120ms; } }
              ` : ""}
            `}</style>
            {layered ? <div data-shop-preview-content="">{children}</div> : children}
          </div>, body,
        )}
      </div>
    </div>
  );
}
