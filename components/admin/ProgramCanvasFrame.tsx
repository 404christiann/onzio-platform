"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { markPageEditorFocusTarget } from "@/lib/page-editor-focus";

/** A real, responsive public viewport. It never requests the live public URL. */
export default function ProgramCanvasFrame({
  children,
  path,
  onSelect,
  onProgramLink,
  classic = false,
  device,
  autoHeight = false,
  hiddenPrograms = [],
  programLabels = {},
  editableSections,
  onReady,
  onEscape,
}: {
  children: ReactNode;
  path: string;
  onSelect: (section: string, opener?: HTMLElement) => void;
  onProgramLink?: (slug: string, opener?: HTMLElement) => void;
  classic?: boolean;
  device?: "desktop" | "phone";
  autoHeight?: boolean;
  hiddenPrograms?: readonly string[];
  programLabels?: Readonly<Record<string, string>>;
  editableSections?: readonly string[];
  onReady?: (ready: boolean) => void;
  onEscape?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let observer: MutationObserver | undefined;
    let alive = true;
    let generation = 0;
    const mount = () => {
      observer?.disconnect();
      const documentInFrame = frame.contentDocument;
      if (!documentInFrame) return;
      documentInFrame.documentElement.lang = "en";
      documentInFrame.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      const sync = () => {
        const current = ++generation;
        const oldStyles = Array.from(documentInFrame.head.querySelectorAll("[data-program-canvas-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.programCanvasStyle = "true";
          if (clone instanceof HTMLLinkElement) {
            pending.push(new Promise((resolve) => {
              clone.addEventListener("load", () => resolve(), { once: true });
              clone.addEventListener("error", () => resolve(), { once: true });
            }));
          }
          documentInFrame.head.appendChild(clone);
        });
        void Promise.all(pending).then(() => {
          if (alive && current === generation) {
            oldStyles.forEach((style) => style.remove());
            setBody(documentInFrame.body);
          }
        });
      };
      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    frame.addEventListener("load", mount);
    mount();
    return () => {
      alive = false;
      ready.current?.(false);
      observer?.disconnect();
      frame.removeEventListener("load", mount);
    };
  }, []);

  useEffect(() => {
    if (!body) return;
    const controls = Array.from(body.querySelectorAll<HTMLElement>('a:not([href^="/programs/"]),button:not([data-program-editor-section]),input,video,iframe'));
    const original = controls.map((control) => control.inert);
    controls.forEach((control) => { control.inert = true; });
    const sections = Array.from(body.querySelectorAll<HTMLElement>("[data-program-editor-section]"))
      .filter(section => !classic || (editableSections ?? ["Page heading", "Closing band"]).includes(section.dataset.programEditorSection ?? ""));
    sections.forEach((section) => {
      if (classic) section.setAttribute("data-program-editor-editable", "true");
      section.tabIndex = 0;
      section.setAttribute("role", "button");
      section.setAttribute("aria-label", `Edit ${section.dataset.programEditorSection ?? "section"}`);
    });
    const cards = classic ? Array.from(body.querySelectorAll<HTMLAnchorElement>('a[href^="/programs/"]')).filter(link => link.getAttribute("href")?.split("/").filter(Boolean).length === 2) : [];
    const attributes = ["role", "tabindex", "aria-label", "data-program-editor-card", "data-program-editor-hidden"] as const;
    const previous = cards.map(card => attributes.map(name => card.getAttribute(name)));
    const tags: HTMLElement[] = [];
    for (const card of cards) {
      const slug = card.getAttribute("href")?.split("/").filter(Boolean).at(-1) ?? "";
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("data-program-editor-card", slug);
      card.setAttribute("aria-label", "Edit " + (programLabels[slug] || card.querySelector("h2")?.textContent?.trim() || "program"));
      const tag = body.ownerDocument.createElement("span");
      tag.className = "program-canvas-edit-tag";
      tag.setAttribute("aria-hidden", "true");
      tag.textContent = "Edit";
      card.append(tag);
      tags.push(tag);
      if (hiddenPrograms.includes(slug)) {
        card.setAttribute("data-program-editor-hidden", "true");
        const note = body.ownerDocument.createElement("span");
        note.className = "program-canvas-hidden-note";
        note.textContent = "Hidden from your website";
        card.append(note);
        tags.push(note);
      }
    }
    if (classic) for (const section of sections) {
      const tag = body.ownerDocument.createElement("span");
      tag.className = "program-canvas-edit-tag";
      tag.setAttribute("aria-hidden", "true");
      tag.textContent = "Edit";
      section.append(tag);
      tags.push(tag);
    }
    return () => {
      tags.forEach(tag => tag.remove());
      cards.forEach((card, index) => attributes.forEach((name, slot) => {
        const value = previous[index][slot];
        if (value === null) card.removeAttribute(name); else card.setAttribute(name, value);
      }));
      controls.forEach((control, index) => { control.inert = original[index]; });
      sections.forEach((section) => {
        if (classic) section.removeAttribute("data-program-editor-editable");
        section.removeAttribute("tabindex");
        section.removeAttribute("role");
        section.removeAttribute("aria-label");
      });
    };
  }, [body, children, classic, hiddenPrograms, programLabels, editableSections]);

  useEffect(() => {
    if (!body || !content.current) return;
    const root = content.current;
    const measure = () => {
      if (autoHeight) setHeight(Math.max(1, Math.ceil(root.getBoundingClientRect().height)));
    };
    const observer = new ResizeObserver(measure);
    if (autoHeight) observer.observe(root);
    measure();
    const frame = window.requestAnimationFrame(() => ready.current?.(true));
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [body, autoHeight]);

  const classicStyle = classic ? '[data-classic-program-preview] [data-program-editor-section]{outline:none;cursor:default}[data-classic-program-preview] [data-program-editor-editable],[data-classic-program-preview] [data-program-editor-card]{position:relative;cursor:pointer;outline:none}[data-classic-program-preview] [data-program-editor-editable]:hover,[data-classic-program-preview] [data-program-editor-editable]:focus-visible,[data-classic-program-preview] [data-program-editor-card]:hover,[data-classic-program-preview] [data-program-editor-card]:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}[data-classic-program-preview] [data-program-editor-hidden]{opacity:.55;outline:2px dashed #64748b;outline-offset:-2px}.program-canvas-edit-tag{position:absolute;top:10px;right:10px;z-index:2;border-radius:999px;padding:5px 10px;background:#2563eb;color:#fff;font:600 12px/1.5 system-ui;opacity:0;pointer-events:none}.program-canvas-hidden-note{display:block;padding:8px 16px;color:#991b1b;background:#f8fafc;font:600 13px/1.5 system-ui}[data-program-editor-section]:hover>.program-canvas-edit-tag,[data-program-editor-section]:focus-visible>.program-canvas-edit-tag,[data-program-editor-card]:hover>.program-canvas-edit-tag,[data-program-editor-card]:focus-visible>.program-canvas-edit-tag{opacity:1}@media(hover:none){.program-canvas-edit-tag{opacity:1}}' : "";

  return <div className="program-canvas-browser" data-program-canvas-classic={classic || undefined} data-device={device} style={device === "phone" ? { maxWidth: 390, marginInline: "auto" } : undefined}>
    <div className="program-canvas-browser-bar"><span aria-hidden="true">● ● ●</span><span>{path} · Editing preview</span></div>
    <iframe ref={frameRef} title={`${path} preview`} className="program-canvas-frame" scrolling={autoHeight ? "no" : undefined} style={autoHeight ? { height } : undefined} srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>" />
    {body && createPortal(<div ref={content} data-program-editor-preview="true" data-classic-program-preview={classic || undefined} onClickCapture={(event) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>('a[href^="/programs/"]');
      if (link) {
        event.stopPropagation();
        onProgramLink?.(link.getAttribute("href")?.split("/").filter(Boolean).at(-1) ?? "", link);
        return;
      }
      const section = target.closest<HTMLElement>("[data-program-editor-section]");
      if (section?.dataset.programEditorSection) { markPageEditorFocusTarget(section); onSelect(section.dataset.programEditorSection, section); }
    }} onKeyDownCapture={(event) => {
      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement;
      const card = classic ? target.closest<HTMLAnchorElement>("[data-program-editor-card]") : null;
      if (card) {
        event.preventDefault();
        markPageEditorFocusTarget(card);
        onProgramLink?.(card.dataset.programEditorCard ?? "", card);
        return;
      }
      const section = target.closest<HTMLElement>("[data-program-editor-section]");
      if (section?.dataset.programEditorSection) {
        event.preventDefault();
        markPageEditorFocusTarget(section);
        onSelect(section.dataset.programEditorSection, section);
      }
    }} onSubmitCapture={(event) => event.preventDefault()}>
      <style>{`html{scroll-behavior:auto!important}body{margin:0}[data-program-editor-section]{cursor:pointer;outline:1px solid #867ad8;outline-offset:-2px;position:relative}[data-program-editor-section]:hover,[data-program-editor-section]:focus-visible{outline:3px solid #655be7;outline-offset:-3px}[data-program-editor-preview] *{animation:none!important;transition:none!important}` + classicStyle}</style>
      {children}
    </div>, body)}
  </div>;
}
