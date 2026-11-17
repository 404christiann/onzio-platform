"use client";

import { useEffect, useState } from "react";
import styles from "./standings.module.css";

export function StandingNumberField({ label, value, onChange, allowNegative = false, readOnly = false }: {
  label: string; value: number; onChange: (value: number) => void; allowNegative?: boolean; readOnly?: boolean;
}) {
  const [unfinished, setUnfinished] = useState<"" | "-" | null>(null);
  useEffect(() => setUnfinished(null), [value]);
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="number"
        inputMode={allowNegative ? "text" : "numeric"}
        min={allowNegative ? undefined : 0}
        step={1}
        value={String(unfinished ?? value)}
        readOnly={readOnly}
        aria-readonly={readOnly || undefined}
        title={readOnly ? "Worked out from the scores you save" : undefined}
        onFocus={(event) => { if (!readOnly) event.currentTarget.select(); }}
        onMouseDown={(event) => {
          if (!readOnly && event.button === 0 && document.activeElement !== event.currentTarget) {
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.select();
          }
        }}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "" || raw === "-") { setUnfinished(raw); return; }
          setUnfinished(null);
          const next = Math.trunc(Number(raw) || 0);
          onChange(allowNegative ? next : Math.max(0, next));
        }}
        onBlur={() => setUnfinished(null)}
      />
    </label>
  );
}
