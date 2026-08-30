"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { AdminLoadingDots } from "@/components/admin/AdminLoading";
import ResilientImage from "@/components/ResilientImage";
import { cn } from "@/lib/utils";

type FileUploadProps = {
  /**
   * Receives the picked/dropped files. Matches the `(files: FileList | null)`
   * callback shape the admin pages' existing upload functions already use, so
   * the component drops in without changing any upload logic.
   */
  onUpload: (files: FileList | null) => void;
  /** External upload-in-flight state, owned by the page's upload function. */
  uploading?: boolean;
  /** Current uploaded image URL, shown as a thumbnail when set. */
  previewUrl?: string | null;
  /** File-type filter, e.g. "image/jpeg,image/png,image/webp". */
  accept?: string;
  /** When provided, renders a remove affordance for clearing the upload. */
  onRemove?: () => void;
  /** Accessible name + visible primary copy, e.g. "Upload hero image". */
  label?: string;
  /** File-type/size hint line. Defaults to a label derived from `accept`. */
  hint?: string;
  /**
   * Allow picking/dropping several files at once. `onUpload` receives the full
   * FileList. Multi-file callers own their own per-file preview UI, so they
   * should not pass `previewUrl` — the surface stays a dropzone that shows the
   * uploading state and returns to idle.
   */
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
};

const ACCEPT_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "image/*": "Images",
};

function acceptHint(accept?: string): string | null {
  if (!accept) return null;
  const labels = accept
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map(
      (rule) =>
        ACCEPT_LABELS[rule.toLowerCase()] ??
        (rule.startsWith(".") ? rule.slice(1).toUpperCase() : rule),
    );
  return labels.length > 0 ? labels.join(", ") : null;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const rules = accept
    .split(",")
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function nameFromUrl(url: string): string {
  try {
    const path = new URL(url, "http://localhost").pathname;
    const base = decodeURIComponent(path.split("/").pop() ?? "");
    return base || "Uploaded image";
  } catch {
    return "Uploaded image";
  }
}

/**
 * Shared admin drag-and-drop file upload surface.
 *
 * Three honest states, no fake progress: an idle drop zone (click-to-browse or
 * drag a file in), an indeterminate uploading state (the repo's uploads are
 * single awaited Supabase storage calls with no progress events), and an
 * uploaded state showing a compact thumbnail row with Replace/Remove actions.
 * Dropping a file onto the uploaded row replaces the current file.
 */
function FileUpload({
  onUpload,
  uploading = false,
  previewUrl,
  accept,
  onRemove,
  label,
  hint,
  multiple = false,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(
    null,
  );

  const interactive = !disabled && !uploading;
  const hintText = hint ?? acceptHint(accept);

  function openBrowser() {
    if (interactive) inputRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    if (multiple) {
      const picked = files ? Array.from(files) : [];
      if (picked.length === 0) return;
      if (!picked.every((entry) => matchesAccept(entry, accept))) {
        setRejected(true);
        return;
      }
      setRejected(false);
      setFileMeta(
        picked.length === 1
          ? { name: picked[0].name, size: picked[0].size }
          : {
              name: `${picked.length} files`,
              size: picked.reduce((total, entry) => total + entry.size, 0),
            },
      );
      onUpload(files);
      return;
    }
    const file = files?.[0];
    if (!file) return;
    if (!matchesAccept(file, accept)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    setFileMeta({ name: file.name, size: file.size });
    onUpload(files);
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current += 1;
    if (interactive) setDragActive(true);
  }

  function handleDragOver(event: React.DragEvent) {
    // Required so the browser allows dropping on this element.
    event.preventDefault();
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (!interactive) return;
    handleFiles(event.dataTransfer.files);
  }

  const displayName =
    fileMeta?.name ?? (previewUrl ? nameFromUrl(previewUrl) : null);

  return (
    <div
      data-slot="file-upload"
      className={cn("w-full", className)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        data-slot="file-upload-input"
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so re-selecting the same file fires onChange again. Safe:
          // the upload callback reads the File synchronously before this runs.
          event.target.value = "";
        }}
      />

      {uploading ? (
        <div
          data-slot="file-upload-uploading"
          className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-10"
          aria-busy="true"
        >
          <AdminLoadingDots className="shrink-0 text-lg text-muted-foreground" />
          <div className="min-w-0 text-left">
            <p className="truncate font-body text-sm font-medium text-foreground">
              Uploading{fileMeta ? ` ${fileMeta.name}` : ""}…
            </p>
            {fileMeta && (
              <p className="font-body text-xs text-muted-foreground">
                {formatBytes(fileMeta.size)}
              </p>
            )}
          </div>
        </div>
      ) : previewUrl ? (
        <div
          data-slot="file-upload-preview"
          className={cn(
            "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
            dragActive && "border-ring bg-accent/40",
          )}
        >
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
            <ResilientImage
              src={previewUrl}
              alt={label ?? "Uploaded file preview"}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-sm font-medium text-foreground">
              {displayName}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {fileMeta ? formatBytes(fileMeta.size) : "Uploaded"}
            </p>
          </div>
          <button
            type="button"
            data-slot="file-upload-replace"
            onClick={openBrowser}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-input bg-background px-3 py-2 font-body text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Replace
          </button>
          {onRemove && (
            <button
              type="button"
              data-slot="file-upload-remove"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Remove uploaded file"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-destructive focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            data-slot="file-upload-dropzone"
            onClick={openBrowser}
            disabled={disabled}
            aria-label={label}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center outline-none transition-colors",
              "hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              dragActive && "border-ring bg-accent/40",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <Upload className="size-5" aria-hidden="true" />
            </span>
            <span className="space-y-1">
              <span className="block font-body text-sm font-medium text-foreground">
                {label ?? "Upload a file"}
              </span>
              <span className="block font-body text-sm text-muted-foreground">
                Drop your file here or{" "}
                <span className="font-semibold text-foreground underline underline-offset-4">
                  browse
                </span>
              </span>
              {hintText && (
                <span className="block font-body text-xs text-muted-foreground">
                  {hintText}
                </span>
              )}
            </span>
          </button>
          {onRemove && (
            <button
              type="button"
              data-slot="file-upload-remove"
              onClick={onRemove}
              disabled={disabled}
              className="mt-2 font-body text-xs text-muted-foreground outline-none transition-colors hover:text-destructive focus-visible:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove current file
            </button>
          )}
        </>
      )}

      {rejected && (
        <p
          role="alert"
          data-slot="file-upload-error"
          className="mt-2 font-body text-xs text-destructive"
        >
          That file type isn&apos;t supported{hintText ? ` — use ${hintText}` : ""}.
        </p>
      )}
    </div>
  );
}

export default FileUpload;
