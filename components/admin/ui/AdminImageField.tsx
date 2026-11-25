"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Upload, X } from "lucide-react";

import ResilientImage from "@/components/ResilientImage";
import {
  imageAccept,
  imageFileIssue,
  imageHint,
  type AdminImageRules,
} from "./adminImageFiles";
import styles from "./AdminImageField.module.css";

/** `true` = saved, `false` = generic failure message, `{ error }` = show that text on the field. */
export type AdminImageUploadResult = boolean | { error: string };

export type AdminImageFieldProps = AdminImageRules & {
  label: string;
  previewUrl?: string | null;
  initials?: string;
  size?: 64 | 72 | 96;
  shape?: "circle" | "square";
  uploading?: boolean;
  disabled?: boolean;
  onUpload: (files: FileList) => Promise<AdminImageUploadResult>;
  onRemove?: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

export function AdminImageField({
  label,
  previewUrl,
  initials = "?",
  size = 72,
  shape = "circle",
  uploading = false,
  disabled = false,
  allowedTypes,
  maxBytes,
  onUpload,
  onRemove,
  onDirty,
  onPendingChange,
}: AdminImageFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const attemptRef = useRef<{ notify?: (pending: boolean) => void } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setPending(false);
    return () => {
      mounted.current = false;
      const attempt = attemptRef.current;
      attemptRef.current = null;
      inFlight.current = false;
      attempt?.notify?.(false);
    };
  }, []);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const hintId = useId();
  const errorId = useId();
  const busy = pending || uploading;
  const rules = { allowedTypes, maxBytes };

  async function handleFiles(files: FileList | null) {
    if (!files?.length || disabled || uploading || inFlight.current) return;
    if (files.length !== 1) {
      setMessage("Choose one image at a time.");
      return;
    }
    inFlight.current = true;
    const attempt = { notify: onPendingChange };
    attemptRef.current = attempt;
    setPending(true);
    const file = files[0];
    try {
      attempt.notify?.(true);
      const issue = await imageFileIssue(file, rules);
      if (!mounted.current || attemptRef.current !== attempt) return;
      if (issue) {
        setMessage(issue);
        return;
      }
      setMessage("");
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const saved = await onUpload(transfer.files);
      if (!mounted.current || attemptRef.current !== attempt) return;
      if (saved === true) onDirty?.();
      else if (saved && typeof saved === "object" && saved.error) setMessage(saved.error);
      else setMessage("The image could not be uploaded. Try again.");
    } catch {
      if (mounted.current && attemptRef.current === attempt) setMessage("The image could not be uploaded. Try again.");
    } finally {
      if (attemptRef.current === attempt) {
        attemptRef.current = null;
        inFlight.current = false;
        if (mounted.current) setPending(false);
        attempt.notify?.(false);
      }
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className={styles.field} data-admin-image-field="" data-shape={shape}>
      <label className={styles.label}>{label}</label>
      <div className={styles.controls}>
        <div
          className={styles.drop}
          data-dragging={dragging || undefined}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!disabled && !busy) setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={drop}
        >
          <div
            className={styles.preview}
            data-shape={shape}
            data-size={size}
            style={{ width: size, height: size }}
            aria-busy={busy || undefined}
          >
            {previewUrl ? (
              <span key={previewUrl} className={styles.image} data-admin-image-preview="">
                <ResilientImage
                  src={previewUrl}
                  alt={label}
                  fill
                  sizes={`${size}px`}
                  className={styles.photo}
                  fallback={<span className={styles.initials}>{initials}</span>}
                />
              </span>
            ) : (
              <span className={styles.initials} data-admin-image-initials="">{initials}</span>
            )}
            {busy && (
              <span className={styles.pending} data-admin-image-pending="">
                <span className={styles.ring} data-admin-image-pending-ring="" aria-hidden="true" />
              </span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <input
            ref={input}
            className={styles.fileInput}
            type="file"
            accept={imageAccept(rules)}
            aria-label={`Choose ${label.toLowerCase()}`}
            tabIndex={-1}
            disabled={disabled || busy}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            ref={uploadButton}
            type="button"
            className={styles.action}
            onClick={() => input.current?.click()}
            disabled={disabled || busy}
            aria-describedby={hintId}
          >
            <Upload size={16} aria-hidden="true" />
            {previewUrl ? "Replace image" : "Upload image"}
          </button>
          {previewUrl && onRemove && (
            <button
              type="button"
              className={styles.remove}
              onClick={() => {
                onRemove();
                onDirty?.();
                setMessage("");
                queueMicrotask(() => uploadButton.current?.focus({ preventScroll: true }));
              }}
              disabled={disabled || busy}
            >
              <X size={16} aria-hidden="true" />
              Remove
            </button>
          )}
          <span id={hintId} className={styles.hint}>{imageHint(rules)}</span>
        </div>
      </div>
      <p id={errorId} className={styles.message} aria-live="polite" data-admin-image-error="">
        {message}
      </p>
    </div>
  );
}

