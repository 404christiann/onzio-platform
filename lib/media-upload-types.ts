import { MEDIA_RULES, mediaAccept, mediaTypesLabel, megabytesLabel } from "@/lib/media-rules";

/**
 * Graphic uploads (club logos, sponsor logos and other `graphic` buckets) take
 * fewer types than photos: graphics keep transparency and crisp edges, so the
 * media server rejects JPEG for them. Admin pickers and their copy read these
 * values so they never promise a type or size the server refuses. The values
 * themselves live in lib/media-rules.ts.
 */
export const GRAPHIC_UPLOAD_MIME_TYPES = MEDIA_RULES.graphic.mimeTypes;

export const GRAPHIC_UPLOAD_ACCEPT = mediaAccept("graphic");

export const GRAPHIC_UPLOAD_TYPES_LABEL = mediaTypesLabel(GRAPHIC_UPLOAD_MIME_TYPES);

/** The largest graphic upload, in bytes, for pickers that check size before uploading. */
export const GRAPHIC_UPLOAD_MAX_BYTES = MEDIA_RULES.graphic.maxBytes;

/** The size limit as copy ("N MB"), for sentences like `${GRAPHIC_UPLOAD_TYPES_LABEL}, up to ${GRAPHIC_UPLOAD_MAX_SIZE_LABEL}`. */
export const GRAPHIC_UPLOAD_MAX_SIZE_LABEL = megabytesLabel(MEDIA_RULES.graphic.maxBytes);

export function isGraphicUploadType(mimeType: string): boolean {
  return (GRAPHIC_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}
