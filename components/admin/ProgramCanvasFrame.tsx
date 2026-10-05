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
}: {
  children: ReactNode;
  path: string;
  onSelect: (section: string) => void;
  onProgramLink?: (slug: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

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
      observer?.disconnect();
      frame.removeEventListener("load", mount);
    };
  }, []);

  useEffect(() => {
    if (!body) return;
    const controls = Array.from(body.querySelectorAll<HTMLElement>('a:not([href^="/programs/"]),button:not([data-program-editor-section]),input,video,iframe'));
    const original = controls.map((control) => control.inert);
    controls.forEach((control) => { control.inert = true; });
    const sections = Array.from(body.querySelectorAll<HTMLElement>("[data-program-editor-section]"));
    sections.forEach((section) => {
      section.tabIndex = 0;
      section.setAttribute("role", "button");
      section.setAttribute("aria-label", `Edit ${section.dataset.programEditorSection ?? "section"}`);
    });
    return () => {
      controls.forEach((control, index) => { control.inert = original[index]; });
      sections.forEach((section) => {
        section.removeAttribute("tabindex");
        section.removeAttribute("role");
        section.removeAttribute("aria-label");
      });
    };
  }, [body, children]);

  return <div className="program-canvas-browser">
    <div className="program-canvas-browser-bar"><span aria-hidden="true">● ● ●</span><span>{path} · Editing preview</span></div>
    <iframe ref={frameRef} title={`${path} preview`} className="program-canvas-frame" srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>" />
    {body && createPortal(<div data-program-editor-preview="true" onClickCapture={(event) => {
      event.preventDefault();
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>('a[href^="/programs/"]');
      if (link) {
        event.stopPropagation();
        onProgramLink?.(link.getAttribute("href")?.split("/").filter(Boolean).at(-1) ?? "");
        return;
      }
      const section = target.closest<HTMLElement>("[data-program-editor-section]");
      if (section?.dataset.programEditorSection) { markPageEditorFocusTarget(section); onSelect(section.dataset.programEditorSection); }
    }} onKeyDownCapture={(event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement;
      const section = target.closest<HTMLElement>("[data-program-editor-section]");
      if (section?.dataset.programEditorSection) {
        event.preventDefault();
        markPageEditorFocusTarget(section);
        onSelect(section.dataset.programEditorSection);
      }
    }} onSubmitCapture={(event) => event.preventDefault()}>
      <style>{`html{scroll-behavior:auto!important}body{margin:0}[data-program-editor-section]{cursor:pointer;outline:1px solid #867ad8;outline-offset:-2px;position:relative}[data-program-editor-section]:hover,[data-program-editor-section]:focus-visible{outline:3px solid #655be7;outline-offset:-3px}[data-program-editor-preview] *{animation:none!important;transition:none!important}`}</style>
      {children}
    </div>, body)}
  </div>;
}
