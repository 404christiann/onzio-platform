import {
  getRegistrationEmailClient,
  type RegistrationEmailClient,
} from "@/lib/email/resend-client";

const DEFAULT_FROM = "Onzio Billing <billing@auth.onziofutbol.com>";

export type OperatorEmail = {
  subject: string;
  text: string;
  /** Resend idempotency key; the same key never sends twice within Resend's window. */
  idempotencyKey: string;
  /** Used only to label log lines. Never log recipients, keys or email bodies. */
  clubSlug?: string | null;
};

export function getOperatorNotifyConfig(): {
  apiKey: string;
  to: string;
  from: string;
} | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.OPERATOR_NOTIFY_EMAIL?.trim();
  if (!apiKey || !to) return null;
  return {
    apiKey,
    to,
    from: process.env.OPERATOR_NOTIFY_FROM?.trim() || DEFAULT_FROM,
  };
}

function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, string | null | undefined>,
) {
  console[level](JSON.stringify({ event, ...fields }));
}

export function logOperatorNotifySkipped(clubSlug: string | null = null) {
  log("info", "operator_notify.skipped", { clubSlug });
}

/** Sends an operator email. Never throws: billing paths must not fail on email. */
export async function sendOperatorEmail(
  email: OperatorEmail,
  options: { client?: RegistrationEmailClient } = {},
): Promise<"sent" | "skipped" | "failed"> {
  const clubSlug = email.clubSlug ?? null;
  const config = getOperatorNotifyConfig();
  if (!config) {
    logOperatorNotifySkipped(clubSlug);
    return "skipped";
  }
  try {
    const client = options.client ?? getRegistrationEmailClient(config.apiKey);
    const result = await client.emails.send(
      {
        from: config.from,
        to: config.to,
        subject: email.subject,
        text: email.text,
      },
      { idempotencyKey: email.idempotencyKey },
    );
    if (result?.error) {
      log("error", "operator_notify.failed", {
        clubSlug,
        code: String((result.error as { name?: string }).name ?? "RESEND_ERROR"),
      });
      return "failed";
    }
    return "sent";
  } catch (error) {
    log("error", "operator_notify.failed", {
      clubSlug,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return "failed";
  }
}
