/**
 * Graphic uploads (club logos, sponsor logos and other `graphic` buckets) are
 * PNG or WebP only: graphics keep transparency and crisp edges, so the media
 * server rejects JPEG for them. Admin pickers and their copy read this list so
 * they never promise a type the server refuses.
 */
export const GRAPHIC_UPLOAD_MIME_TYPES = ["image/png", "image/webp"] as const;

export const GRAPHIC_UPLOAD_ACCEPT = GRAPHIC_UPLOAD_MIME_TYPES.join(",");

export const GRAPHIC_UPLOAD_TYPES_LABEL = "PNG or WebP";

export function isGraphicUploadType(mimeType: string): boolean {
  return (GRAPHIC_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}
