"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconCheck, IconLink } from "@/components/admin/icons";
import { buildCampaignLink, normalizeUtmValue, UTM_MAX_CHARS } from "@/lib/telemetry/campaign-link";
import frame from "./frame.module.css";
import styles from "./insights.module.css";

// TELEMETRY-04: builds a tracked link for a social post. Everything happens in
// the browser: no saving and no server calls. Visits that arrive through the
// link show up under Campaigns above.

type UtmField = "source" | "medium" | "campaign";
const FIELDS: ReadonlyArray<{ key: UtmField; label: string; placeholder: string; hint: string }> = [
  { key: "source", label: "Source", placeholder: "instagram", hint: "Where you post the link" },
  { key: "medium", label: "Medium", placeholder: "social", hint: "The kind of post, like social or email" },
  { key: "campaign", label: "Campaign", placeholder: "matchday-nov", hint: "A short name you will recognize later" },
];

export function CampaignLinkBuilder({ host, paths }: { host: string; paths: readonly string[] }) {
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
    <section aria-labelledby={`${baseId}-title`} className={frame.wide} data-testid="campaign-link-builder">
      <h2 id={`${baseId}-title`} className={frame.label}>
        Campaign link builder
      </h2>
      <div className={`${frame.card} ${styles.builder}`}>
        <p className={styles.builderIntro}>
          Make a link for a social post, so visits from it show up under Campaigns.
        </p>
        <div className={styles.fields}>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor={`${baseId}-page`}>Page</label>
            <select
              id={`${baseId}-page`}
              className={styles.input}
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setCopied(false);
                setStatus("");
              }}
            >
              {pageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          {FIELDS.map((field) => {
            const check = normalizeUtmValue(values[field.key]);
            const error = touched[field.key] && !check.ok ? check.error : null;
            const id = `${baseId}-${field.key}`;
            return (
              <div key={field.key} className={`${styles.field} ${field.key === "campaign" ? styles.fieldWide : ""}`}>
                <label htmlFor={id}>{field.label}</label>
                <input
                  id={id}
                  className={styles.input}
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
                <small id={`${id}-hint`} className={styles.hint}>
                  {field.hint}
                </small>
                {error ? (
                  <span id={`${id}-error`} className={styles.error}>
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {errors.host ? (
          <p className={styles.error} role="alert">
            {errors.host}
          </p>
        ) : null}
        {result.ok ? (
          <div className={styles.outputRow}>
            <input
              ref={outputRef}
              className={styles.output}
              type="text"
              readOnly
              value={result.url}
              aria-label="Campaign link"
              data-testid="campaign-link-output"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className={`${styles.copy} ${frame.press}`} onClick={copy} data-testid="campaign-link-copy">
              {copied ? <IconCheck aria-hidden="true" /> : <IconLink aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : (
          <p className={styles.hint}>Fill in the source, medium and campaign to get your link. Up to {UTM_MAX_CHARS} characters each.</p>
        )}
        <p className={frame.srOnly} role="status" aria-live="polite">
          {status}
        </p>
        {status && status !== "Link copied" ? <p className={styles.hint}>{status}</p> : null}
      </div>
    </section>
  );
}
