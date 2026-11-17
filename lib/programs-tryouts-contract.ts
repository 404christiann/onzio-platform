import { z } from "zod";
import { isAllowedPublicHref } from "@/lib/public-link";

// ADMIN-RE-12c: what the "Programs and tryouts" page may ask
// POST /api/admin/programs-and-tryouts to do. Each request carries an
// operation id, so a retried request returns the first answer instead of
// running twice (onzio_private.sign_up_settings_receipts). Limits match the
// table checks (tryouts: name 80, place 160, cost note 120, button 40; links
// 2048) so a bad value is refused here with a plain message.

const uuid = z.string().uuid();
const stamp = z.string().min(1).max(64);
const link = z.string().max(2048).refine(isAllowedPublicHref);

export const TRYOUT_LIMITS = { name: 80, place: 160, costNote: 120, buttonLabel: 40 } as const;

export const tryoutSettingsSchema = z.object({
  headline: z.string().trim().min(1).max(TRYOUT_LIMITS.name),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  location: z.string().max(TRYOUT_LIMITS.place),
  cost_text: z.string().max(TRYOUT_LIMITS.costNote),
  cta_label: z.string().max(TRYOUT_LIMITS.buttonLabel),
  registration_href: link,
  registration_form_id: uuid.nullable(),
  sign_up_by_contact: z.boolean(),
  closed: z.boolean(),
  hidden: z.boolean(),
  stays_open_after_date: z.boolean(),
}).strict();

export const programSignUpSchema = z.object({
  external_cta_label: z.string().max(40),
  external_cta_href: link,
  registration_form_id: uuid.nullable(),
  sign_up_by_contact: z.boolean(),
  sign_ups_closed: z.boolean(),
  hidden: z.boolean(),
}).strict();

export const programsTryoutsRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save-tryout"),
    operationId: uuid,
    id: uuid.nullable(),
    expectedUpdatedAt: stamp.nullable(),
    tryout: tryoutSettingsSchema,
  }).strict(),
  z.object({
    action: z.literal("save-program"),
    operationId: uuid,
    id: uuid,
    expectedUpdatedAt: stamp,
    program: programSignUpSchema,
  }).strict(),
  z.object({
    action: z.literal("copy"),
    operationId: uuid,
    kind: z.enum(["program", "tryout"]),
    id: uuid,
  }).strict(),
  z.object({
    action: z.literal("delete-tryout"),
    operationId: uuid,
    id: uuid,
    expectedUpdatedAt: stamp,
  }).strict(),
  z.object({
    action: z.literal("move-program"),
    operationId: uuid,
    id: uuid,
    direction: z.enum(["up", "down"]),
  }).strict(),
]).superRefine((value, context) => {
  if (value.action === "save-tryout" && (value.id === null) !== (value.expectedUpdatedAt === null)) {
    context.addIssue({ code: "custom", path: ["expectedUpdatedAt"], message: "A change needs the row's last save." });
  }
});

export type ProgramsTryoutsRequest = z.infer<typeof programsTryoutsRequestSchema>;
export type TryoutSettings = z.infer<typeof tryoutSettingsSchema>;
export type ProgramSignUpSettings = z.infer<typeof programSignUpSchema>;

/** Plain words for every refusal the page can show. */
export const PROGRAMS_TRYOUTS_MESSAGES: Record<string, string> = {
  INVALID_SIGN_UP_PAYLOAD: "Check what you typed and try again.",
  INVALID_SIGN_UP_FORM: "That sign-up form isn't available any more. Pick another.",
  SIGN_UP_FORM_IN_USE: "That sign-up form is already used by another program or tryout. Copy the form to reuse it.",
  CONTENT_CHANGED: "Someone else changed this just now. Refresh to see the latest, then try again.",
  OPERATION_REUSED: "We couldn't confirm that change. Refresh to check it.",
  TRYOUT_LIMIT: "You have 500 tryouts, the most a club can have. Delete an old one first.",
  PROGRAM_LIMIT: "You have 200 programs, the most a club can have.",
  COPY_UNAVAILABLE: "Your website's programs are set up by Onzio. Contact us to add one.",
  SECTION_UNAVAILABLE: "Your website doesn't have this page.",
  NOT_AUTHORIZED: "You no longer have permission to change this.",
  DATABASE_OPERATION_FAILED: "That didn't save. Try again.",
};
