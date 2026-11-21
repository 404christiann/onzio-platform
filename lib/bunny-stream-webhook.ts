import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bunny Stream encode webhook (https://bunny.net/docs/stream/webhooks).
 * The signature is HMAC-SHA256 of the exact raw body, keyed with the library
 * Read-Only API key, lowercase hex. The version and algorithm headers are required.
 * The webhook status numbers are not the video object's status numbers.
 */

export const BUNNY_STREAM_SIGNATURE_VERSION = "v1";
export const BUNNY_STREAM_SIGNATURE_ALGORITHM = "hmac-sha256";

export type BunnyStreamWebhookEvent = {
  videoLibraryId: number;
  videoGuid: string;
  status: number;
  isLiveStream: boolean;
};

export type BunnyStreamWebhookAction = "finalize" | "fail" | "preparing" | "ignore";

export function verifyBunnyStreamSignature(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
  secret: string | null | undefined;
}): boolean {
  const { rawBody, signature, version, algorithm, secret } = input;
  if (!secret || version !== BUNNY_STREAM_SIGNATURE_VERSION || algorithm !== BUNNY_STREAM_SIGNATURE_ALGORITHM) return false;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/** Webhook status list from Bunny's Stream webhook docs. */
export function classifyBunnyStreamStatus(status: number): BunnyStreamWebhookAction {
  if (status === 3) return "finalize";
  if (status === 5 || status === 8) return "fail";
  if (status === 0 || status === 1 || status === 2 || status === 4 || status === 7) return "preparing";
  return "ignore";
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseBunnyStreamWebhook(rawBody: string): BunnyStreamWebhookEvent | null {
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return null; }
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const library = record.VideoLibraryId;
  const guid = record.VideoGuid;
  const status = record.Status;
  if (typeof library !== "number" || !Number.isInteger(library)) return null;
  if (typeof guid !== "string" || !GUID.test(guid)) return null;
  if (typeof status !== "number" || !Number.isInteger(status)) return null;
  return { videoLibraryId: library, videoGuid: guid, status, isLiveStream: record.IsLiveStreamWebhook === true };
}
