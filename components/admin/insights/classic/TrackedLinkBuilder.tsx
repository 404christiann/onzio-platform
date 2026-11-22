"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { buildCampaignLink, normalizeUtmValue, UTM_MAX_CHARS } from "@/lib/telemetry/campaign-link";

// UI-POLISH-INSIGHTS: the campaign link builder (TELEMETRY-04) in the classic
// admin's own form controls. Same rules as before: everything happens in the
// browser, no saving and no server calls; buildCampaignLink checks the values.

type UtmField = "source" | "medium" | "campaign";
const FIELDS: ReadonlyArray<{ key: UtmField; label: string; placeholder: string; hint: string }> = [
  { key: "source", label: "Where you post it", placeholder: "instagram", hint: "For example instagram or newsletter" },
  { key: "medium", label: "Kind of post", placeholder: "social", hint: "For example social or email" },
  { key: "campaign", label: "Name", placeholder: "matchday-nov", hint: "A short name you will recognize later" },
];

const INPUT =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive";

export function TrackedLinkBuilder({ host, paths }: { host: string; paths: readonly string[] }) {
  const baseId = useId();
  const [path, setPath] = useState(paths[0] ?? "/");
  const [values, setValues] = useState<Record<UtmField, string>>({ source: "", medium: "", campaign: "" });
  const [touched, setTouched] = useState<Record<UtmField, boolean>>({ source: false, medium: false, campaign: false });
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const outputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const result = useMemo(() => buildCampaignLink({ host, path, ...values }), [host, path, values]);
  const errors = result.ok ? {} : result.errors;
  const pageOptions = paths.length > 0 ? paths : ["/"];

  function update(key: UtmField, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setCopied(false);
    setStatus("");
  }

  async function copy() {
    if (!result.ok) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setStatus("Link copied");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCopied(false);
        setStatus("");
      }, 2000);
    } catch {
      outputRef.current?.focus();
      outputRef.current?.select();
      setStatus("Press Ctrl+C or ⌘C to copy");
    }
  }

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"
      data-testid="campaign-link-builder"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${baseId}-title`} className="text-[15px] font-semibold">
          Tracked link for a post
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Visits through this link show up under Campaign links above.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label htmlFor={`${baseId}-page`} className="text-[13px] font-medium">
            Page
          </label>
          <NativeSelect
            id={`${baseId}-page`}
            value={path}
            className="min-h-11 text-[15px]"
            onChange={(event) => {
              setPath(event.target.value);
              setCopied(false);
              setStatus("");
            }}
          >
            {pageOptions.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {option === "/" ? "Home page (/)" : option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {FIELDS.map((field) => {
          const check = normalizeUtmValue(values[field.key]);
          const error = touched[field.key] && !check.ok ? check.error : null;
          const id = `${baseId}-${field.key}`;
          return (
            <div key={field.key} className={`flex flex-col gap-2 ${field.key === "campaign" ? "sm:col-span-2" : ""}`}>
              <label htmlFor={id} className="text-[13px] font-medium">
                {field.label}
              </label>
              <input
                id={id}
                className={`${INPUT} min-h-11`}
                type="text"
                value={values[field.key]}
                placeholder={field.placeholder}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
                onChange={(event) => update(field.key, event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, [field.key]: true }))}
              />
              <span id={`${id}-hint`} className="text-[13px] text-muted-foreground">
                {field.hint}
              </span>
              {error ? (
                <span id={`${id}-error`} className="text-[13px] text-destructive">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {errors.host ? (
        <p className="text-[13px] text-destructive" role="alert">
          {errors.host}
        </p>
      ) : null}
      {result.ok ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={outputRef}
            className={`${INPUT} min-h-11 flex-1 bg-muted font-mono text-[13px]`}
            type="text"
            readOnly
            value={result.url}
            aria-label="Tracked link"
            data-testid="campaign-link-output"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={copy} data-testid="campaign-link-copy">
            {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Fill in all three to get the link. Up to {UTM_MAX_CHARS} characters each.
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {status && status !== "Link copied" ? <p className="text-[13px] text-muted-foreground">{status}</p> : null}
    </section>
  );
}
