import { z } from "zod";
import { MEDIA_SURFACES } from "@/lib/storage-path";

export const authorizeMediaRequestSchema = z.object({
  surface: z.enum(MEDIA_SURFACES),
  kind: z.enum(["photo", "graphic"]),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(15 * 1024 * 1024),
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
