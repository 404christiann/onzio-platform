import { z } from "zod";
import { MEDIA_MAX_UPLOAD_BYTES, MEDIA_MIME_TYPES, MEDIA_RULES } from "@/lib/media-rules";
import { MEDIA_SURFACES } from "@/lib/storage-path";

/** Each kind's type and size limits come from lib/media-rules.ts; a refusal names the `mimeType` or `size` path. */
export const authorizeMediaRequestSchema = z
  .object({
    surface: z.enum(MEDIA_SURFACES),
    kind: z.enum(["photo", "graphic"]),
    fileName: z.string().trim().min(1).max(240),
    mimeType: z.enum(MEDIA_MIME_TYPES),
    size: z.number().int().positive().max(MEDIA_MAX_UPLOAD_BYTES),
  })
  .superRefine((request, context) => {
    const rules = MEDIA_RULES[request.kind];
    if (!rules.mimeTypes.includes(request.mimeType)) {
      context.addIssue({ code: "custom", path: ["mimeType"], message: "Unsupported type for this kind" });
    }
    if (request.size > rules.maxBytes) {
      context.addIssue({ code: "custom", path: ["size"], message: "Too large for this kind" });
    }
  });

export const finalizeMediaRequestSchema = z.object({
  authorization: z.string().min(40).max(8_000),
});

export const cleanupMediaRequestSchema = z.object({
  assetId: z.string().uuid(),
});

export type AuthorizeMediaRequest = z.infer<
  typeof authorizeMediaRequestSchema
>;
