import { MEDIA_MIME_TYPES, mediaTypesLabel, megabytesLabel, type MediaMimeType } from "@/lib/media-rules";

const ACCEPT_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/svg+xml": "SVG",
  "image/*": "Images",
};

/** A readable list of what an `accept` value takes, or null when there is no filter. */
export function acceptHint(accept?: string): string | null {
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

/** The types an `accept` value takes, in the media rules wording (mediaTypesLabel) when it lists only media types. */
function acceptTypesLabel(accept?: string): string | null {
  const rules = (accept ?? "").split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  const media = rules.filter((rule): rule is MediaMimeType => (MEDIA_MIME_TYPES as readonly string[]).includes(rule));
  if (rules.length > 0 && media.length === rules.length) return mediaTypesLabel(media);
  return acceptHint(accept);
}

/** Whether a file's type or extension is allowed by an `accept` value. No filter allows everything. */
export function matchesAccept(file: Pick<File, "type" | "name">, accept?: string): boolean {
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

export type FileUploadIssueOptions = {
  /** The same value the file input's `accept` takes. */
  accept?: string;
  /** Largest file in bytes. When omitted there is no size check. */
  maxBytes?: number;
  /** What to tell the person a file may be, after "use". Defaults to a label derived from `accept`. */
  hint?: string | null;
};

/**
 * Why a picked or dropped file cannot be uploaded, or null when it can. The type check comes first, then
 * the size check, so the message names the first thing the person has to fix.
 */
export function fileUploadIssue(
  file: Pick<File, "type" | "name" | "size">,
  { accept, maxBytes, hint }: FileUploadIssueOptions = {},
): string | null {
  if (!matchesAccept(file, accept)) {
    // Name the file and only the types; the size belongs to the size message, not to "use …".
    const shown = acceptTypesLabel(accept) ?? hint;
    return `“${file.name}” is not a supported file${shown ? `. Use ${shown}` : ""}.`;
  }
  if (maxBytes !== undefined && file.size > maxBytes) {
    return `“${file.name}” is too large. The limit is ${megabytesLabel(maxBytes)}.`;
  }
  return null;
}
