"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AcademyContactPage from "@/components/AcademyContactPage";
import { useClubContext } from "@/components/ClubContextProvider";
import TemplateFontScope from "@/components/TemplateFontScope";
import EditorialContactPage from "@/components/editorial/EditorialContactPage";
import { fetchClubThemeColors, type ClubThemeColors } from "@/lib/editorial-identity";
import type { ContactContent } from "@/lib/queries";
import "@/styles/editorial.css";

export type ContactCanvasTarget = "hero" | "details" | "social";

const labels: Record<ContactCanvasTarget, string> = {
  hero: "Page heading",
  details: "Contact details",
  social: "Social links",
};

function Frame({ children, phone, selected, onSelect, host }: {
  children: ReactNode;
  phone: boolean;
  selected: ContactCanvasTarget | null;
  onSelect: (target: ContactCanvasTarget) => void;
  host: string;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const previewWidth = phone ? 390 : 1440;
  const previewHeight = phone ? 780 : 850;
  const scale = availableWidth ? Math.min(1, availableWidth / previewWidth) : 1;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = iframe.current;
    if (!frame) return;
    let active = true;
    let observer: MutationObserver | undefined;
    let generation = 0;
    const mount = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      const syncStyles = () => {
        const current = ++generation;
        const previous = Array.from(doc.head.querySelectorAll("[data-contact-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.contactPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) {
            pending.push(new Promise<void>((resolve) => {
              clone.addEventListener("load", () => resolve(), { once: true });
              clone.addEventListener("error", () => resolve(), { once: true });
            }));
          }
          doc.head.appendChild(clone);
        });
        if (active) setBody(doc.body);
        void Promise.all(pending).then(() => {
          if (active && current === generation) previous.forEach((node) => node.remove());
        });
      };
      syncStyles();
      observer?.disconnect();
      observer = new MutationObserver(syncStyles);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    frame.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); frame.removeEventListener("load", mount); };
  }, []);

  useEffect(() => {
    if (!body) return;
    const originals = new Map<HTMLElement, boolean>();
    const decorate = () => {
      body.querySelectorAll<HTMLElement>("[data-contact-editor-section]").forEach((target) => {
        const section = target.dataset.contactEditorSection as ContactCanvasTarget;
        target.tabIndex = 0;
        target.setAttribute("role", "button");
        target.setAttribute("aria-label", `Edit ${labels[section] ?? section}`);
        target.setAttribute("aria-pressed", String(section === selected));
      });
      body.querySelectorAll<HTMLElement>("a,button,input,video,iframe").forEach((control) => {
        if (!originals.has(control)) originals.set(control, control.inert);
        control.inert = true;
      });
    };
    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      originals.forEach((inert, control) => { control.inert = inert; });
    };
  }, [body, selected]);

  useEffect(() => {
    if (!body || !selected) return;
    const target = body.querySelector<HTMLElement>(`[data-contact-editor-section="${selected}"]`);
    const frame = iframe.current;
    if (!target || !frame?.contentWindow) return;
    const top = target.getBoundingClientRect().top + frame.contentWindow.scrollY - 120;
    frame.contentWindow.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }, [body, selected]);

  function selectFrom(target: EventTarget) {
    const element = (target as HTMLElement).closest<HTMLElement>("[data-contact-editor-section]");
    if (!element) return false;
    onSelect(element.dataset.contactEditorSection as ContactCanvasTarget);
    return true;
  }

  return <div className="cep-browser">
    <div className="cep-browser-bar"><span aria-hidden="true">● ● ●</span><span>{host}/contact · Public page preview</span></div>
    <div ref={viewport} className="cep-frame-viewport" style={{ height: previewHeight * scale }}>
      <iframe ref={iframe} title="Public Contact page preview" className="cep-frame"
        srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
        style={{ width: previewWidth, height: previewHeight,
          left: Math.max(0, (availableWidth - previewWidth * scale) / 2),
          transform: `scale(${scale})`, transformOrigin: "top left" }} />
    </div>
    {body && createPortal(<div data-contact-preview="true" onClickCapture={(event) => {
      event.preventDefault();
      if (selectFrom(event.target)) event.stopPropagation();
    }} onKeyDownCapture={(event) => {
      if ((event.key === "Enter" || event.key === " ") && selectFrom(event.target)) {
        event.preventDefault(); event.stopPropagation();
      }
    }} onSubmitCapture={(event) => event.preventDefault()}>
      <style>{`
        html { scroll-behavior:auto !important; }
        body { margin:0; }
        [data-contact-editor-section] { cursor:pointer; outline:1px solid #938bd8; outline-offset:-2px; }
        [data-contact-editor-section]:hover,[data-contact-editor-section][aria-pressed="true"] { outline:3px solid #6158dc; outline-offset:-3px; }
        [data-contact-editor-section]:focus-visible { outline:3px dashed #6158dc; outline-offset:-3px; }
        [data-contact-preview] * { animation:none !important; transition:none !important; }
      `}</style>
      {children}
    </div>, body)}
  </div>;
}

export default function ContactPageCanvas({ content, phone, selected, onSelect }: {
  content: ContactContent;
  phone: boolean;
  selected: ContactCanvasTarget | null;
  onSelect: (target: ContactCanvasTarget) => void;
}) {
  const club = useClubContext();
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? "#1B2958",
    secondary: club.secondaryColor ?? "#AD3234",
    accent: club.secondaryColor ?? "#AD3234",
  });
  useEffect(() => {
    if (club.presentationTemplateKey !== "editorial@1") return;
    let active = true;
    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? "#1B2958",
      secondary: club.secondaryColor ?? "#AD3234",
    }).then((value) => { if (active) setTheme(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [club.id, club.primaryColor, club.secondaryColor, club.presentationTemplateKey]);

  const page = club.presentationTemplateKey === "editorial@1"
    ? <div data-site-template="editorial" style={{
        "--club-primary": theme.primary, "--club-secondary": theme.secondary,
        "--club-accent": theme.accent,
      } as CSSProperties}><EditorialContactPage content={content} /></div>
    : <AcademyContactPage content={content} clubName={club.name} />;
  return <Frame phone={phone} selected={selected} onSelect={onSelect} host={club.primaryDomain}>
    <TemplateFontScope templateKey={club.presentationTemplateKey}>{page}</TemplateFontScope>
  </Frame>;
}
