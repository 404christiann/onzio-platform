"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { editTargetProps, type EditTargetId } from "@/lib/admin-edit-targets";
import styles from "./RangeSlider.module.css";

export type SliderRange = { min: number; max: number; step: number; bigStep: number; defaultValue: number; detent: number };

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length;
const clamp = (value: number, { min, max }: SliderRange) => Math.min(max, Math.max(min, value));

/** Rounds to the nearest step from `min`, inside the range, without floating-point tails (0.1 + 0.2). */
export function snapToStep(value: number, range: SliderRange): number {
  const snapped = range.min + Math.round((clamp(value, range) - range.min) / range.step) * range.step;
  return Number(clamp(snapped, range).toFixed(decimals(range.step)));
}

/** The value under a pointer at `fraction` (0 = left end, 1 = right end) of the track. Dragging catches on the default. */
export function valueAtFraction(fraction: number, range: SliderRange): number {
  const value = snapToStep(range.min + Math.min(1, Math.max(0, fraction)) * (range.max - range.min), range);
  return Math.abs(value - range.defaultValue) <= range.detent + 1e-9 ? range.defaultValue : value;
}

/** Arrow keys move one step, Shift+arrow and Page keys one big step, Home and End go to the ends. Other keys: null. */
export function valueForKey(key: string, shift: boolean, value: number, range: SliderRange): number | null {
  const step = shift ? range.bigStep : range.step;
  const moves: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: range.bigStep, PageDown: -range.bigStep };
  if (key === "Home") return range.min;
  if (key === "End") return range.max;
  return key in moves ? snapToStep(value + moves[key], range) : null;
}

const fractionOf = (value: number, { min, max }: SliderRange) => (Math.min(max, Math.max(min, value)) - min) / (max - min);
/** Pixels a touch must travel sideways before it counts as a drag rather than the start of a page scroll. */
const TOUCH_SLOP = 4;
const THUMB = 24;

type Drag = { pointerId: number; startX: number; startY: number; startValue: number; grab: number; active: boolean; touch: boolean };

/**
 * A labelled slider for one number. The current value and its unit sit beside the label; a tick marks the default and
 * dragging catches on it; Reset puts the default back. `onInput` runs on every move (drive the preview from it), and
 * `onCommit` once the move is over (pointer up, key up, blur, Reset), so a caller can keep heavier work off the drag.
 *
 * The control under the pointer is a native range input, kept for the keyboard, focus and screen readers (it carries
 * `aria-valuetext` with the unit). The track and thumb are drawn here so a press grows the thumb, a tap on the track
 * jumps there, and a touch only takes over once it moves sideways: a vertical swipe still scrolls the page.
 */
export function RangeSlider({ label, value, range, format, describe, disabled = false, hint, target, onInput, onCommit }: {
  label: string;
  value: number;
  range: SliderRange;
  /** The value as shown beside the label, with its unit: "48 px", "1.25×". */
  format: (value: number) => string;
  /** The value as a screen reader says it: "48 pixels". */
  describe: (value: number) => string;
  disabled?: boolean;
  hint?: ReactNode;
  target?: EditTargetId;
  onInput: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const lastBuzz = useRef(false);
  /** The value this slider last asked for. Set from `value` when a gesture starts, then only by its own requests, so a
   *  render that is a frame behind can never make it skip a move or keep an in-between value. */
  const latest = useRef(value);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const atDefault = value === range.defaultValue;

  // Reset glides; a key press or a drag never animates. The class comes off after the glide (or at once without motion).
  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), 220);
    return () => window.clearTimeout(timer);
  }, [settling]);

  const fractionAt = (clientX: number, grab: number) => {
    const box = rail.current?.getBoundingClientRect();
    if (!box || box.width <= THUMB) return 0;
    return (clientX - grab - box.left - THUMB / 2) / (box.width - THUMB);
  };
  const thumbCenter = () => {
    const box = rail.current?.getBoundingClientRect();
    return box ? box.left + THUMB / 2 + fractionOf(value, range) * (box.width - THUMB) : 0;
  };
  const move = (next: number, touch: boolean) => {
    // A short buzz where the phone supports it, once, as the thumb catches on the default.
    const caught = next === range.defaultValue;
    if (touch && caught && !lastBuzz.current) navigator.vibrate?.(8);
    lastBuzz.current = caught;
    request(next);
  };
  const request = (next: number) => {
    if (next === latest.current) return;
    latest.current = next;
    onInput(next);
  };
  const finish = (next: number | null) => {
    drag.current = null;
    setDragging(false);
    onCommit(next ?? latest.current);
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0 || drag.current) return;
    // No mouse-down default (text selection, focusing the scroll area): the slider takes focus itself, without scrolling.
    if (event.pointerType !== "touch") event.preventDefault();
    input.current?.focus({ preventScroll: true });
    const center = thumbCenter();
    // Grabbing the thumb keeps it under the finger where it was held; pressing the track moves the thumb there.
    const grab = Math.abs(event.clientX - center) <= THUMB ? event.clientX - center : 0;
    const touch = event.pointerType === "touch";
    latest.current = value;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startValue: value, grab, active: !touch, touch };
    lastBuzz.current = value === range.defaultValue;
    if (touch) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    // Pressing the thumb changes nothing until it moves; pressing the track moves the thumb there.
    if (grab === 0) move(valueAtFraction(fractionAt(event.clientX, 0), range), false);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      if (Math.abs(event.clientX - current.startX) < TOUCH_SLOP) return;
      current.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    move(valueAtFraction(fractionAt(event.clientX, current.grab), range), current.touch);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.active) {
      // A tap: the thumb goes where the finger lifted (a tap on the thumb itself changes nothing).
      if (current.grab === 0) request(valueAtFraction(fractionAt(event.clientX, 0), range));
      finish(null);
      return;
    }
    // A thumb pressed and let go without moving keeps its value (dragging catches on the default; a press does not).
    if (current.grab === 0 || event.clientX !== current.startX) request(valueAtFraction(fractionAt(event.clientX, current.grab), range));
    finish(null);
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // The browser took the gesture (a page scroll, a system swipe): put back the value from before the touch.
    if (current.active) request(current.startValue);
    finish(current.startValue);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Ctrl, Alt and Meta with an arrow belong to the browser and the system (Meta+Left is Back on a Mac).
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (!event.repeat) latest.current = value;
    const next = valueForKey(event.key, event.shiftKey, latest.current, range);
    if (next === null) return;
    event.preventDefault();
    request(next);
  }

  function reset() {
    if (atDefault || disabled) return;
    setSettling(true);
    // Reset hides itself at the default, so focus moves to the slider rather than falling to the page.
    input.current?.focus({ preventScroll: true });
    latest.current = value;
    request(range.defaultValue);
    onCommit(range.defaultValue);
  }

  const style = { "--slider-fraction": fractionOf(value, range), "--slider-default": fractionOf(range.defaultValue, range) } as CSSProperties;
  return <div className={styles.slider} style={style} data-dragging={dragging || undefined} data-settling={settling || undefined}
    data-disabled={disabled || undefined} data-range-slider="" {...editTargetProps(target)}>
    <div className={styles.head}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <output htmlFor={id} className={styles.value} aria-hidden="true" data-slider-value="">{format(value)}</output>
    </div>
    <div ref={rail} className={styles.rail} data-slider-track=""
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
      {/* First focusable in the slider, so click-to-field focuses the slider itself. */}
      <input ref={input} id={id} type="range" className={styles.input} min={range.min} max={range.max} step={range.step} value={value}
        disabled={disabled} aria-valuetext={describe(value)} aria-describedby={hint ? hintId : undefined}
        onKeyDown={onKeyDown} onKeyUp={() => onCommit(latest.current)} onBlur={() => { if (!drag.current) onCommit(value); }} onChange={event => { const next = snapToStep(Number(event.target.value), range); if (next !== value) { latest.current = value; request(next); onCommit(next); } }} />
      <span className={styles.track} aria-hidden="true"><span className={styles.fill} /></span>
      <span className={styles.tick} aria-hidden="true" data-at-default={atDefault || undefined} />
      <span className={styles.thumbLane} aria-hidden="true"><span className={styles.thumbSlot}><span className={styles.thumb} /></span></span>
    </div>
    <div className={styles.foot}>
      {hint ? <span id={hintId} className={styles.hint}>{hint}</span> : <span />}
      {/* Kept in the layout at the default (hidden), so the row never shifts when it appears. */}
      <button type="button" className={`admin-press ${styles.reset}`} disabled={disabled || atDefault} data-hidden={atDefault || undefined}
        onClick={reset} aria-label={`Reset ${label.toLowerCase()} to ${format(range.defaultValue)}`} title={`Reset to ${format(range.defaultValue)}`} data-slider-reset="">
        Reset
      </button>
    </div>
  </div>;
}
