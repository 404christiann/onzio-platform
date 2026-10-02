"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AboutClubPageClient from "@/components/AboutClubPageClient";
import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import ClubhouseAboutPage from "@/components/ClubhouseAboutPage";
import EditorialAboutPage from "@/components/editorial/EditorialAboutPage";
import TemplateFontScope from "@/components/TemplateFontScope";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBAboutPageContent, DBClubLogoPageContent, DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchClubThemeColors, type ClubThemeColors } from "@/lib/editorial-identity";
import "@/styles/editorial.css";

export type AboutCanvasTarget =
  | "hero" | "story" | "values" | "closing" | "fixed-hero" | "sponsors"
  | "images" | "features" | "colors";

type Props = {
  page: "about" | "logo";
  about: DBAboutPageContent;
  logo: DBClubLogoPageContent;
  sponsors: DBSiteSponsorLogo[];
  phone: boolean;
  selected: AboutCanvasTarget | null;
  onSelect: (target: AboutCanvasTarget, index: number) => void;
};

const TARGET_LABELS: Record<AboutCanvasTarget, string> = {
  hero: "Page heading",
  story: "Club story",
  values: "Club values",
  closing: "Closing invitation",
  "fixed-hero": "Onzio-managed heading",
  sponsors: "Sponsors",
  images: "Club Logo artwork",
  features: "Crest feature",
  colors: "Brand colors",
};

function Frame({ children, phone, selected, onSelect, host }: {
  children: ReactNode;
  phone: boolean;
  selected: AboutCanvasTarget | null;
  onSelect: Props["onSelect"];
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
        const previous = Array.from(doc.head.querySelectorAll("[data-about-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach((node) => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.aboutPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) {
            pending.push(new Promise<void>((resolve) => {
              clone.addEventListener("load", () => resolve(), { once: true });
              clone.addEventListener("error", () => resolve(), { once: true });
            }));
          }
          doc.head.appendChild(clone);
        });
        // Let the public page mount even if a stylesheet never reports load.
        // The previous styles remain until the new copies settle.
        if (active) setBody(doc.body);
        void Promise.all(pending).then(() => {
          if (active && current === generation) {
            previous.forEach((node) => node.remove());
          }
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
      body.querySelectorAll<HTMLElement>("[data-about-editor-section]").forEach((target) => {
        const section = target.dataset.aboutEditorSection as AboutCanvasTarget;
        target.tabIndex = 0;
        target.setAttribute("role", "button");
        target.setAttribute("aria-label", `Edit ${TARGET_LABELS[section] ?? section}`);
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

  function selectFrom(target: EventTarget) {
    const element = (target as HTMLElement).closest<HTMLElement>("[data-about-editor-section]");
    if (!element) return false;
    onSelect(element.dataset.aboutEditorSection as AboutCanvasTarget, Number(element.dataset.aboutEditorIndex ?? "0"));
    return true;
  }

  return <div className="aep-browser">
    <div className="aep-browser-bar"><span aria-hidden="true">● ● ●</span><span>{host} · Public page preview</span></div>
    <div ref={viewport} className="aep-frame-viewport" style={{ height: previewHeight * scale }}>
      <iframe
        ref={iframe}
        title="Public About page preview"
        className="aep-frame"
        srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
        style={{
          width: previewWidth,
          height: previewHeight,
          left: Math.max(0, (availableWidth - previewWidth * scale) / 2),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
    {body && createPortal(
      <div data-about-preview="true" onClickCapture={(event) => {
        event.preventDefault();
        if (selectFrom(event.target)) event.stopPropagation();
      }} onKeyDownCapture={(event) => {
        if ((event.key === "Enter" || event.key === " ") && selectFrom(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }} onSubmitCapture={(event) => event.preventDefault()}>
        <style>{`
          html { scroll-behavior:auto !important; }
          body { margin:0; }
          [data-about-editor-section] { cursor:pointer; outline:1px solid #938bd8; outline-offset:-2px; }
          [data-about-editor-section]:hover,[data-about-editor-section][aria-pressed="true"] { outline:3px solid #6158dc; outline-offset:-3px; }
          [data-about-editor-section]:focus-visible { outline:3px dashed #6158dc; outline-offset:-3px; }
          [data-about-preview] * { animation:none !important; transition:none !important; }
        `}</style>
        {children}
      </div>,
      body,
    )}
  </div>;
}

export default function AboutPageCanvas(props: Props) {
  const club = useClubContext();
  const [theme, setTheme] = useState<ClubThemeColors>({
    primary: club.primaryColor ?? "#1B2958",
    secondary: club.secondaryColor ?? "#AD3234",
    accent: club.secondaryColor ?? "#AD3234",
  });
  useEffect(() => {
    if (club.presentationTemplateKey !== "editorial@1" || props.page !== "about") return;
    let active = true;
    fetchClubThemeColors(club.id, {
      primary: club.primaryColor ?? "#1B2958",
      secondary: club.secondaryColor ?? "#AD3234",
    }).then((value) => { if (active) setTheme(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [club.id, club.primaryColor, club.secondaryColor, club.presentationTemplateKey, props.page]);

  let page: ReactNode;
  if (props.page === "logo") {
    page = <ClubLogoPageClient content={props.logo} animate={false} />;
  } else if (club.presentationTemplateKey === "editorial@1") {
    page = <div data-site-template="editorial" style={{
      "--club-primary": theme.primary,
      "--club-secondary": theme.secondary,
      "--club-accent": theme.accent,
    } as CSSProperties}><EditorialAboutPage content={props.about} /></div>;
  } else if (club.presentationTemplateKey === "clubhouse@1") {
    page = <ClubhouseAboutPage content={props.about} sponsors={props.sponsors} />;
  } else {
    page = <AboutClubPageClient content={props.about} animate={false} />;
  }

  return <Frame phone={props.phone} selected={props.selected} onSelect={props.onSelect} host={club.primaryDomain}>
    <TemplateFontScope templateKey={club.presentationTemplateKey}>{page}</TemplateFontScope>
  </Frame>;
}
