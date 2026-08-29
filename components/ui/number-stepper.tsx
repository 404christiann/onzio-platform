"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type NumberStepperProps = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function clamp(v: number, min?: number, max?: number) {
  if (Number.isNaN(v)) v = min ?? 0;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/**
 * Controlled number stepper: decrement button, centered numeric input,
 * increment button. For single-quantity fields (capacity, count, etc.) —
 * not for dense stat-entry grids, which use `components/admin/StatInput`.
 */
function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className,
  "aria-label": ariaLabel,
}: NumberStepperProps) {
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div
      data-slot="number-stepper"
      className={cn(
        "inline-flex items-center rounded-lg border border-input bg-background transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        data-slot="number-stepper-decrement"
        aria-label="Decrease value"
        disabled={disabled || atMin}
        onClick={() => onChange(clamp(value - step, min, max))}
        className="flex size-9 shrink-0 items-center justify-center rounded-l-lg text-muted-foreground outline-none transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        type="number"
        data-slot="number-stepper-input"
        aria-label={ariaLabel}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-12 border-0 bg-transparent p-0 text-center font-body text-sm text-foreground outline-none [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        tabIndex={-1}
        data-slot="number-stepper-increment"
        aria-label="Increase value"
        disabled={disabled || atMax}
        onClick={() => onChange(clamp(value + step, min, max))}
        className="flex size-9 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

export { NumberStepper };
