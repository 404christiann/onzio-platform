"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./SmoothSlider.module.css";

/**
 * A native range input with a 44px touch target. Dragging is smooth because the
 * thumb and fill are driven by the browser and a CSS variable set straight on
 * the element, never by React state. The value reaches the page draft at most
 * once per animation frame, so the live preview follows without blocking the drag.
 */
export function SmoothSlider({ label, value, min, max, step, unit = "", help, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; help?: ReactNode; onChange: (value: number) => void;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const input = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLOutputElement>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const dragging = useRef(false);
  const latest = useRef(onChange);
  latest.current = onChange;

  const paint = (next: number) => {
    const element = input.current;
    if (!element) return;
    element.style.setProperty("--fill", `${((next - min) / (max - min)) * 100}%`);
    element.setAttribute("aria-valuetext", `${format(next)}${unit}`);
    if (readout.current) readout.current.textContent = `${format(next)}${unit}`;
  };

  // Follow the draft when it changes from elsewhere (discard, reload), but never fight a drag in progress.
  useEffect(() => {
    const element = input.current;
    if (!element || dragging.current) return;
    if (Number(element.value) !== value) element.value = String(value);
    paint(value);
  });

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  function flush() {
    frame.current = null;
    if (pending.current !== null) {
      const next = pending.current;
      pending.current = null;
      latest.current(next);
    }
  }

  return <div className={styles.field}>
    <div className={styles.head}>
      <label htmlFor={id}>{label}</label>
      <output ref={readout} htmlFor={id} className={styles.value}>{format(value)}{unit}</output>
    </div>
    <input
      ref={input}
      id={id}
      className={styles.range}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      aria-describedby={help ? helpId : undefined}
      onPointerDown={() => { dragging.current = true; }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onBlur={() => { dragging.current = false; }}
      onInput={event => {
        const next = Number(event.currentTarget.value);
        paint(next);
        pending.current = next;
        if (frame.current === null) frame.current = requestAnimationFrame(flush);
      }}
    />
    {help && <p id={helpId} className={styles.help}>{help}</p>}
  </div>;
}

function format(value: number) {
  return String(Math.round(value * 10) / 10);
}
