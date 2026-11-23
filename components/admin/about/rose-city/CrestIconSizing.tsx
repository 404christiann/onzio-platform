"use client";

import { memo, startTransition, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import CinematicAvenirFonts from "@/components/cinematic/CinematicAvenirFonts";
import CinematicCrest from "@/components/cinematic/CinematicCrest";
import { usePreviewLinkGuard } from "@/components/admin/ui/editor-kit/previewLinkGuard";
import { RangeSlider, type SliderRange } from "@/components/admin/ui/editor-kit";
import { prefersReducedMotion } from "@/components/admin/ui/editor-kit/editTargets";
import { EMPTY_CLUB_LOGO_PAGE_CONTENT, type ClubLogoFeature } from "@/lib/about-content";
import { CREST_ICON_SCALE, CREST_ICON_SIZE } from "@/lib/about-editor/crest-icon";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import styles from "./CrestIconSizing.module.css";

/**
 * crest.css applies `icon_size` above 600px only (×0.8 above 1024px); on a phone the icon box has a fixed width. The
 * preview lays the real Club Logo page out in a frame this wide, so the public desktop rules size the icon, and shows
 * the one feature card. Nothing about the icon's size is restated here: the page's own component and CSS draw it.
 */
export const CREST_PREVIEW_VIEWPORT = 1440;
/** The slice of the page the frame shows, in page pixels: one desktop feature card (about 551px) with page around it. */
export const CREST_PREVIEW_CROP = { width: 588, height: 224, top: 20 } as const;

export const ICON_SIZE_RANGE: SliderRange = { min: CREST_ICON_SIZE.min, max: CREST_ICON_SIZE.max, step: 1, bigStep: 10, defaultValue: CREST_ICON_SIZE.default, detent: 1 };
export const ICON_SCALE_RANGE: SliderRange = { min: CREST_ICON_SCALE.min, max: CREST_ICON_SCALE.max, step: 0.05, bigStep: 0.25, defaultValue: CREST_ICON_SCALE.default, detent: 0.05 };
export const formatIconSize = (value: number) => `${value} px`;
export const formatIconScale = (value: number) => `${value.toFixed(2)}×`;

type IconSizing = Pick<ClubLogoFeature, "icon_size" | "icon_scale">;
type PreviewFeature = ClubLogoFeature & { _id?: string };

/** The Club Logo content the preview renders: the page's features, with this card's icon at the sliders' values. */
export function crestPreviewContent(features: readonly PreviewFeature[], index: number, sizing: IconSizing) {
  return {
    ...EMPTY_CLUB_LOGO_PAGE_CONTENT, annotated_image_url: "", map_image_url: "", color_cards: [],
    features: features.map(({ _id: _ignored, ...feature }, at) => at === index ? { ...feature, ...sizing } : feature),
  };
}

const FRAME_CSS = `html{overflow:hidden}body{margin:0;background:#fff}*{animation:none!important;transition:none!important}a,button{pointer-events:none}`;

/** Mounts the frame once its box is near the viewport, so a page of crest features does not start every frame at once. */
function useNearViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return { ref, near };
}

/**
 * One crest feature card as a computer shows it, in a fixed frame. The frame's size never depends on the icon, and the
 * page is only ever scaled as a whole, so the icon keeps its size relative to the card and nothing around it moves.
 */
export const CrestIconPreview = memo(function CrestIconPreview({ features, index, sizing, label }: {
  features: readonly PreviewFeature[]; index: number; sizing: IconSizing; label: string;
}) {
  const { ref: box, near } = useNearViewport();
  const frame = useRef<HTMLIFrameElement>(null);
  usePreviewLinkGuard(frame, near);
  const root = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [card, setCard] = useState<{ x: number; y: number } | null>(null);
  const [pageHeight, setPageHeight] = useState(1200);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => setBoxWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box]);

  // Copy the admin's stylesheets (crest.css among them) into the frame and keep them in step; mount once they load.
  useEffect(() => {
    const iframe = frame.current;
    if (!near || !iframe) return;
    let active = true;
    let generation = 0;
    let observer: MutationObserver | undefined;
    const mount = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc?.head || !doc.body) return;
      // A card moved with Earlier/Later reloads its frame: hide it until the new document has its styles.
      setBody(current => current?.ownerDocument === doc ? current : null);
      doc.documentElement.lang = "en";
      const sync = () => {
        const current = ++generation;
        const previous = Array.from(doc.head.querySelectorAll("[data-crest-preview-style]"));
        const pending: Promise<void>[] = [];
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.crestPreviewStyle = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise(resolve => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        const stalled = new Promise<void>(resolve => window.setTimeout(resolve, 3000));
        void Promise.race([Promise.all(pending), stalled]).then(() => {
          if (!active || current !== generation || doc !== iframe.contentDocument) return;
          previous.forEach(node => node.remove());
          setBody(doc.body);
        });
      };
      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    iframe.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); iframe.removeEventListener("load", mount); };
  }, [near]);

  // Find this card on the laid-out page, and follow it if the page changes shape (a longer description, a new card).
  useEffect(() => {
    const node = root.current;
    const view = body?.ownerDocument.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!node || !view) return;
    const update = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height > 0) setPageHeight(height);
      const article = node.querySelector<HTMLElement>(`[data-about-editor-section="features"][data-about-editor-index="${index}"]`);
      if (!article) return;
      const rect = article.getBoundingClientRect();
      let y = rect.top - CREST_PREVIEW_CROP.top;
      // A very long title makes the card tall: follow the title row's picture (the icon) rather than the card's top.
      const heading = article.querySelector("h2")?.parentElement;
      const mark = (heading?.querySelector("img") ?? heading)?.getBoundingClientRect();
      if (mark && mark.bottom > y + CREST_PREVIEW_CROP.height - 12) y = mark.top + mark.height / 2 - CREST_PREVIEW_CROP.height / 2;
      const next = { x: Math.round(rect.left - (CREST_PREVIEW_CROP.width - rect.width) / 2), y: Math.round(y) };
      setCard(current => current && current.x === next.x && current.y === next.y ? current : next);
    };
    update();
    const observer = new view.ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [body, index]);

  const scale = boxWidth > 0 ? boxWidth / CREST_PREVIEW_CROP.width : 0;
  const ready = Boolean(body && card && scale);
  return <div ref={box} className={styles.frameBox} style={{ aspectRatio: `${CREST_PREVIEW_CROP.width} / ${CREST_PREVIEW_CROP.height}` }}
    data-crest-icon-preview="" data-ready={ready || undefined}>
    {near && <iframe ref={frame} title={label} tabIndex={-1} aria-hidden="true" className={styles.frame}
      style={{ width: CREST_PREVIEW_VIEWPORT, height: pageHeight, transform: card ? `scale(${scale}) translate(${-card.x}px, ${-card.y}px)` : undefined } as CSSProperties}
      srcDoc="<!doctype html><html lang='en'><head></head><body></body></html>" />}
    {body && createPortal(<div ref={root} data-crest-preview-root="" style={{ display: "flow-root" }}>
      <style>{FRAME_CSS}</style>
      <CinematicAvenirFonts />
      <CinematicCrest content={crestPreviewContent(features, index, sizing)} />
    </div>, body)}
    <span className={styles.frameLabel} aria-hidden="true">On a computer</span>
  </div>;
});

/** Scrolls the dialog's page preview (when it is showing) so this feature's title row, where the icon sits, is in view. */
function revealInPagePreview(index: number) {
  const doc = document.querySelector<HTMLIFrameElement>("[data-editor-dialog-preview] iframe")?.contentDocument;
  const scroller = doc?.scrollingElement;
  const card = doc?.querySelector(`[data-about-editor-section="features"][data-about-editor-index="${index}"]`);
  if (!scroller || !card) return;
  const row = (card.querySelector("h2") ?? card).getBoundingClientRect();
  if (row.top >= 0 && row.bottom <= scroller.clientHeight) return;
  scroller.scrollTo({ top: scroller.scrollTop + row.top - scroller.clientHeight / 3, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Icon size and scale for one crest feature, with that feature's card as the page shows it. The sliders and the card
 * follow every move at once. The editor's draft (and the dialog's page preview, the cards behind) catches up at low
 * priority, one update at a time, so a slow device drops in-between values instead of queueing them; the final value is
 * written when the move ends (in the same update that hands the sliders back to the draft). Save sends the draft.
 */
export function CrestIconSizing({ features, index, locked, sizeTarget, scaleTarget, onChange }: {
  features: readonly PreviewFeature[]; index: number; locked: boolean;
  sizeTarget?: EditTargetId; scaleTarget?: EditTargetId;
  onChange: (patch: Partial<IconSizing>) => void;
}) {
  const saved = features[index];
  const [live, setLive] = useState<Partial<IconSizing>>({});
  const sizing: IconSizing = { icon_size: live.icon_size ?? saved.icon_size, icon_scale: live.icon_scale ?? saved.icon_scale };
  /** Moved since the last write and not yet handed to the draft. */
  const queued = useRef<Partial<IconSizing> | null>(null);
  /** Moved at all during this gesture: a blur or key up after no move leaves the draft alone. */
  const touched = useRef(false);
  const inFlight = useRef(false);
  const frameRequest = useRef(0);
  const latestChange = useRef(onChange);
  useEffect(() => { latestChange.current = onChange; });

  const send = (next: Partial<IconSizing>, finish?: () => void) => startTransition(() => { latestChange.current(next); finish?.(); });
  const pump = useRef(() => {});
  pump.current = () => {
    if (inFlight.current || frameRequest.current || !queued.current) return;
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = 0;
      const next = queued.current;
      queued.current = null;
      if (!next) return;
      inFlight.current = true;
      send(next);
    });
  };
  // A new features list means the last draft update has rendered: send the next one, if the sliders moved since.
  useEffect(() => { inFlight.current = false; pump.current(); }, [features]);
  // Closing the dialog mid-move (Escape in the same frame as a key) still keeps the value.
  useEffect(() => () => {
    cancelAnimationFrame(frameRequest.current);
    if (queued.current) latestChange.current(queued.current);
  }, []);

  const input = (patch: Partial<IconSizing>) => {
    if (!touched.current) { touched.current = true; revealInPagePreview(index); }
    setLive(current => ({ ...current, ...patch }));
    queued.current = { ...queued.current, ...patch };
    pump.current();
  };
  const commit = (patch: Partial<IconSizing>) => {
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = 0;
    const keys = Object.keys(patch) as (keyof IconSizing)[];
    const release = () => setLive(current => {
      const rest = { ...current };
      for (const key of keys) delete rest[key];
      return rest;
    });
    if (!touched.current) { queued.current = null; release(); return; }
    touched.current = false;
    const next = { ...queued.current, ...patch };
    queued.current = null;
    // Ordered after any update already on its way, so the released value is the one that stays.
    send(next, release);
  };

  return <div className={styles.sizing} data-crest-icon-sizing="">
    <CrestIconPreview features={features} index={index} sizing={sizing} label={`Crest feature ${index + 1} on a computer`} />
    {!saved.icon_url && <p className={styles.note} data-crest-icon-missing="">This feature has no icon yet. Add one above to see its size.</p>}
    <div className={styles.sliders}>
      <RangeSlider label="Icon size" value={sizing.icon_size} range={ICON_SIZE_RANGE} format={formatIconSize} describe={value => `${value} pixels`}
        hint="Width of the icon's box; its height is fixed. Phones use a fixed width." disabled={locked} target={sizeTarget}
        onInput={icon_size => input({ icon_size })} onCommit={icon_size => commit({ icon_size })} />
      <RangeSlider label="Icon scale" value={sizing.icon_scale} range={ICON_SCALE_RANGE} format={formatIconScale} describe={value => `${value.toFixed(2)} times`}
        hint="Zooms the picture inside its box." disabled={locked} target={scaleTarget}
        onInput={icon_scale => input({ icon_scale })} onCommit={icon_scale => commit({ icon_scale })} />
    </div>
  </div>;
}
