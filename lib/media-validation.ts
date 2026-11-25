import sharp from "sharp";
import { failContract } from "@/lib/contract-error";
import { MEDIA_MAX_DIMENSION, MEDIA_MAX_PIXELS, MEDIA_RULES, type MediaKind } from "@/lib/media-rules";

export type { MediaKind } from "@/lib/media-rules";
export type DetectedMediaFormat = "jpeg" | "png" | "webp";

export type MediaUploadMetadata = {
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  kind: MediaKind;
};

export type ValidatedMedia = {
  safe: true;
  format: DetectedMediaFormat;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  byteSize: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  kind: MediaKind;
};

/** Kept for existing importers; the values live in lib/media-rules.ts. */
export const MAXIMUM_MEDIA_DIMENSION = MEDIA_MAX_DIMENSION;
export const MAXIMUM_MEDIA_PIXELS = MEDIA_MAX_PIXELS;

const FORMAT_MIME = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

function detectFormat(bytes: Buffer): DetectedMediaFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function looksLikeCorruptClaimedImage(
  bytes: Buffer,
  claimedMime: string,
): boolean {
  if (
    claimedMime === "image/png" &&
    bytes.length > 0 &&
    bytes[0] === 0x89 &&
    bytes.subarray(1, Math.min(bytes.length, 4)).toString("ascii") ===
      "PNG".slice(0, Math.max(0, Math.min(bytes.length - 1, 3)))
  ) {
    return true;
  }
  return claimedMime === "image/jpeg" && bytes[0] === 0xff;
}

function parseWebpDimensions(bytes: Buffer): {
  width: number;
  height: number;
} | null {
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 " && bytes.length >= 30) {
    const marker = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (marker >= 0 && bytes.length >= marker + 7) {
      return {
        width: bytes.readUInt16LE(marker + 3) & 0x3fff,
        height: bytes.readUInt16LE(marker + 5) & 0x3fff,
      };
    }
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

function normalizedExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

export function validateClaimedMetadata(metadata: MediaUploadMetadata): void {
  if (
    !metadata ||
    typeof metadata.fileName !== "string" ||
    typeof metadata.mimeType !== "string" ||
    !Number.isSafeInteger(metadata.size) ||
    metadata.size <= 0 ||
    (metadata.kind !== "photo" && metadata.kind !== "graphic")
  ) {
    failContract("INVALID_MEDIA_METADATA");
  }

  const rules = MEDIA_RULES[metadata.kind];
  const extension = normalizedExtension(metadata.fileName);
  if (
    !(rules.extensions as readonly string[]).includes(extension) ||
    !(rules.mimeTypes as readonly string[]).includes(metadata.mimeType)
  ) {
    failContract("UNSUPPORTED_MEDIA_TYPE");
  }

  if (metadata.size > rules.maxBytes) failContract("FILE_TOO_LARGE");

  if (
    (metadata.width !== undefined &&
      (!Number.isSafeInteger(metadata.width) ||
        metadata.width <= 0 ||
        metadata.width > rules.maxDimension)) ||
    (metadata.height !== undefined &&
      (!Number.isSafeInteger(metadata.height) ||
        metadata.height <= 0 ||
        metadata.height > rules.maxDimension))
  ) {
    failContract("DIMENSIONS_TOO_LARGE");
  }
}

/** sharp refuses an image over limitInputPixels with this message rather than a typed error. */
export function exceedsPixelLimit(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

export async function validateMediaUpload(input: {
  bytes: Buffer;
  metadata: MediaUploadMetadata | Record<string, unknown>;
}): Promise<ValidatedMedia> {
  if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0) {
    failContract("CORRUPT_IMAGE");
  }

  const metadata = input.metadata as MediaUploadMetadata;
  validateClaimedMetadata(metadata);

  const rules = MEDIA_RULES[metadata.kind];
  if (input.bytes.length > rules.maxBytes) failContract("FILE_TOO_LARGE");
  const format = detectFormat(input.bytes);
  if (!format) {
    if (looksLikeCorruptClaimedImage(input.bytes, metadata.mimeType)) {
      failContract("CORRUPT_IMAGE");
    }
    failContract("SIGNATURE_MISMATCH");
  }

  if (FORMAT_MIME[format] !== metadata.mimeType) {
    failContract("SIGNATURE_MISMATCH");
  }
  const extension = normalizedExtension(metadata.fileName);
  const formatMatchesExtension =
    format === "jpeg"
      ? extension === "jpg" || extension === "jpeg"
      : extension === format;
  if (!formatMatchesExtension) failContract("SIGNATURE_MISMATCH");
  if (!(rules.mimeTypes as readonly string[]).includes(FORMAT_MIME[format])) {
    failContract("UNSUPPORTED_MEDIA_TYPE");
  }

  let imageMetadata: {
    format?: string;
    width?: number;
    height?: number;
    hasAlpha?: boolean;
  };
  try {
    imageMetadata = await sharp(input.bytes, {
      failOn: rules.failOn,
      limitInputPixels: rules.maxPixels,
    }).metadata();
  } catch (error) {
    if (exceedsPixelLimit(error)) failContract("DIMENSIONS_TOO_LARGE");
    const webpDimensions =
      format === "webp" ? parseWebpDimensions(input.bytes) : null;
    if (!webpDimensions) failContract("CORRUPT_IMAGE");
    imageMetadata = {
      format: "webp",
      width: webpDimensions.width,
      height: webpDimensions.height,
      hasAlpha: false,
    };
  }

  const width = imageMetadata.width;
  const height = imageMetadata.height;
  if (!width || !height) failContract("CORRUPT_IMAGE");

  if (
    width > rules.maxDimension ||
    height > rules.maxDimension ||
    width * height > rules.maxPixels
  ) {
    failContract("DIMENSIONS_TOO_LARGE");
  }

  return {
    safe: true,
    format,
    mimeType: FORMAT_MIME[format],
    extension: format === "jpeg" ? "jpg" : format,
    byteSize: input.bytes.length,
    width,
    height,
    hasAlpha: imageMetadata.hasAlpha === true,
    kind: metadata.kind,
  };
}
