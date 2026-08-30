import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { failContract } from "@/lib/contract-error";

const DELIVERY_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.delivery_delayed",
]);
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failContract("INVALID_RESEND_EVENT");
  }
  return value as Record<string, unknown>;
}

function signingKey(secret: unknown): Buffer {
  if (typeof secret !== "string" || !secret.startsWith("whsec_")) {
    failContract("RESEND_WEBHOOK_CONFIGURATION_INVALID");
  }
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  if (key.length === 0) failContract("RESEND_WEBHOOK_CONFIGURATION_INVALID");
  return key;
}

export function verifyResendWebhook(input: {
  payload?: unknown;
  webhookId?: unknown;
  webhookTimestamp?: unknown;
  webhookSignature?: unknown;
  secret?: unknown;
  now?: unknown;
}): Record<string, unknown> {
  if (
    typeof input.payload !== "string" ||
    typeof input.webhookId !== "string" ||
    typeof input.webhookTimestamp !== "string" ||
    typeof input.webhookSignature !== "string"
  ) {
    failContract("INVALID_RESEND_SIGNATURE");
  }
  const timestamp = Number(input.webhookTimestamp);
  const now = input.now instanceof Date ? input.now : new Date();
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isFinite(now.getTime()) ||
    Math.abs(Math.floor(now.getTime() / 1000) - timestamp) >
      MAX_CLOCK_SKEW_SECONDS
  ) {
    failContract("INVALID_RESEND_SIGNATURE");
  }

  const expected = createHmac("sha256", signingKey(input.secret))
    .update(`${input.webhookId}.${input.webhookTimestamp}.${input.payload}`)
    .digest();
  const signatures = input.webhookSignature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => Buffer.from(part.slice(3), "base64"));
  if (
    !signatures.some(
      (candidate) =>
        candidate.length === expected.length && timingSafeEqual(candidate, expected),
    )
  ) {
    failContract("INVALID_RESEND_SIGNATURE");
  }

  try {
    return record(JSON.parse(input.payload));
  } catch {
    failContract("INVALID_RESEND_EVENT");
  }
}

export function sanitizeResendEvent(
  eventValue: Record<string, unknown>,
  deliveryId: string,
): {
  id: string;
  eventType: string;
  occurredAt: string;
  providerEmailId: string;
  payloadDigest: string;
} {
  const event = record(eventValue);
  const data = record(event.data);
  if (
    typeof deliveryId !== "string" ||
    !deliveryId ||
    typeof event.type !== "string" ||
    !DELIVERY_EVENTS.has(event.type) ||
    typeof event.created_at !== "string" ||
    !Number.isFinite(Date.parse(event.created_at)) ||
    typeof data.email_id !== "string" ||
    !data.email_id
  ) {
    failContract("INVALID_RESEND_EVENT");
  }
  return {
    id: deliveryId,
    eventType: event.type,
    occurredAt: new Date(event.created_at).toISOString(),
    providerEmailId: data.email_id,
    payloadDigest: createHash("sha256")
      .update(JSON.stringify(event))
      .digest("hex"),
  };
}

export function isMonitoredResendEvent(type: unknown): boolean {
  return typeof type === "string" && DELIVERY_EVENTS.has(type);
}
