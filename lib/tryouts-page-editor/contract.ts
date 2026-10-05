import { z } from "zod";
import { isAllowedPublicHref } from "@/lib/public-link";

const uuid = z.string().uuid();
const optionalText = (maximum: number) => z.string().max(maximum);

export const tryoutsPageEventSchema = z.object({
  id: uuid.nullable(),
  program_id: uuid.nullable(),
  status: z.enum(["upcoming", "open", "closed"]),
  eyebrow: optionalText(80),
  headline: optionalText(80),
  intro: optionalText(320),
  hero_media_asset_id: uuid.nullable(),
  eligibility_copy: optionalText(2000),
  what_to_expect_copy: optionalText(2000),
  preparation_copy: optionalText(2000),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  location: optionalText(160),
  cost_text: optionalText(120),
  cta_label: optionalText(40),
  registration_href: optionalText(2048).refine(isAllowedPublicHref),
  registration_form_id: uuid.nullable(),
  closed_message: optionalText(320),
  sort_order: z.number().int().min(0),
}).strict();

export const tryoutsPageSaveSchema = z.object({
  operationId: uuid,
  expectedRevision: z.string().regex(/^\d+$/).max(20),
  page: z.object({
    intro_with_tryouts: optionalText(320),
    intro_no_tryouts: optionalText(320),
  }).strict().nullable(),
  events: z.array(tryoutsPageEventSchema).max(500),
  deletedIds: z.array(uuid).max(500),
}).strict().superRefine((value, context) => {
  const ids = value.events.map((event) => event.id).filter(Boolean);
  if (new Set(ids).size !== ids.length ||
      new Set(value.deletedIds).size !== value.deletedIds.length ||
      value.deletedIds.some((id) => ids.includes(id)) ||
      value.events.some((event, index) => event.sort_order !== index)) {
    context.addIssue({ code: "custom", message: "Event identities or order are invalid." });
  }
});

export type TryoutsPageSaveRequest = z.infer<typeof tryoutsPageSaveSchema>;
