"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import CinematicShell from "@/components/cinematic/CinematicShell";
import HomePageClient from "@/components/HomePageClient";
import { IconEdit } from "@/components/admin/icons";
import { Shimmer } from "@/components/admin/ui/Shimmer";
import { HomepagePreviewContext } from "@/lib/homepage-editor/preview-context";
import type { HomepageDraft } from "@/lib/homepage-editor/model";
import { HOMEPAGE_PARTS, PREVIEW_PIECES, type HomepagePart, type PartId } from "./homepage-parts";
import { editTargetHitAt, watchEditTargetStamps } from "@/components/admin/ui/editor-kit/editTargets";
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

type Rect = { top: number; left: number; width: number; height: number };
export type PartRects = Partial<Record<PartId, Rect[]>>;
export type Measurement = { total: number; rects: PartRects };
export type PartNumbers = Partial<Record<PartId, number[]>>;

const rectOf = (element: Element | null | undefined): Rect | null => {
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

/** Find each part's block in the rendered public page by the pieces the public components already tag. */
function measure(doc: Document): Measurement | null {
  const body = doc.body;
  if (!body) return null;
  const piece = (id: string) => doc.querySelector(`[data-homepage-piece="${id}"]`);
  const rects: PartRects = {};
  const add = (part: PartId, rect: Rect | null) => { if (rect) (rects[part] ??= []).push(rect); };
  add("menu", rectOf(piece("revamp.navigation") ?? doc.querySelector("header.club-header")));
  add("menu", rectOf(doc.querySelector("footer.club-footer")));
  add("hero", rectOf(piece("hero.heading")?.closest("section") ?? doc.querySelector("section.hero")));
  add("raffle", rectOf(piece("revamp.raffle")));
  add("match", rectOf(piece("revamp.match")));
  add("prices", rectOf(piece("revamp.prices")));
  add("ticket", rectOf(piece("revamp.ticket")));
  add("photos", rectOf(piece("photos")));
  add("championship", rectOf(piece("revamp.championship")));
  add("video", rectOf(piece("video")));
  add("sponsors", rectOf(piece("revamp.sponsors")?.closest("section")));
  return { total: Math.ceil(body.getBoundingClientRect().height), rects };
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
  const [body, setBody] = useState<HTMLElement | null>(null);
  const initialDocument = useRef("<!doctype html><html lang='en'><head></head><body></body></html>");
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: MutationObserver | undefined;
    let active = true;
    let generation = 0;
    const mount = () => {
      observer?.disconnect();
      const doc = element.contentDocument;
      if (!doc?.documentElement || !doc.head || !doc.body) return;
      doc.documentElement.lang = "en";
      doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
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
    return () => { active = false; observer?.disconnect(); element.removeEventListener("load", mount); onBody(null); };
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
        <div data-homepage-preview="true" data-playback="false" onClickCapture={event => event.preventDefault()} onSubmitCapture={event => event.preventDefault()}>
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
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [ready, setReady] = useState(false);
  const bodies = useRef<(HTMLElement | null)[]>([null, null]);
  const split = useRef<PartId | "lead" | null>(null);

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

  // The first frame reports the layout; both frames render the same page so the second column just shows its lower half.
  const run = useCallback((index: number) => {
    const body = bodies.current[index];
    const doc = body?.ownerDocument;
    if (!doc || index !== 0) return;
    const next = measure(doc);
    if (next && next.total > 400) setMeasurement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  }, []);
  const schedule = useRef(0);
  const request = useCallback((index: number) => {
    window.cancelAnimationFrame(schedule.current);
    schedule.current = window.requestAnimationFrame(() => run(index));
  }, [run]);
  const onBody0 = useCallback((body: HTMLElement | null) => {
    bodies.current[0] = body;
    if (!body) return;
    const observer = new ResizeObserver(() => request(0));
    observer.observe(body);
    const mutation = new MutationObserver(() => request(0));
    mutation.observe(body, { childList: true, subtree: true, attributes: true });
    body.ownerDocument.addEventListener("load", () => request(0), true);
    body.ownerDocument.fonts?.ready.then(() => request(0));
    request(0);
  }, [request]);
  const onBody1 = useCallback((body: HTMLElement | null) => { bodies.current[1] = body; }, []);

  useEffect(() => {
    if (!measurement) return;
    const timer = window.setTimeout(() => setReady(true), 350);
    return () => window.clearTimeout(timer);
  }, [measurement]);

  const rects = useMemo(() => measurement?.rects ?? {}, [measurement]);
  const total = measurement?.total ?? OVERVIEW_PAGE_RATIO * OVERVIEW_DESIGN_WIDTH;
  const numbers = useMemo(() => numberParts(rects), [rects]);
  useEffect(() => { if (measurement) onNumbers?.(numbers); }, [numbers, measurement, onNumbers]);

  // Split the page at the block boundary nearest its middle, once. Edits then move text inside a column, never the split.
  const tops = useMemo(() => (Object.keys(rects) as PartId[]).filter(part => part !== "menu").map(part => ({ part, top: Math.min(...(rects[part] ?? [{ top: Infinity }]).map(rect => rect.top)) })).filter(entry => Number.isFinite(entry.top)).sort((a, b) => a.top - b.top), [rects]);
  if (ready && measurement && split.current === null && tops.length) {
    split.current = tops.reduce((best, entry) => Math.abs(entry.top - total / 2) < Math.abs(best.top - total / 2) ? entry : best, tops[0]).part;
  }
  const splitTop = columns === 2 && split.current && split.current !== "lead" ? (rects[split.current]?.[0]?.top ?? total / 2) : total;
  const firstHeight = columns === 2 ? splitTop : total;
  const secondHeight = columns === 2 ? Math.max(0, total - splitTop) : 0;
  // Until the page has been measured the box keeps the skeleton's reserved shape. Then it takes the real height once, so the
  // columns end where their content ends. Nothing below the box needs to move: the form chip sits above it.
  const boxHeight = ready ? Math.max(1, columns === 2 ? Math.max(firstHeight, secondHeight) : total) : overviewReservedHeight(columns);

  const iframeHeight = Math.max(measurement?.total ?? 0, 1200);
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
  const visibleParts = new Set(parts.map(part => part.id));
  const buttons = (offset: number, span: number) => {
    const out: React.ReactNode[] = [];
    // DOM order puts "Top of the page" (a plain text field) first and Menu and footer last; the page position is absolute anyway.
    const ordered = [...parts].sort((a, b) => Number(a.id === "menu") - Number(b.id === "menu"));
    for (const part of ordered) {
      if (part.offPage || !visibleParts.has(part.id)) continue;
      (rects[part.id] ?? []).forEach((rect, index) => {
        const mid = rect.top + rect.height / 2;
        if (mid < offset - 1 || mid > offset + span + 1) return;
        const label = `Edit ${part.title}`;
        const number = numbers[part.id]?.[index];
        const common = {
          type: "button" as const, "data-part": part.id, "data-kit-edit": "",
          // A pointer click opens the field under the pointer; Enter or Space (detail 0) opens the part, as before.
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => onOpen(part.id, event.currentTarget, event.detail > 0 ? fieldUnder(event.currentTarget, event.clientX, event.clientY)?.id : undefined),
          onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => { if (event.pointerType === "mouse") showFieldHover(event.currentTarget, event.clientX, event.clientY); },
          onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => hideFieldHover(event.currentTarget),
        };
        if (rect.height < HIDDEN_BELOW) {
          out.push(<button key={`${part.id}-${index}`} {...common} className={styles.hidden} aria-label={`${label}. Hidden on the page.`}
            style={{ top: (rect.top - offset) * scale, left: Math.max(8, rect.left * scale + 8) }}><IconEdit size={14} aria-hidden="true" />{part.title} is hidden on the page. Click to edit or show it.</button>);
          return;
        }
        out.push(<button key={`${part.id}-${index}`} {...common} className={styles.part} aria-label={number ? `${label} (part ${number})` : label}
          style={{ top: (rect.top - offset) * scale, left: rect.left * scale, width: rect.width * scale, height: Math.min(rect.height, offset + span - rect.top) * scale }}>
          <span className={styles.num} aria-hidden="true">{number}</span>
          <span className={styles.chip} aria-hidden="true"><IconEdit size={13} />{label}</span>
        </button>);
      });
    }
    return out;
  };

  const ratio = `${OVERVIEW_DESIGN_WIDTH} / ${boxHeight}`;
  const column = (index: 0 | 1) => {
    const offset = index === 0 ? 0 : splitTop;
    const span = index === 0 ? firstHeight : secondHeight;
    const frameBody = <PageFrame draft={draft} videoSource={videoSource} height={iframeHeight} hidden={!ready} onBody={index === 0 ? onBody0 : onBody1} />;
    const stage = <div className={styles.stage} style={{ width: OVERVIEW_DESIGN_WIDTH, transform: `scale(${scale}) translateY(${-offset}px)` }}>{frameBody}</div>;
    return <div key={index} className={styles.box} style={{ "--ar": ratio, aspectRatio: ratio } as CSSProperties} data-column={index} data-ready={ready}>
      <div className={styles.clip} style={{ height: span * scale }}>{stage}</div>
      {!ready && <Shimmer className={styles.cover} />}
      {ready && buttons(offset, span)}
      {ready && fieldHover}
    </div>;
  };

  if (actual) {
    return <div ref={root} className={styles.columns} style={{ "--columns": 1 } as CSSProperties}>
      <div className={styles.box} data-actual="true" data-ready={ready}>
        <div className={styles.scrollSpacer} style={{ width: OVERVIEW_DESIGN_WIDTH, height: total }}>
          <div className={styles.stage} style={{ width: OVERVIEW_DESIGN_WIDTH }}>
            <PageFrame draft={draft} videoSource={videoSource} height={iframeHeight} hidden={!ready} onBody={onBody0} />
          </div>
          {ready && buttons(0, total)}
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
