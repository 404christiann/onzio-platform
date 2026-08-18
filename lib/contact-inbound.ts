import { z } from "zod";

/**
 * Pure validation and message-shaping core for the public contact form
 * (`app/api/contact/route.ts`). Template-agnostic: any club/template may POST
 * the same payload shape. Tenant identity, recipient resolution, and the
 * actual Resend send live in the route; nothing here touches the network or
 * the database, so this module is directly unit-testable.
 */

/**
 * Honeypot field name. The public form renders this as a visually hidden
 * input that humans never fill; automated form-stuffers do. A non-empty
 * value is silently accepted-and-dropped upstream — the bot sees the same
 * success response as a real submitter, and no email is sent. Exported so
 * form components submit the exact field name this module inspects.
 */
export const CONTACT_HONEYPOT_FIELD = "website";

const contactInboundSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(50).optional(),
  message: z.string().trim().min(1).max(5000),
});

export type ContactInbound = Omit<
  z.infer<typeof contactInboundSchema>,
  "phone"
> & { phone?: string };

export type ContactInboundResult =
  | { outcome: "accepted"; submission: ContactInbound }
  /**
   * Honeypot tripped. The caller must respond exactly as it would for a
   * real success (never an error) and must not send anything.
   */
  | { outcome: "dropped" }
  | { outcome: "invalid"; message: string };

export function parseContactInbound(value: unknown): ContactInboundResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { outcome: "invalid", message: "Contact submission must be an object" };
  }
  const record = value as Record<string, unknown>;

  // Checked before schema validation so a bot-filled payload is dropped even
  // when its other fields would also have failed validation — a validation
  // error would tell the bot its submission was inspected.
  const honeypot = record[CONTACT_HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { outcome: "dropped" };
  }

  const parsed = contactInboundSchema.safeParse(record);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: "invalid",
      message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid contact submission",
    };
  }
  const { phone, ...submission } = parsed.data;
  return {
    outcome: "accepted",
    submission: phone ? { ...submission, phone } : submission,
  };
}

export type ContactOutboundMessage = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};

/**
 * Shapes the outbound notification email. `replyTo` is the submitter's own
 * address so the club can answer an inquiry directly from their inbox; the
 * `from` address stays the platform's verified Resend sender.
 */
export function buildContactOutboundMessage(input: {
  clubName: string;
  from: string;
  to: string;
  submission: ContactInbound;
}): ContactOutboundMessage {
  const { submission } = input;
  return {
    from: input.from,
    to: input.to,
    replyTo: submission.email,
    subject: `New inquiry — ${input.clubName}`,
    text: [
      `Name: ${submission.firstName} ${submission.lastName}`,
      `Email: ${submission.email}`,
      `Phone: ${submission.phone ?? "Not provided"}`,
      "",
      submission.message,
    ].join("\n"),
  };
}
