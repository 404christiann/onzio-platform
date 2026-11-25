import { MEDIA_RULES, mediaAccept, mediaHint, mediaTypesLabel, megabytesLabel, type MediaKind, type MediaMimeType } from "@/lib/media-rules";

export type AdminImageMime = MediaMimeType;

export type AdminImageRules = {
  allowedTypes: readonly AdminImageMime[];
  maxBytes: number;
};

/** The picker rules for a media kind, straight from lib/media-rules.ts. */
export function adminImageRules(kind: MediaKind): AdminImageRules {
  return { allowedTypes: MEDIA_RULES[kind].mimeTypes, maxBytes: MEDIA_RULES[kind].maxBytes };
}

/**
 * `accept`, `maxBytes` and `hint` for a `FileUpload` that uploads to a media bucket of this kind, straight
 * from lib/media-rules.ts: `<FileUpload {...fileUploadRules("photo")} />`.
 */
export function fileUploadRules(kind: MediaKind, options: { pixels?: boolean } = {}) {
  return { accept: mediaAccept(kind), maxBytes: MEDIA_RULES[kind].maxBytes, hint: mediaHint(kind, options) };
}

const SUPPORTED: readonly string[] = MEDIA_RULES.photo.mimeTypes;

export function imageAccept(rules: AdminImageRules) {
  return rules.allowedTypes.join(",");
}

export function imageHint(rules: AdminImageRules) {
  return `${mediaTypesLabel(rules.allowedTypes)} up to ${megabytesLabel(rules.maxBytes)}`;
}

function readableImage(file: File) {
  return new Promise<boolean>((resolve) => {
    let url: string;
    try { url = URL.createObjectURL(file); } catch { resolve(false); return; }
    const image = new Image();
    let finished = false;
    const done = (valid: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
      resolve(valid);
    };
    const timeout = window.setTimeout(() => done(false), 10000);
    image.onload = () => done(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => done(false);
    try { image.src = url; } catch { done(false); }
  });
}

export async function imageFileIssue(file: File, rules: AdminImageRules): Promise<string | null> {
  if (!SUPPORTED.includes(file.type) || !rules.allowedTypes.includes(file.type as AdminImageMime)) {
    return `“${file.name}” is not a supported image. Use ${mediaTypesLabel(rules.allowedTypes)}.`;
  }
  if (file.size > rules.maxBytes) {
    return `“${file.name}” is too large. The limit is ${megabytesLabel(rules.maxBytes)}.`;
  }
  if (file.size === 0 || !(await readableImage(file))) {
    return `“${file.name}” is not a readable image.`;
  }
  return null;
}

