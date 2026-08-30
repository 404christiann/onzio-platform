"use client";

import { cn } from "@/lib/utils";

type StatInputProps = {
  value: number;
  onChange: (v: number) => void;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">;

/**
 * Compact numeric input for dense stat-entry grids.
 *
 * Width tracks the current value's digit count (ch units) so 1-2 digit
 * stats stay tight while 3-4 digit values (e.g. season minutes) grow
 * without clipping. Values are clamped to >= 0 on change.
 */
function StatInput({ value, onChange, className, style, ...props }: StatInputProps) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
      data-slot="stat-input"
      className={cn(
        "justify-self-center rounded-lg border border-input bg-background px-0.5 py-1.5 text-center font-display text-base font-bold text-foreground outline-none transition-shadow [appearance:textfield] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      style={{
        width: `${Math.max(2, String(value).length) + 1}ch`,
        ...style,
      }}
      {...props}
    />
  );
}

export default StatInput;
