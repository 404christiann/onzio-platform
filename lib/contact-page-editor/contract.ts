import { z } from "zod";
import { isValidPublicEmail, isValidPublicPhone } from "@/lib/contact-admin";
import type { DBSiteSocialLink } from "@/lib/db-types";

export const contactEditorSaveSchema = z.object({
  operationId: z.string().uuid(),
  expectedRevision: z.string().regex(/^\d+$/).max(20),
  profile: z.object({
    public_email: z.string().max(254).refine(isValidPublicEmail),
    public_phone: z.string().max(40).refine(isValidPublicPhone),
    service_area: z.string().max(120),
    hours: z.string().max(200),
  }).strict(),
  page: z.object({
    eyebrow: z.string().max(80),
    headline: z.string().max(80),
    intro: z.string().max(320),
    hero_media_asset_id: z.string().uuid().nullable(),
  }).strict(),
}).strict();

export type ContactEditorSaveRequest = z.infer<typeof contactEditorSaveSchema>;
export type ContactEditorSnapshot = {
  revision: string;
  profile: ContactEditorSaveRequest["profile"] | null;
  page: ContactEditorSaveRequest["page"] | null;
  heroMediaUrl?: string;
  socialLinks?: DBSiteSocialLink[];
  operation?: { status: "not-committed" } | {
    status: "committed";
    receipt: ContactEditorSnapshot & { retiredMediaAssetIds?: string[] };
  };
  retiredMediaAssetIds?: string[];
};
