"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import CinematicShell from "@/components/cinematic/CinematicShell";
import HomePageClient from "@/components/HomePageClient";
import { IconEdit } from "@/components/admin/icons";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import { HOMEPAGE_PARTS, PREVIEW_PIECES, type HomepagePart, type PartAnchor, type PartId } from "./homepage-parts";
import { preparePreviewDocument } from "./preview-document";
import { editTargetHitAt, watchEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
import { usePreviewLinkGuard } from "@/components/admin/ui/editor-kit/previewLinkGuard";
import type { EditTargetId } from "@/lib/admin-edit-targets";
import { homepagePreviewStamps } from "./homepage-edit-targets";
import styles from "./HomepageOverview.module.css";

/** The public page is laid out at this width, then scaled down. Its sizes are in vw, so any width gives the same picture. */
export const OVERVIEW_DESIGN_WIDTH = 1200;
/** Height of the whole page at the design width, as a multiple of the width. Reserves the boxes before the page paints. */
export const OVERVIEW_PAGE_RATIO = 6.2;
export const OVERVIEW_COLUMN_GAP = 16;
const COLUMN_GAP = OVERVIEW_COLUMN_GAP;
/** Below this width the page is one column; two columns at phone width would be unreadable. */
export const OVERVIEW_TWO_COLUMN_MIN = 720;
const TWO_COLUMN_MIN = OVERVIEW_TWO_COLUMN_MIN;
/** The reserved box (design units) for one column: half the page plus room for the split not landing exactly in the middle. */
export const overviewReservedHeight = (columns: 1 | 2) => columns === 2 ? OVERVIEW_PAGE_RATIO * OVERVIEW_DESIGN_WIDTH / 2 + 240 : OVERVIEW_PAGE_RATIO * OVERVIEW_DESIGN_WIDTH;
const HIDDEN_BELOW = 40;
/** A hidden part's pill is 36px tall. Pills for parts that sit at one point on the page (raffle, match and prices all hidden) are stacked this far apart. */
const HIDDEN_PILL_PITCH = 40;

type Rect = { top: number; left: number; width: number; height: number };
export type PartRects = Partial<Record<PartId, Rect[]>>;
export type Measurement = { total: number; rects: PartRects };
export type PartNumbers = Partial<Record<PartId, number[]>>;

const rectOf = (element: Element | null | undefined): Rect | null => {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/** The node an anchor names in the rendered page, or null when that block is not on the page. */
export function findAnchor(doc: Pick<Document, "querySelector">, anchor: PartAnchor): Element | null {
  const node = doc.querySelector(anchor.selector) ?? (anchor.fallback ? doc.querySelector(anchor.fallback) : null);
  return anchor.closest ? node?.closest(anchor.closest) ?? null : node;
}

/**
 * Each part's block(s), measured from the real DOM of one rendered page and keyed by the part that names them: a part's
 * rects come only from its own anchors, so a box can never be filed under another part's id.
 */
export function measureParts(doc: Document, parts: readonly HomepagePart[] = HOMEPAGE_PARTS): Measurement | null {
  const body = doc.body;
  if (!body) return null;
  const rects: PartRects = {};
  for (const part of parts) {
    for (const anchor of part.anchors) {
      const rect = rectOf(findAnchor(doc, anchor));
      if (rect) (rects[part.id] ??= []).push(rect);
    }
  }
  return { total: Math.ceil(body.getBoundingClientRect().height), rects };
}

/** Every node the parts are measured from, so a size change on any of them re-measures. */
const anchorNodes = (doc: Document, parts: readonly HomepagePart[]) => parts.flatMap(part => part.anchors.map(anchor => findAnchor(doc, anchor))).filter((node): node is Element => !!node);

/**
 * Calls `onChange` (once per frame) whenever anything that can move a part changes inside a preview document: the body or
 * any part block resizing, DOM or attribute changes (Schedule's results, partner logos, edits), pictures, posters and media
 * metadata loading or failing, and web fonts arriving. Returns the cleanup.
 */
export function watchFrameLayout(body: HTMLElement, parts: readonly HomepagePart[], onChange: () => void): () => void {
  const doc = body.ownerDocument;
  const view = doc.defaultView;
  let frame = 0;
  let active = true;
  const request = () => {
    if (!active) return;
    (view ?? window).cancelAnimationFrame(frame);
    frame = (view ?? window).requestAnimationFrame(() => { if (!active) return; observeAnchors(); onChange(); });
  };
  const Resize = view?.ResizeObserver ?? ResizeObserver;
  const Mutation = view?.MutationObserver ?? MutationObserver;
  const resize = new Resize(request);
  const observed = new Set<Element>();
  const observeAnchors = () => {
    for (const node of [body, ...anchorNodes(doc, parts)]) if (!observed.has(node)) { observed.add(node); resize.observe(node); }
  };
  observeAnchors();
  const mutation = new Mutation(request);
  mutation.observe(body, { childList: true, subtree: true, attributes: true, characterData: true });
  const events = ["load", "error", "loadeddata", "loadedmetadata"] as const;
  events.forEach(type => doc.addEventListener(type, request, true));
  doc.fonts?.addEventListener?.("loadingdone", request);
  void doc.fonts?.ready.then(request);
  request();
  return () => {
    active = false;
    (view ?? window).cancelAnimationFrame(frame);
    resize.disconnect(); mutation.disconnect();
    events.forEach(type => doc.removeEventListener(type, request, true));
    doc.fonts?.removeEventListener?.("loadingdone", request);
  };
}

/**
 * How much closer to the middle another block must be before the column split moves, as a share of the page height
 * (about 150px of a 7400px page): more than a typed line or two, far less than a picture or section arriving.
 */
export const SPLIT_SLACK = 0.02;

/**
 * The block the second column starts at: the part whose top is nearest the middle of the page, so the columns come out about
 * the same height. The split keeps its part while edits move text by a little and moves when the page really changes shape
 * (a large picture arriving late, a section shown or hidden), so neither column is left with a long blank end.
 */
export function chooseSplit(measurement: Measurement, current: PartId | null): PartId | null {
  const middle = measurement.total / 2;
  const tops = (Object.keys(measurement.rects) as PartId[]).filter(part => part !== "menu")
    .map(part => ({ part, top: Math.min(...(measurement.rects[part] ?? []).map(rect => rect.top)) }))
    .filter(entry => Number.isFinite(entry.top));
  if (!tops.length) return current;
  const best = tops.reduce((winner, entry) => Math.abs(entry.top - middle) < Math.abs(winner.top - middle) ? entry : winner, tops[0]);
  const kept = current ? tops.find(entry => entry.part === current) : undefined;
  if (kept && Math.abs(kept.top - middle) - Math.abs(best.top - middle) <= SPLIT_SLACK * measurement.total) return current;
  return best.part;
}

export type PartButton = {
  key: string; part: PartId; index: number; title: string; label: string; number?: number;
  /** Shorter than HIDDEN_BELOW on the page: drawn as a pill instead of a box. */
  hidden: boolean;
  /** Position in the column box, in screen px. */
  top: number; left: number; width: number; height: number;
};

/**
 * The part buttons for one column, built from one frame's measurement. Each button's title, name and number and its box
 * are read for the same part id from the same part record, so a label can never sit on another part's block.
 */
export function layoutPartButtons(parts: readonly HomepagePart[], measurement: Measurement | null, numbers: PartNumbers, offset: number, span: number, scale: number): PartButton[] {
  if (!measurement) return [];
  const out: PartButton[] = [];
  // DOM order puts "Top of the page" (a plain text field) first and Menu and footer last; the page position is absolute anyway.
  const ordered = [...parts].sort((a, b) => Number(a.id === "menu") - Number(b.id === "menu"));
  for (const part of ordered) {
    if (part.offPage) continue;
    (measurement.rects[part.id] ?? []).forEach((rect, index) => {
      const mid = rect.top + rect.height / 2;
      if (mid < offset - 1 || mid > offset + span + 1) return;
      const title = `Edit ${part.title}`;
      const number = numbers[part.id]?.[index];
      const hidden = rect.height < HIDDEN_BELOW;
      out.push({
        key: `${part.id}-${index}`, part: part.id, index, title, number, hidden,
        label: hidden ? `${title}. Hidden on the page.` : number ? `${title} (part ${number})` : title,
        top: (rect.top - offset) * scale,
        left: hidden ? Math.max(8, rect.left * scale + 8) : rect.left * scale,
        width: rect.width * scale,
        height: Math.min(rect.height, offset + span - rect.top) * scale,
      });
    });
  }
  // Hidden parts have no height, so neighbours share one top. Stack them so no pill covers another.
  let previousPill = -Infinity;
  for (const pill of out.filter(button => button.hidden).sort((a, b) => a.top - b.top)) {
    pill.top = Math.max(pill.top, previousPill + HIDDEN_PILL_PITCH);
    previousPill = pill.top;
  }
  return out;
}

const FRAME_STYLE = `
  html { scroll-behavior: auto !important; }
  body { margin: 0; overflow: hidden; }
  [data-homepage-preview] * { animation: none !important; transition: none !important; caret-color: transparent; }
  [data-homepage-preview] [data-homepage-shared] { display: none !important; }
  [data-homepage-preview] [data-homepage-piece] { cursor: default; outline: none !important; min-height: 0; min-width: 0; }
  [data-homepage-preview] video, [data-homepage-preview] iframe { pointer-events: none; }
`;

/** One full render of the real public homepage in its own 1200px document, fed by the draft. Inert: the parts above it take the clicks. */
function PageFrame({ draft, videoSource, height, onBody, hidden }: { draft: HomepageDraft; videoSource: string; height: number; onBody: (body: HTMLElement | null) => void; hidden: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  usePreviewLinkGuard(frame);
  const [body, setBody] = useState<HTMLElement | null>(null);
  const initialDocument = useRef("<!doctype html><html lang='en'><head></head><body></body></html>");
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: MutationObserver | undefined;
    let unprepare: (() => void) | undefined;
    let active = true;
    let generation = 0;
    const mount = () => {
      observer?.disconnect();
      const doc = element.contentDocument;
      if (!doc?.documentElement || !doc.head || !doc.body) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
      unprepare?.();
      unprepare = preparePreviewDocument(doc);
      const sync = () => {
        const current = ++generation;
        const pending: Promise<void>[] = [];
        const previous = Array.from(doc.head.querySelectorAll("[data-preview-styles]"));
        document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(node => {
          const clone = node.cloneNode(true) as HTMLElement;
          clone.dataset.previewStyles = "true";
          if (clone instanceof HTMLLinkElement) pending.push(new Promise<void>(resolve => {
            clone.addEventListener("load", () => resolve(), { once: true });
            clone.addEventListener("error", () => resolve(), { once: true });
          }));
          doc.head.appendChild(clone);
        });
        void Promise.all(pending).then(() => {
          if (!active || current !== generation) return;
          previous.forEach(node => node.remove());
          setBody(doc.body); onBody(doc.body);
        });
      };
      sync();
      observer = new MutationObserver(sync);
      observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    };
    element.addEventListener("load", mount);
    mount();
    return () => { active = false; observer?.disconnect(); unprepare?.(); element.removeEventListener("load", mount); onBody(null); };
  }, [onBody]);
  const value = useMemo(() => ({ playback: false, draft, videoSource, selection: null, allowedPieces: PREVIEW_PIECES, select: () => undefined }), [draft, videoSource]);
  // Click-to-field: put each field's edit target on the public node that shows it, in this preview frame only. Content
  // that loads later (Schedule, partner logos) re-renders the page, so the stamps are re-applied on each change.
  useEffect(() => body ? watchEditTargetStamps(body, homepagePreviewStamps(draft)) : undefined, [body, draft]);
  return <>
    <iframe ref={frame} title="Homepage preview" aria-hidden="true" tabIndex={-1} {...{ inert: true }} srcDoc={initialDocument.current}
      data-preview-settling={hidden ? "true" : undefined} style={{ width: OVERVIEW_DESIGN_WIDTH, height, visibility: hidden ? "hidden" : "visible" }} />
    {body && createPortal(
      <HomepagePreviewContext.Provider value={value}>
        <div data-homepage-preview="true" data-playback="false">
          <style>{FRAME_STYLE}</style>
          <CinematicShell editing><HomePageClient initialHeroContent={{ ...draft.hero, id: 1, updated_at: "" }} /></CinematicShell>
        </div>
      </HomepagePreviewContext.Provider>, body)}
  </>;
}

/** Number every block on the page in the order it appears. Menu and footer are one part with two blocks, so they get two numbers. */
export function numberParts(rects: PartRects): PartNumbers {
  const all = (Object.keys(rects) as PartId[]).flatMap(part => (rects[part] ?? []).map(rect => ({ part, rect })));
  all.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const numbers: PartNumbers = {};
  all.forEach(({ part }, index) => { (numbers[part] ??= []).push(index + 1); });
  return numbers;
}

export type HomepageOverviewPreviewProps = {
  draft: HomepageDraft;
  videoSource: string;
  parts: readonly HomepagePart[];
  actual: boolean;
  /** `target`: the field under the pointer when a part was clicked (keyboard activation passes none). */
  onOpen: (part: PartId, opener: HTMLElement, target?: EditTargetId) => void;
  onNumbers?: (numbers: PartNumbers) => void;
};

export default function HomepageOverviewPreview({ draft, videoSource, parts, actual, onOpen, onNumbers }: HomepageOverviewPreviewProps) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // One measurement per frame. Each column's buttons and slice come from the frame that column shows, never from another
  // frame's layout: two renders of the same page can differ for a moment (a picture or Schedule result landing in one first).
  const [measurements, setMeasurements] = useState<[Measurement | null, Measurement | null]>([null, null]);
  const [bodies, setBodies] = useState<[HTMLElement | null, HTMLElement | null]>([null, null]);
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState<PartId | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = actual || width < TWO_COLUMN_MIN ? 1 : 2;
  const colWidth = columns === 2 ? (width - COLUMN_GAP) / 2 : width;
  const scale = actual ? 1 : colWidth > 0 ? colWidth / OVERVIEW_DESIGN_WIDTH : 0.4;

  const setBody = useCallback((index: 0 | 1, body: HTMLElement | null) => {
    setBodies(previous => previous[index] === body ? previous : (index === 0 ? [body, previous[1]] : [previous[0], body]));
  }, []);
  const onBody0 = useCallback((body: HTMLElement | null) => setBody(0, body), [setBody]);
  const onBody1 = useCallback((body: HTMLElement | null) => setBody(1, body), [setBody]);
  const watchBody = useCallback((index: 0 | 1, body: HTMLElement | null) => {
    const store = (next: Measurement | null) => setMeasurements(previous => {
      if (JSON.stringify(previous[index]) === JSON.stringify(next)) return previous;
      return index === 0 ? [next, previous[1]] : [previous[0], next];
    });
    // A new (or no) frame document starts unmeasured: its column never borrows an old frame's layout.
    store(null);
    if (!body) return undefined;
    return watchFrameLayout(body, HOMEPAGE_PARTS, () => {
      const next = measureParts(body.ownerDocument, HOMEPAGE_PARTS);
      if (next && next.total > 400) store(next);
    });
  }, []);
  const [body0, body1] = bodies;
  useEffect(() => watchBody(0, body0), [watchBody, body0]);
  useEffect(() => watchBody(1, body1), [watchBody, body1]);

  const first = measurements[0];
  useEffect(() => {
    if (!first) return;
    const timer = window.setTimeout(() => setReady(true), 350);
    return () => window.clearTimeout(timer);
  }, [first]);
  useEffect(() => { if (first) setSplit(current => chooseSplit(first, current)); }, [first]);

  const numbers = useMemo(() => numberParts(first?.rects ?? {}), [first]);
  useEffect(() => { if (first) onNumbers?.(numbers); }, [numbers, first, onNumbers]);

  // Column 1 shows the second frame; until that frame has measured itself it is covered by the shimmer, not guessed at.
  const second = columns === 2 ? measurements[1] : null;
  const totalOf = (measurement: Measurement | null) => measurement?.total ?? OVERVIEW_PAGE_RATIO * OVERVIEW_DESIGN_WIDTH;
  const splitTopOf = (measurement: Measurement | null) => {
    const total = totalOf(measurement);
    return split ? measurement?.rects[split]?.[0]?.top ?? total / 2 : total / 2;
  };
  const firstSpan = columns === 2 ? splitTopOf(first) : totalOf(first);
  const secondOffset = splitTopOf(second);
  const secondSpan = Math.max(0, totalOf(second) - secondOffset);
  const columnReady = (index: 0 | 1) => ready && (index === 0 || !!second);
  // Until the page has been measured the box keeps the skeleton's reserved shape. Then it takes the real height, so the
  // columns end where their content ends. Nothing below the box needs to move: the form chip sits above it.
  const boxHeight = ready ? Math.max(1, columns === 2 ? Math.max(firstSpan, second ? secondSpan : 0) : totalOf(first)) : overviewReservedHeight(columns);

  // Both frames get the same viewport height, so viewport-relative sizes (svh) lay them out the same.
  const iframeHeight = Math.max(first?.total ?? 0, second?.total ?? 0, 1200);
  // The part buttons sit in the same box as the inert preview frame, so the field under the pointer is found by geometry.
  const fieldUnder = (button: HTMLElement, x: number, y: number) => button.parentElement ? editTargetHitAt(button.parentElement, x, y) : null;
  // The field hover outline is moved directly (no React state), so moving the mouse never re-renders the preview.
  const showFieldHover = (button: HTMLElement, x: number, y: number) => {
    const root = button.parentElement;
    const outline = root?.querySelector<HTMLElement>(":scope > [data-field-hover]");
    if (!root || !outline) return;
    const hit = fieldUnder(button, x, y);
    if (!hit) { outline.hidden = true; delete outline.dataset.target; return; }
    const box = root.getBoundingClientRect();
    outline.style.left = `${hit.rect.left - box.left}px`;
    outline.style.top = `${hit.rect.top - box.top}px`;
    outline.style.width = `${hit.rect.width}px`;
    outline.style.height = `${hit.rect.height}px`;
    outline.dataset.target = hit.id;
    outline.hidden = false;
  };
  const hideFieldHover = (button: HTMLElement) => {
    const outline = button.parentElement?.querySelector<HTMLElement>(":scope > [data-field-hover]");
    if (outline) { outline.hidden = true; delete outline.dataset.target; }
  };
  const fieldHover = <span className={styles.fieldHover} data-field-hover="" aria-hidden="true" hidden />;
  const buttons = (measurement: Measurement | null, offset: number, span: number) => layoutPartButtons(parts, measurement, numbers, offset, span, scale).map(button => {
    const common = {
      type: "button" as const, "data-part": button.part, "data-kit-edit": "", "aria-label": button.label,
      // A pointer click opens the field under the pointer; Enter or Space (detail 0) opens the part, as before.
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => onOpen(button.part, event.currentTarget, event.detail > 0 ? fieldUnder(event.currentTarget, event.clientX, event.clientY)?.id : undefined),
      onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => { if (event.pointerType === "mouse") showFieldHover(event.currentTarget, event.clientX, event.clientY); },
      onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => hideFieldHover(event.currentTarget),
    };
    const title = button.title.slice("Edit ".length);
    if (button.hidden) return <button key={button.key} {...common} className={styles.hidden}
      style={{ top: button.top, left: button.left }}><IconEdit size={14} aria-hidden="true" />{title} is hidden on the page. Click to edit or show it.</button>;
    return <button key={button.key} {...common} className={styles.part}
      style={{ top: button.top, left: button.left, width: button.width, height: button.height }}>
      <span className={styles.num} aria-hidden="true">{button.number}</span>
      <span className={styles.chip} aria-hidden="true"><IconEdit size={13} />{button.title}</span>
    </button>;
  });

  const ratio = `${OVERVIEW_DESIGN_WIDTH} / ${boxHeight}`;
  const column = (index: 0 | 1) => {
    const measurement = index === 0 ? first : second;
    const offset = index === 0 ? 0 : secondOffset;
    const span = index === 0 ? firstSpan : secondSpan;
    const shown = columnReady(index);
    const frameBody = <PageFrame draft={draft} videoSource={videoSource} height={iframeHeight} hidden={!shown} onBody={index === 0 ? onBody0 : onBody1} />;
    const stage = <div className={styles.stage} style={{ width: OVERVIEW_DESIGN_WIDTH, transform: `scale(${scale}) translateY(${-offset}px)` }}>{frameBody}</div>;
    return <div key={index} className={styles.box} style={{ "--ar": ratio, aspectRatio: ratio } as CSSProperties} data-column={index} data-ready={shown}>
      <div className={styles.clip} style={{ height: span * scale }}>{stage}</div>
      {!shown && <Shimmer className={styles.cover} />}
      {shown && buttons(measurement, offset, span)}
      {shown && fieldHover}
    </div>;
  };

  if (actual) {
    const total = totalOf(first);
    return <div ref={root} className={styles.columns} style={{ "--columns": 1 } as CSSProperties}>
      <div className={styles.box} data-actual="true" data-ready={ready}>
        <div className={styles.scrollSpacer} style={{ width: OVERVIEW_DESIGN_WIDTH, height: total }}>
          <div className={styles.stage} style={{ width: OVERVIEW_DESIGN_WIDTH }}>
            <PageFrame draft={draft} videoSource={videoSource} height={iframeHeight} hidden={!ready} onBody={onBody0} />
          </div>
          {ready && buttons(first, 0, total)}
          {ready && fieldHover}
        </div>
      </div>
    </div>;
  }
  return <div ref={root} className={styles.columns} style={{ "--columns": columns } as CSSProperties}>
    {column(0)}
    {columns === 2 && column(1)}
  </div>;
}

export { HOMEPAGE_PARTS };
