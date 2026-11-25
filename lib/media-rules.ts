/**
 * The one place admin image upload limits are defined. Client hints and pickers, the authorize request
 * schema and route, finalize validation and sharp processing all read these rules, so a field can never
 * promise a file the server refuses. tests/architecture/media-rules-single-source.test.ts fails when a limit
 * is written anywhere else.
 *
 * The database keeps its own copy (media_upload_reservations claimed_size checks and media_assets width and
 * height checks); tests/contracts/media-rules.test.ts checks that these values still match it.
 *
 * Client-safe: no sharp, no server imports.
 */
export type MediaKind = "photo" | "graphic";
export type MediaMimeType = "image/jpeg" | "image/png" | "image/webp";
export type MediaExtension = "jpg" | "jpeg" | "png" | "webp";

export type MediaKindRules = {
  /** Types the picker accepts and the server decodes. */
  mimeTypes: readonly MediaMimeType[];
  /** File name extensions that may carry those types. */
  extensions: readonly MediaExtension[];
  /** Largest upload, in bytes. */
  maxBytes: number;
  /** Largest source width or height, in pixels. */
  maxDimension: number;
  /** Largest source width x height. */
  maxPixels: number;
  /** Stored images are shrunk to fit this many pixels on the long edge. */
  outputLongEdge: number;
  /** Formats the stored image may have. */
  outputFormats: readonly ("webp" | "png")[];
  /** libvips strictness: photos refuse any warning, graphics only real decode errors (16-bit and odd PNG exports). */
  failOn: "warning" | "error";
};

const MEBIBYTE = 1024 * 1024;

export const MEDIA_RULES: Readonly<Record<MediaKind, MediaKindRules>> = {
  photo: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    maxBytes: 15 * MEBIBYTE,
    maxDimension: 6000,
    maxPixels: 36_000_000,
    outputLongEdge: 2400,
    outputFormats: ["webp"],
    failOn: "warning",
  },
  graphic: {
    mimeTypes: ["image/png", "image/webp"],
    extensions: ["png", "webp"],
    maxBytes: 5 * MEBIBYTE,
    maxDimension: 6000,
    maxPixels: 36_000_000,
    outputLongEdge: 2400,
    outputFormats: ["png", "webp"],
    failOn: "error",
  },
};

/** Every type any kind accepts, for the outer request schema. */
export const MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const satisfies readonly MediaMimeType[];

/** The largest upload of any kind, for the outer request schema. */
export const MEDIA_MAX_UPLOAD_BYTES = Math.max(MEDIA_RULES.photo.maxBytes, MEDIA_RULES.graphic.maxBytes);

/** Width/height and pixel ceilings shared by both kinds (media_assets allows up to 6000 per side). */
export const MEDIA_MAX_DIMENSION = Math.max(MEDIA_RULES.photo.maxDimension, MEDIA_RULES.graphic.maxDimension);
export const MEDIA_MAX_PIXELS = Math.max(MEDIA_RULES.photo.maxPixels, MEDIA_RULES.graphic.maxPixels);

const TYPE_LABELS: Record<MediaMimeType, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** "JPG, PNG or WebP" */
export function mediaTypesLabel(mimeTypes: readonly MediaMimeType[]): string {
  const names = mimeTypes.map((type) => TYPE_LABELS[type]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names.join("");
}

/** "5 MB", "1.5 MB" */
export function megabytesLabel(bytes: number): string {
  const megabytes = bytes / MEBIBYTE;
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

/** The hint under an upload field: "PNG or WebP up to 5 MB", optionally with the pixel ceiling. */
export function mediaHint(kind: MediaKind, options: { pixels?: boolean } = {}): string {
  const rules = MEDIA_RULES[kind];
  const base = `${mediaTypesLabel(rules.mimeTypes)} up to ${megabytesLabel(rules.maxBytes)}`;
  return options.pixels ? `${base}, at most ${rules.maxDimension} pixels on each side` : base;
}

/** The picker `accept` value for a kind. */
export function mediaAccept(kind: MediaKind): string {
  return MEDIA_RULES[kind].mimeTypes.join(",");
}

export function isMediaKind(value: unknown): value is MediaKind {
  return value === "photo" || value === "graphic";
}
