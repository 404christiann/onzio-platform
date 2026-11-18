"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDelayedLoading } from "@/components/admin/ui/useDelayedLoading";
import { EditableRegion } from "@/components/admin/ui/EditableRegion";
import AcademyAboutPage from "@/components/sites/diverse-city/AcademyAboutPage";
import ClubLogoPageClient from "@/components/ClubLogoPageClient";
import CinematicCrest from "@/components/cinematic/CinematicCrest";
import CinematicAbout from "@/components/cinematic/CinematicAbout";
import ClubhouseAboutPage from "@/components/ClubhouseAboutPage";
import TemplateFontScope from "@/components/TemplateFontScope";
import { useClubContext } from "@/components/ClubContextProvider";
import type { DBAboutPageContent, DBClubLogoPageContent, DBSiteSponsorLogo } from "@/lib/db-types";

export type AboutCanvasTarget =
  | "hero" | "story" | "values" | "closing" | "fixed-hero" | "sponsors"
  | "images" | "features" | "colors";

type Props = {
  classic?: boolean;
  loading?: boolean;
  invalid?: string | null;
  page: "about" | "logo";
  about: DBAboutPageContent;
  logo: DBClubLogoPageContent;
  sponsors: DBSiteSponsorLogo[];
  phone: boolean;
  selected: AboutCanvasTarget | null;
  onSelect: (target: AboutCanvasTarget, index: number, opener?: HTMLElement) => void;
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

function Frame({ children, phone, selected, onSelect, host, classic, loading, invalid, about, imageSection }: {
  classic?: boolean; loading?: boolean; invalid?: string | null; about: DBAboutPageContent; imageSection: "story" | "values";
  children: ReactNode;
  phone: boolean;
  selected: AboutCanvasTarget | null;
  onSelect: Props["onSelect"];
  host: string;
}) {
  const delayed = useDelayedLoading(Boolean(loading));
  const iframe = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const previousSelection = useRef<AboutCanvasTarget | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const previewWidth = phone ? 390 : 1440;
  const previewHeight = phone ? 780 : 850;
  const [contentHeight, setContentHeight] = useState(previewHeight);
  const frameHeight = classic ? contentHeight : previewHeight;
  const scale = availableWidth ? Math.min(1, availableWidth / previewWidth) : 1;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!classic || !body) return;
    const content = body.querySelector<HTMLElement>("[data-about-preview]");
    if (!content) return;
    const measure = () => setContentHeight(Math.max(1, Math.ceil(content.getBoundingClientRect().height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    body.ownerDocument.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [body, classic, phone]);

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
        if (classic) {
          target.style.position = "relative";
          return;
        }
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
    const updateTargets = () => {
      decorate();
      const next = Array.from(body.querySelectorAll<HTMLElement>("[data-about-editor-section]"));
      setTargets(current => next.length === current.length && next.every((target, index) => current[index] === target) ? current : next);
    };
    updateTargets();
    const observer = new MutationObserver(updateTargets);
    observer.observe(body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      originals.forEach((inert, control) => { control.inert = inert; });
    };
  }, [body, selected, classic]);

  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = selected;
    // An empty authoring target may become a new public section while its
    // inspector is open. Restore focus to that replacement when tools close.
    if (!classic && previous && selected === null) body?.querySelector<HTMLElement>(classic ? `[data-about-editor-section="${previous}"] [data-admin-editable-region]` : `[data-about-editor-section="${previous}"]`)?.focus({ preventScroll: true });
  }, [body, selected, classic]);

  function selectFrom(target: EventTarget) {
    const element = (target as HTMLElement).closest<HTMLElement>("[data-about-editor-section]");
    if (!element) return false;
    element.focus({ preventScroll: true });
    onSelect(element.dataset.aboutEditorSection as AboutCanvasTarget, Number(element.dataset.aboutEditorIndex ?? "0"), element);
    return true;
  }

  return <div className="aep-browser" data-loading={delayed.showSkeleton || undefined} data-phase={delayed.phase} data-content-ready={!loading || undefined} aria-busy={loading || undefined}>
    {classic && <span className="sr-only" role="status">{delayed.showContent ? "About page loaded" : "Loading About page"}</span>}
    {!classic && <div className="aep-browser-bar"><span aria-hidden="true">● ● ●</span><span>{host} · Public page preview</span></div>}
    <div ref={viewport} className="aep-frame-viewport" style={{ height: availableWidth ? frameHeight * scale : undefined, aspectRatio: `${previewWidth}/${frameHeight}`, maxWidth: previewWidth, margin: "0 auto" }}>
      <iframe
        ref={iframe}
        title="Public About page preview"
        className="aep-frame"
        srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>"
        style={{
          width: previewWidth,
          height: frameHeight,
          left: Math.max(0, (availableWidth - previewWidth * scale) / 2),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
    {body && createPortal(
      <div data-about-preview="true" onClickCapture={(event) => {
        if (classic) return;
        event.preventDefault();
        if (selectFrom(event.target)) event.stopPropagation();
      }} onKeyDownCapture={(event) => {
        if (classic) return;
        if ((event.key === "Enter" || event.key === " ") && selectFrom(event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }} onSubmitCapture={(event) => event.preventDefault()}>
        <style>{`
          html { scroll-behavior:auto !important; }
          body { margin:0; }
          [data-about-editor-section] { cursor:pointer; outline:${classic ? "0" : "1px solid #938bd8"}; outline-offset:-2px; }
          [data-about-editor-section]:hover,[data-about-editor-section][aria-pressed="true"] { outline:${classic ? "0" : "3px solid #6158dc"}; outline-offset:-3px; }
          [data-about-editor-section]:focus-visible { outline:3px dashed #6158dc; outline-offset:-3px; }
          [data-about-preview] * { animation:none !important; transition:none !important; }
          .aep-edit-overlay-host,.aep-edit-overlay { position:absolute; inset:0; z-index:4; }
          ${classic ? "body { overflow:hidden; } [data-about-preview] .min-h-screen { min-height:0!important; }" : ""}
          .aep-edit-overlay > span { font-size:${12 / scale}px; min-height:${26 / scale}px; }
          [data-about-loading] { visibility:hidden; }
          .aep-image-placeholder { min-height:320px; display:grid; place-items:center; background:#eceef2; border-radius:12px; }
          @media(min-width:768px) { .aep-image-placeholder { grid-column:span 2 / span 2; } }
          [data-about-preview] .aep-authoring-placeholder { color:#747b88; font:italic 16px/1.6 Arial,sans-serif; padding:24px; }

        `}</style>
        <div data-about-loading={!delayed.showContent || undefined}>{children}</div>
      </div>,
      body,
    )}
    {classic && targets.flatMap((target, index) => {
      const section = target.dataset.aboutEditorSection;
      const placeholders: Array<{ text: string; host: Element; image?: boolean }> = [];
      if (section === "hero" && !about.hero_title) placeholders.push({ text: "Page heading", host: target });
      if (section === "story" && !about.story_paragraphs.length) placeholders.push({ text: "Your story goes here.", host: target.querySelector(".clubhouse-about-story") ?? target.firstElementChild ?? target });
      if (section === imageSection && !about.feature_image_url) placeholders.push({ text: "Add a feature image", host: target, image: true });
      if (section === "values" && !about.values.length) placeholders.push({ text: "Add values to show this section.", host: target });
      return placeholders.map((placeholder, offset) => createPortal(<p className={`aep-authoring-placeholder ${placeholder.image ? "aep-image-placeholder" : ""}`}>{placeholder.text}</p>, placeholder.host, `empty-${index}-${offset}`));
    })}
    {classic && targets.map((target, index) => createPortal(<div className="aep-edit-overlay-host" data-about-edit-host onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}><EditableRegion
      ariaLabel={`Edit ${TARGET_LABELS[target.dataset.aboutEditorSection as AboutCanvasTarget]}`}
      editLabel={TARGET_LABELS[target.dataset.aboutEditorSection as AboutCanvasTarget]}
      invalid={invalid === target.dataset.aboutEditorSection}
      className="aep-edit-overlay" onEdit={() => { if (!loading) onSelect(target.dataset.aboutEditorSection as AboutCanvasTarget, Number(target.dataset.aboutEditorIndex ?? "0"), target.querySelector<HTMLElement>(":scope > [data-about-edit-host] > [data-admin-editable-region]") ?? target); }}
    ><span /></EditableRegion></div>, target, String(index)))}
  </div>;
}

export default function AboutPageCanvas(props: Props) {
  const club = useClubContext();
  let rendered: { content: ReactNode; imageSection: "story" | "values" };
  if (props.page === "logo") {
    rendered = club.presentationTemplateKey === "cinematic@2"
      ? { content: <CinematicCrest content={props.logo} editorEmptySections />, imageSection: "story" }
      : { content: <ClubLogoPageClient content={props.logo} animate={false} editorEmptySections />, imageSection: "story" };
  } else if (club.presentationTemplateKey === "cinematic@2") {
    rendered = { content: <CinematicAbout content={props.about} editorEmptySections />, imageSection: "story" };
  } else if (club.presentationTemplateKey === "clubhouse@1") {
    rendered = { content: <ClubhouseAboutPage content={props.about} sponsors={props.sponsors} renderHeading={props.classic ? heading => <header data-about-editor-section="hero" style={{ position: "relative", zIndex: 5 }}>{heading}</header> : undefined} />, imageSection: "values" };
  } else {
    rendered = { content: <AcademyAboutPage content={props.about} animate={false} />, imageSection: "story" };
  }

  return <Frame imageSection={rendered.imageSection} about={props.about} classic={props.classic} loading={props.loading} invalid={props.invalid} phone={props.phone} selected={props.selected} onSelect={props.onSelect} host={club.primaryDomain}>
    <TemplateFontScope templateKey={club.presentationTemplateKey}>
      {rendered.content}
    </TemplateFontScope>
  </Frame>;
}
